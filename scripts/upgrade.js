// Usage: node scripts/upgrade.js [chainId] [newImplAddress]
// Prints ProxyAdmin upgrade calldata (queued through Timelock if applicable).
// Deploy the new implementation first, then pass its address as the second arg.
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");
const {
  RPC_KEYS, CHAIN_NAMES, OPERATOR_KEYS, loadDeployment,
} = require("./config");

const PROXY_ADMIN_ABI = [
  "function owner() view returns (address)",
  "function upgrade(address proxy, address implementation)",
];
const TIMELOCK_ABI = [
  "function delay() view returns (uint256)",
  "function queueTransaction(address,uint256,string,bytes,uint256) returns (bytes32)",
  "function executeTransaction(address,uint256,string,bytes,uint256) returns (bytes)",
];
const PROXY_ADMIN_IFACE = new ethers.utils.Interface(PROXY_ADMIN_ABI);
const TIMELOCK_IFACE = new ethers.utils.Interface(TIMELOCK_ABI);

async function printChain(chainId, newImplAddress) {
  const rpcUrl = process.env[RPC_KEYS[chainId]];
  if (!rpcUrl) {
    console.log(`\n[Chain ${chainId} ${CHAIN_NAMES[chainId]}] SKIP — set ${RPC_KEYS[chainId]} in .env`);
    return;
  }
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const deployment = loadDeployment(chainId);
  if (!deployment) return;

  const proxyAdminAddr = deployment.proxyAdmin && deployment.proxyAdmin.address;
  if (!proxyAdminAddr) {
    console.log(`\n[Chain ${chainId}] no proxyAdmin in deployment`);
    return;
  }

  const proxyAdmin = new ethers.Contract(proxyAdminAddr, PROXY_ADMIN_ABI, provider);
  const proxyAdminOwner = await proxyAdmin.owner();
  const timelockEntry = deployment.timeLock || deployment.timelock;
  const hasTimelock = timelockEntry &&
    timelockEntry.address.toLowerCase() === proxyAdminOwner.toLowerCase();

  const impl = newImplAddress || "NEW_IMPL_ADDRESS";

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Chain ${chainId} (${CHAIN_NAMES[chainId]})`);
  console.log(`  proxyAdmin: ${proxyAdminAddr}`);
  console.log(`  owner:      ${proxyAdminOwner}${hasTimelock ? `  (Timelock: ${timelockEntry.address})` : ""}`);
  console.log(`  upgrade:    ${hasTimelock ? "via Timelock queue/execute" : "direct call"}`);
  console.log(`  new impl:   ${impl}`);
  console.log(`${"=".repeat(60)}`);

  for (const opKey of (OPERATOR_KEYS[chainId] || [])) {
    const opEntry = deployment[opKey];
    if (!opEntry) continue;
    const opAddr = opEntry.address;

    const upgradeData = PROXY_ADMIN_IFACE.encodeFunctionData("upgrade", [opAddr, impl]);

    if (hasTimelock) {
      const timelockAddr = timelockEntry.address;
      const timelock = new ethers.Contract(timelockAddr, TIMELOCK_ABI, provider);
      const delay = await timelock.delay();
      const eta = Math.floor(Date.now() / 1000) + delay.toNumber() + 120;

      const queueData = TIMELOCK_IFACE.encodeFunctionData("queueTransaction", [
        proxyAdminAddr, 0, "", upgradeData, eta,
      ]);
      const execData = TIMELOCK_IFACE.encodeFunctionData("executeTransaction", [
        proxyAdminAddr, 0, "", upgradeData, eta,
      ]);

      console.log(`\n  ${opKey} (proxy: ${opAddr})`);
      console.log(`    Step 1 — queueTransaction`);
      console.log(`      From: Timelock admin`);
      console.log(`      To:   ${timelockAddr}`);
      console.log(`      ETA:  ${new Date(eta * 1000).toISOString()}`);
      console.log(`      Calldata: ${queueData}`);
      console.log(`    Step 2 — executeTransaction (after ETA)`);
      console.log(`      From: Timelock admin`);
      console.log(`      To:   ${timelockAddr}`);
      console.log(`      Calldata: ${execData}`);
    } else {
      console.log(`\n  ${opKey} (proxy: ${opAddr})`);
      console.log(`    From: proxyAdmin owner (${proxyAdminOwner})`);
      console.log(`    To:   ${proxyAdminAddr}`);
      console.log(`    Calldata: ${upgradeData}`);
    }
  }
}

async function main() {
  const filterChain = process.argv[2] ? parseInt(process.argv[2]) : null;
  const newImpl = process.argv[3] || null;
  const chains = filterChain
    ? [filterChain]
    : Object.keys(OPERATOR_KEYS).map(Number);

  for (const chainId of chains) {
    await printChain(chainId, newImpl).catch((err) =>
      console.log(`\n[Chain ${chainId}] FATAL: ${err.message}`)
    );
  }
}

main().catch(console.error);
