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
];
const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)",
];

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

    for (const sym of (OPERATOR_TOKENS[opKey] || [])) {
      const tokenAddr = TOKENS[chainId] && TOKENS[chainId][sym];
      if (!tokenAddr) continue;
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
      try {
        const bal = await token.balanceOf(opAddr);
        const dec = await token.decimals();
        const fmt = ethers.utils.formatUnits(bal, dec);
        console.log(`    ${sym} balance: ${Number(fmt).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sym}  (raw: ${bal.toString()})`);
      } catch (e) {
        console.log(`    ${sym} balance: ERROR — ${e.message}`);
      }
    }

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
}

async function main() {
  for (const chainId of Object.keys(OPERATOR_KEYS).map(Number)) {
    await checkChain(chainId).catch((err) =>
      console.log(`\n[Chain ${chainId}] FATAL: ${err.message}`)
    );
  }
}

main().catch(console.error);
