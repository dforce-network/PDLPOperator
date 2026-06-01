// Usage: node scripts/cleanup.js [chainId]
// Prints approve + burn calldatas for each operator with non-zero balance.
// No private key required — output is ready for Safe or manual execution.
"use strict";
require("dotenv").config();
const { ethers } = require("ethers");
const {
  TOKENS, WHITELIST_CANDIDATES, RPC_KEYS, CHAIN_NAMES,
  OPERATOR_KEYS, OPERATOR_TOKENS, loadDeployment,
} = require("./config");

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const OPERATOR_IFACE = new ethers.utils.Interface([
  "function approve(address _token)",
]);
const IMSD_IFACE = new ethers.utils.Interface([
  "function burn(address from, uint256 amount)",
]);

async function printChain(chainId) {
  const rpcUrl = process.env[RPC_KEYS[chainId]];
  if (!rpcUrl) {
    console.log(`\n[Chain ${chainId} ${CHAIN_NAMES[chainId]}] SKIP — set ${RPC_KEYS[chainId]} in .env`);
    return;
  }
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const deployment = loadDeployment(chainId);
  if (!deployment) return;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Chain ${chainId} (${CHAIN_NAMES[chainId]})`);
  console.log(`${"=".repeat(60)}`);

  for (const opKey of (OPERATOR_KEYS[chainId] || [])) {
    const opEntry = deployment[opKey];
    if (!opEntry) continue;
    const opAddr = opEntry.address;
    const whitelistUser = (WHITELIST_CANDIDATES[chainId] || [])[0];
    if (!whitelistUser) {
      console.log(`\n  ${opKey}: no whitelist candidate configured`);
      continue;
    }

    for (const sym of (OPERATOR_TOKENS[opKey] || [])) {
      const tokenAddr = TOKENS[chainId] && TOKENS[chainId][sym];
      if (!tokenAddr) continue;

      let balance;
      try {
        const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
        balance = await token.balanceOf(opAddr);
      } catch (e) {
        console.log(`\n  ${opKey} (${sym}): ERROR reading balance — ${e.message}`);
        continue;
      }

      if (balance.isZero()) {
        console.log(`\n  ${opKey} (${sym}): balance = 0, nothing to burn`);
        continue;
      }

      const humanBal = ethers.utils.formatEther(balance);

      console.log(`\n  ${opKey} — ${sym} balance: ${Number(humanBal).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${sym}`);
      console.log(`\n  Step 1: Call from whitelist user (${whitelistUser})`);
      console.log(`    To:       ${opAddr}  (${opKey})`);
      console.log(`    Function: approve(address)`);
      console.log(`    Calldata: ${OPERATOR_IFACE.encodeFunctionData("approve", [tokenAddr])}`);
      console.log(`\n  Step 2: Call from whitelist user (${whitelistUser})`);
      console.log(`    To:       ${tokenAddr}  (${sym})`);
      console.log(`    Function: burn(address,uint256)`);
      console.log(`    Calldata: ${IMSD_IFACE.encodeFunctionData("burn", [opAddr, balance])}`);
      console.log(`    (burns ${humanBal} ${sym} from ${opAddr})`);
    }
  }
}

async function main() {
  const filterChain = process.argv[2] ? parseInt(process.argv[2]) : null;
  const chains = filterChain
    ? [filterChain]
    : Object.keys(OPERATOR_KEYS).map(Number);

  for (const chainId of chains) {
    await printChain(chainId).catch((err) =>
      console.log(`\n[Chain ${chainId}] FATAL: ${err.message}`)
    );
  }
}

main().catch(console.error);
