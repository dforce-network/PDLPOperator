// Usage: node scripts/status.js
// Queries owner, token balances, and whitelist status for all operators across all chains.
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");
const {
  TOKENS, WHITELIST_CANDIDATES, RPC_KEYS, CHAIN_NAMES,
  OPERATOR_KEYS, OPERATOR_TOKENS, loadDeployment,
} = require("./config");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const OPERATOR_ABI = [
  "function owner() view returns (address)",
  "function whitelists(address) view returns (bool)",
  "function flashVault() view returns (address)",
  "function cBridge() view returns (address)",
  "function getProviders() view returns (address[])",
];
const VTOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
];
const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)",
];
const MINTER_ABI = [
  "function totalMint() view returns (uint256)",
  "function owner() view returns (address)",
];

const WAD = ethers.BigNumber.from("1000000000000000000");
const fmtUnits = (x) =>
  Number(ethers.utils.formatEther(x)).toLocaleString("en-US", { maximumFractionDigits: 2 });

// Optionally read a contract address from the operator (returns null if absent).
async function readAddr(operator, fn) {
  try {
    const a = await operator[fn]();
    return a && a !== ethers.constants.AddressZero ? a : null;
  } catch (_) {
    return null;
  }
}

// Find MiniMinter proxy entries in a deployment (exclude the shared impl).
function findMinterKeys(deployment) {
  return Object.keys(deployment).filter(
    (key) => deployment[key].contract === "MiniMinter" && !key.includes("Impl")
  );
}

async function checkChain(chainId) {
  const rpcUrl = process.env[RPC_KEYS[chainId]];
  if (!rpcUrl) {
    console.log(`\n[Chain ${chainId} ${CHAIN_NAMES[chainId]}] SKIP — set ${RPC_KEYS[chainId]} in .env`);
    return;
  }
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const deployment = loadDeployment(chainId);
  if (!deployment) {
    console.log(`\n[Chain ${chainId}] SKIP — no deployments/PDLP-${chainId}.json`);
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Chain ${chainId} (${CHAIN_NAMES[chainId]})`);
  console.log(`${"=".repeat(60)}`);

  const proxyAdminAddr = deployment.proxyAdmin && deployment.proxyAdmin.address;
  if (proxyAdminAddr) {
    const proxyAdmin = new ethers.Contract(proxyAdminAddr, PROXY_ADMIN_ABI, provider);
    const proxyAdminOwner = await proxyAdmin.owner();
    const timelockEntry = deployment.timeLock || deployment.timelock;
    const hasTimelock = timelockEntry &&
      timelockEntry.address.toLowerCase() === proxyAdminOwner.toLowerCase();
    console.log(`  proxyAdmin: ${proxyAdminAddr}`);
    console.log(`    owner:    ${proxyAdminOwner}${hasTimelock ? "  (Timelock)" : ""}`);
  }

  for (const opKey of (OPERATOR_KEYS[chainId] || [])) {
    const opEntry = deployment[opKey];
    if (!opEntry) {
      console.log(`\n  ${opKey}: NOT FOUND in deployment`);
      continue;
    }
    const opAddr = opEntry.address;
    const operator = new ethers.Contract(opAddr, OPERATOR_ABI, provider);

    let owner = "N/A";
    try { owner = await operator.owner(); } catch (_) {}

    console.log(`\n  ${opKey}: ${opAddr}`);
    console.log(`    owner: ${owner}`);

    // Locations USX can sit (read straight from the operator):
    //   wallet · FlashVault (vUSX) · cBridge LP · lending providers
    const flashVaultAddr = await readAddr(operator, "flashVault");
    const cBridgeAddr = await readAddr(operator, "cBridge");
    let providerCount = 0;
    try { providerCount = (await operator.getProviders()).length; } catch (_) {}

    let located = ethers.constants.Zero; // operator-owned USX (excludes shared cBridge pool)

    for (const sym of (OPERATOR_TOKENS[opKey] || [])) {
      const tokenAddr = TOKENS[chainId] && TOKENS[chainId][sym];
      if (!tokenAddr) continue;
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);

      // wallet
      try {
        const bal = await token.balanceOf(opAddr);
        console.log(`    ${sym} wallet:    ${fmtUnits(bal)} ${sym}  (raw: ${bal.toString()})`);
        located = located.add(bal);
      } catch (e) {
        console.log(`    ${sym} wallet:    ERROR — ${e.message}`);
      }

      // FlashVault (vUSX): operator's vToken position -> underlying USX
      if (flashVaultAddr) {
        try {
          const v = new ethers.Contract(flashVaultAddr, VTOKEN_ABI, provider);
          const vbal = await v.balanceOf(opAddr);
          const rate = await v.exchangeRateStored();
          const underlying = vbal.mul(rate).div(WAD);
          console.log(`    ${sym} FlashVault:${fmtUnits(underlying)} ${sym}  (vToken ${flashVaultAddr})`);
          located = located.add(underlying);
        } catch (e) {
          console.log(`    ${sym} FlashVault:ERROR — ${e.message.slice(0, 50)}`);
        }
      }
    }

    // cBridge LP (Celer pool total USX on this chain; ~operator LP for USX)
    if (cBridgeAddr) {
      const usxAddr = TOKENS[chainId] && TOKENS[chainId].USX;
      if (usxAddr) {
        try {
          const usx = new ethers.Contract(usxAddr, ERC20_ABI, provider);
          const cb = await usx.balanceOf(cBridgeAddr);
          console.log(`    cBridge LP: ${fmtUnits(cb)} USX  (pool ${cBridgeAddr}; total, ~operator)`);
        } catch (e) {
          console.log(`    cBridge LP: ERROR — ${e.message.slice(0, 50)}`);
        }
      }
    }

    if (providerCount > 0) {
      console.log(`    lending:    ${providerCount} provider(s) (positions probed separately; negligible)`);
    }
    console.log(`    -> operator-owned USX (wallet + FlashVault): ${fmtUnits(located)}`);

    const candidates = WHITELIST_CANDIDATES[chainId] || [];
    if (candidates.length > 0) {
      console.log(`    whitelists:`);
      for (const addr of candidates) {
        let ok = false;
        try { ok = await operator.whitelists(addr); } catch (_) {}
        console.log(`      ${addr}  ${ok ? "✓" : "✗"}`);
      }
    }
  }

  const minterKeys = findMinterKeys(deployment);
  if (minterKeys.length > 0) {
    console.log(`\n  MiniMinters:`);
    for (const minterKey of minterKeys) {
      const minterAddr = deployment[minterKey].address;
      const minter = new ethers.Contract(minterAddr, MINTER_ABI, provider);
      let owner = "N/A";
      try { owner = await minter.owner(); } catch (_) {}
      try {
        const totalMint = await minter.totalMint();
        const fmt = ethers.utils.formatEther(totalMint);
        console.log(`    ${minterKey}: ${minterAddr}`);
        console.log(`      owner:     ${owner}`);
        console.log(`      totalMint: ${Number(fmt).toLocaleString("en-US", { maximumFractionDigits: 4 })}  (raw: ${totalMint.toString()})`);
      } catch (e) {
        console.log(`    ${minterKey}: ${minterAddr}`);
        console.log(`      totalMint: ERROR — ${e.message}`);
      }
    }
  }
}

async function main() {
  for (const chainId of Object.keys(OPERATOR_KEYS).map(Number)) {
    await checkChain(chainId).catch((err) =>
      console.log(`\n[Chain ${chainId}] FATAL: ${err.message}`)
    );
  }
}

main().catch(console.error);
