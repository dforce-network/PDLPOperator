// scripts/simulate.js
// Usage: node scripts/simulate.js <chainId>
//
// Full local simulation of the PDLP cleanup flow:
//   1. Starts an Anvil fork of the target chain
//   2. Installs the REAL operator impl (e.g. ArbiOperator) by etching its runtime
//      bytecode via anvil_setCode, then upgrades each proxy to it
//   3. Impersonates the live proxyAdmin owner (EOA or Timelock) for the upgrade
//   4. Impersonates the whitelist user to call operator.approve(token)
//   5. Verifies allowance is max
//   6. Burns all operator token balance via IMSD(token).burn(operator, balance)
//   7. Verifies balance is zero
//   8. Kills Anvil and prints summary
//
// Prerequisites:
//   - `anvil` in PATH (install: https://getfoundry.sh)
//   - `forge build` already run (needs out/<Operator>.sol/<Operator>.json)
//   - RPC env var set (e.g. BSC_RPC=https://...)
//
// Example:
//   node scripts/simulate.js 42161   # simulate Arbitrum
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  TOKENS, WHITELIST_CANDIDATES, RPC_KEYS, CHAIN_NAMES,
  OPERATOR_KEYS, OPERATOR_TOKENS, loadDeployment,
} = require("./config");

const ANVIL_PORT = 18545; // use non-standard port to avoid conflicts
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;

// ─── Artifact loader ────────────────────────────────────────────────────────

// Return the runtime (deployed) bytecode of a contract from the Foundry out/ dir.
// We use runtime bytecode because a proxy never runs the impl constructor — etching
// the runtime code via anvil_setCode installs exactly what the upgraded proxy executes,
// and avoids the real operators' constructor arg/validation requirements.
function loadDeployedBytecode(contractName) {
  const file = path.join(__dirname, `../out/${contractName}.sol/${contractName}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Artifact not found for ${contractName} at ${file}. Run 'forge build' first.`
    );
  }
  const artifact = JSON.parse(fs.readFileSync(file, "utf-8"));
  const runtime = artifact.deployedBytecode && artifact.deployedBytecode.object;
  if (!runtime || runtime === "0x") {
    throw new Error(`No deployedBytecode for ${contractName}`);
  }
  return runtime;
}

// ─── Anvil lifecycle ─────────────────────────────────────────────────────────

async function startAnvil(rpcUrl) {
  return new Promise((resolve, reject) => {
    const anvil = spawn("anvil", [
      "--fork-url", rpcUrl,
      "--port", ANVIL_PORT.toString(),
      "--silent",
    ]);

    anvil.on("error", (err) => reject(new Error(`Failed to start Anvil: ${err.message}`)));

    const provider = new ethers.providers.JsonRpcProvider(ANVIL_URL);
    let attempts = 0;
    const poll = setInterval(async () => {
      try {
        await provider.getBlockNumber();
        clearInterval(poll);
        resolve({ anvil, provider });
      } catch {
        if (++attempts > 40) {
          clearInterval(poll);
          anvil.kill();
          reject(new Error("Anvil failed to start after 20s"));
        }
      }
    }, 500);
  });
}

// ─── Impersonation helpers ───────────────────────────────────────────────────

async function impersonate(provider, address) {
  await provider.send("anvil_impersonateAccount", [address]);
  // Top up with 5 ETH so it can pay gas
  await provider.send("anvil_setBalance", [
    address,
    ethers.utils.hexValue(ethers.utils.parseEther("5")),
  ]);
  return provider.getSigner(address);
}

// ─── Main simulation ─────────────────────────────────────────────────────────

async function simulate(chainId) {
  const rpcUrl = process.env[RPC_KEYS[chainId]];
  if (!rpcUrl) {
    console.log(`[Chain ${chainId}] SKIP — set ${RPC_KEYS[chainId]} in .env`);
    return;
  }

  const deployment = loadDeployment(chainId);
  if (!deployment) {
    console.log(`[Chain ${chainId}] SKIP — no deployment file`);
    return;
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`Simulating Chain ${chainId} (${CHAIN_NAMES[chainId]})`);
  console.log(`${"=".repeat(64)}`);
  console.log("Starting Anvil fork...");

  const { anvil, provider } = await startAnvil(rpcUrl);
  const block = await provider.getBlockNumber();
  console.log(`Anvil ready — fork at block ${block}\n`);

  try {
    // ── ProxyAdmin setup ──────────────────────────────────────────────
    const proxyAdminEntry = deployment.proxyAdmin;
    if (!proxyAdminEntry) throw new Error("No proxyAdmin in deployment");

    const proxyAdminAbi = [
      "function owner() view returns (address)",
      "function upgrade(address proxy, address implementation)",
    ];
    const proxyAdmin = new ethers.Contract(proxyAdminEntry.address, proxyAdminAbi, provider);
    // Read the live owner (EOA or Timelock) and impersonate it — pranking the owner
    // bypasses any Timelock queue delay.
    const proxyAdminOwner = await proxyAdmin.owner();
    console.log(`ProxyAdmin owner: ${proxyAdminOwner}`);
    const upgraderSigner = await impersonate(provider, proxyAdminOwner);

    // ── Per-operator loop ─────────────────────────────────────────────
    const OPERATOR_ABI = [
      "function whitelists(address) view returns (bool)",
      "function approve(address _token)",
    ];
    const ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
    ];
    const IMSD_ABI = ["function burn(address from, uint256 amount)"];

    const results = [];

    let implNonce = 0;
    for (const opKey of (OPERATOR_KEYS[chainId] || [])) {
      const opEntry = deployment[opKey];
      if (!opEntry) continue;
      const opAddr = opEntry.address;

      // Build the REAL operator impl: etch its runtime bytecode at a fresh address.
      const contractName = opEntry.contract; // e.g. "ArbiOperator"
      const runtime = loadDeployedBytecode(contractName);
      const implAddr = ethers.utils.getAddress(
        "0x" + (BigInt("0x1100000000000000000000000000000000000000") + BigInt(implNonce++))
          .toString(16).padStart(40, "0")
      );
      await provider.send("anvil_setCode", [implAddr, runtime]);
      console.log(`\n[${opKey}] real impl (${contractName}) etched at ${implAddr}`);

      // Upgrade proxy
      process.stdout.write(`[${opKey}] Upgrading proxy ${opAddr}... `);
      await (await proxyAdmin.connect(upgraderSigner).upgrade(opAddr, implAddr)).wait();
      console.log("done");

      const operator = new ethers.Contract(opAddr, OPERATOR_ABI, provider);
      const whitelistUser = (WHITELIST_CANDIDATES[chainId] || [])[0];
      if (!whitelistUser) {
        console.log(`  SKIP — no whitelist candidate configured`);
        continue;
      }

      const isWhitelisted = await operator.whitelists(whitelistUser);
      if (!isWhitelisted) {
        console.log(`  SKIP — ${whitelistUser} is not whitelisted on this operator`);
        continue;
      }

      const whitelistSigner = await impersonate(provider, whitelistUser);

      for (const sym of (OPERATOR_TOKENS[opKey] || [])) {
        const tokenAddr = TOKENS[chainId]?.[sym];
        if (!tokenAddr) continue;

        const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
        const balanceBefore = await token.balanceOf(opAddr);
        console.log(`  [${sym}] balance before : ${ethers.utils.formatEther(balanceBefore)}`);

        // Call operator.approve(token) — the new function
        process.stdout.write(`  [${sym}] calling operator.approve(${sym})... `);
        await (await operator.connect(whitelistSigner).approve(tokenAddr)).wait();
        console.log("done");

        const allowance = await token.allowance(opAddr, whitelistUser);
        const isMax = allowance.eq(ethers.constants.MaxUint256);
        console.log(`  [${sym}] allowance      : ${isMax ? "MAX (✓)" : allowance.toString()}`);

        if (!isMax) {
          console.log(`  [${sym}] ✗ allowance is not max — something is wrong`);
          results.push({ opKey, sym, success: false, reason: "allowance not max" });
          continue;
        }

        if (balanceBefore.isZero()) {
          console.log(`  [${sym}] balance is 0 — burn skipped`);
          results.push({ opKey, sym, success: true, burned: "0", reason: "zero balance" });
          continue;
        }

        // Burn
        const msd = new ethers.Contract(tokenAddr, IMSD_ABI, whitelistSigner);
        process.stdout.write(`  [${sym}] burning ${ethers.utils.formatEther(balanceBefore)} ${sym}... `);
        await (await msd.burn(opAddr, balanceBefore)).wait();
        console.log("done");

        const balanceAfter = await token.balanceOf(opAddr);
        const success = balanceAfter.isZero();
        console.log(`  [${sym}] balance after  : ${ethers.utils.formatEther(balanceAfter)} ${success ? "✓" : "✗"}`);
        results.push({
          opKey, sym, success,
          burned: ethers.utils.formatEther(balanceBefore),
          reason: success ? "ok" : "non-zero balance after burn",
        });
      }
    }

    // ── Summary ───────────────────────────────────────────────────────
    console.log(`\n${"─".repeat(64)}`);
    console.log(`Summary for Chain ${chainId} (${CHAIN_NAMES[chainId]})`);
    console.log(`${"─".repeat(64)}`);
    for (const r of results) {
      const status = r.success ? "✓ PASS" : "✗ FAIL";
      console.log(`  ${status}  ${r.opKey} / ${r.sym} — burned: ${r.burned ?? "n/a"}  (${r.reason})`);
    }

  } finally {
    anvil.kill();
    console.log("\nAnvil stopped.");
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const chainId = parseInt(process.argv[2]);
  if (!chainId) {
    console.error("Usage: node scripts/simulate.js <chainId>");
    console.error("Example: node scripts/simulate.js 42161");
    process.exit(1);
  }
  await simulate(chainId).catch((err) => {
    console.error(`\nFATAL: ${err.message}`);
    process.exit(1);
  });
}

main();
