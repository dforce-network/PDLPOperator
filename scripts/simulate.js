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
      "function repay(uint256 _amount)",
      "function vault() view returns (address)",
    ];
    const ERC20_ABI = [
      "function balanceOf(address) view returns (uint256)",
      "function allowance(address,address) view returns (uint256)",
    ];
    const MINTER_ABI = ["function totalMint() view returns (uint256)"];
    const IMSD_ABI = ["function burn(address from, uint256 amount)"];
    const fmt = (x) => ethers.utils.formatEther(x);
    const min = (a, b) => (a.lt(b) ? a : b);

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

      // Detect the operator's minter (vault). Minter chains can repay() to retire
      // totalMint; non-minter chains (Arbitrum/OP) fall back to approve()+burn.
      let vaultAddr = null;
      try {
        const v = await operator.vault();
        if (v && v !== ethers.constants.AddressZero) vaultAddr = v;
      } catch (_) { /* operator has no vault() (L2) */ }

      for (const sym of (OPERATOR_TOKENS[opKey] || [])) {
        const tokenAddr = TOKENS[chainId]?.[sym];
        if (!tokenAddr) continue;

        const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
        const balanceBefore = await token.balanceOf(opAddr);
        console.log(`  [${sym}] balance before : ${fmt(balanceBefore)}`);

        let remaining = balanceBefore;

        // ── Step 1: repay() to retire totalMint (minter chains only) ────
        if (vaultAddr) {
          const minter = new ethers.Contract(vaultAddr, MINTER_ABI, provider);
          const totalMint0 = await minter.totalMint();
          console.log(`  [${sym}] minter totalMint: ${fmt(totalMint0)}`);
          const repayAmt = min(balanceBefore, totalMint0);
          if (repayAmt.gt(0)) {
            process.stdout.write(`  [${sym}] operator.repay(${fmt(repayAmt)})... `);
            await (await operator.connect(whitelistSigner).repay(repayAmt)).wait();
            console.log("done");
            const totalMint1 = await minter.totalMint();
            console.log(`  [${sym}] totalMint after : ${fmt(totalMint1)} (-${fmt(totalMint0.sub(totalMint1))})`);
            remaining = balanceBefore.sub(repayAmt);
            results.push({ opKey, sym, success: true, op: "repay", amount: fmt(repayAmt), reason: "totalMint reduced" });
          } else if (balanceBefore.isZero()) {
            console.log(`  [${sym}] operator holds 0 — bridge USX back to this chain before repay`);
          }
        }

        // ── Step 2: approve()+burn any remainder (or full balance on L2) ─
        if (remaining.gt(0)) {
          process.stdout.write(`  [${sym}] operator.approve(${sym})... `);
          await (await operator.connect(whitelistSigner).approve(tokenAddr)).wait();
          const allowance = await token.allowance(opAddr, whitelistUser);
          const isMax = allowance.eq(ethers.constants.MaxUint256);
          console.log(isMax ? "allowance MAX (✓)" : `allowance ${allowance} ✗`);
          if (!isMax) {
            results.push({ opKey, sym, success: false, op: "approve", reason: "allowance not max" });
            continue;
          }
          const msd = new ethers.Contract(tokenAddr, IMSD_ABI, whitelistSigner);
          process.stdout.write(`  [${sym}] burning remainder ${fmt(remaining)} ${sym}... `);
          await (await msd.burn(opAddr, remaining)).wait();
          console.log("done");
          results.push({ opKey, sym, success: true, op: "burn", amount: fmt(remaining), reason: "remainder burned" });
        }

        const balanceAfter = await token.balanceOf(opAddr);
        const cleared = balanceAfter.isZero();
        console.log(`  [${sym}] balance after  : ${fmt(balanceAfter)} ${cleared ? "✓" : "(remaining)"}`);
        if (balanceBefore.isZero() && !vaultAddr) {
          results.push({ opKey, sym, success: true, op: "none", amount: "0", reason: "zero balance" });
        }
      }
    }

    // ── Summary ───────────────────────────────────────────────────────
    console.log(`\n${"─".repeat(64)}`);
    console.log(`Summary for Chain ${chainId} (${CHAIN_NAMES[chainId]})`);
    console.log(`${"─".repeat(64)}`);
    for (const r of results) {
      const status = r.success ? "✓ PASS" : "✗ FAIL";
      console.log(`  ${status}  ${r.opKey} / ${r.sym} — ${r.op}(${r.amount ?? "n/a"})  (${r.reason})`);
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
