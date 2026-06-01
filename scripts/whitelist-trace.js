// scripts/whitelist-trace.js
// Usage: node scripts/whitelist-trace.js [chainId] [--limit N]
//
// Discovers the REAL whitelist users of each operator by tracing its recent
// transaction history via a block explorer, then cross-checking each successful
// sender against the live `whitelists(address)` mapping over RPC.
//
// Rationale: operator functions like deposit/withdraw/mint/depositToCBridge are
// gated by `onlyWhitelist`, so the `from` of any *successful* tx to the operator
// is either a whitelist user or the owner. The migration-time WHITELIST_CANDIDATES
// list can be stale; this finds who is actually active now.
//
// Explorer key: set ETHERSCAN_KEY in .env for Etherscan V2 chains
// (1, 10, 56, 137, 42161, 43114). Avalanche has a keyless Routescan fallback.
// Kava and Conflux use their own keyless Etherscan-compatible endpoints.
"use strict";
require("dotenv").config();
const https = require("https");
const { ethers } = require("ethers");
const {
  RPC_KEYS, CHAIN_NAMES, EXPLORERS, OPERATOR_KEYS, loadDeployment,
} = require("./config");

const OPERATOR_ABI = [
  "function whitelists(address) view returns (bool)",
  "function owner() view returns (address)",
];

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "pdlp-whitelist-trace" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// Build the explorer txlist URL for a chain, or return null if unavailable.
function buildTxlistUrl(chainId, address, limit) {
  const exp = EXPLORERS[chainId];
  if (!exp) return null;
  const common = `module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;

  if (exp.kind === "etherscanV2") {
    const key = process.env.ETHERSCAN_KEY;
    if (key) {
      return `https://api.etherscan.io/v2/api?chainid=${chainId}&${common}&apikey=${key}`;
    }
    if (exp.fallbackUrl) return `${exp.fallbackUrl}?${common}`;
    return null; // no key and no keyless fallback
  }
  if (exp.kind === "url") {
    return `${exp.url}?${common}`;
  }
  return null;
}

async function traceChain(chainId, limit) {
  const rpcUrl = process.env[RPC_KEYS[chainId]];
  const deployment = loadDeployment(chainId);
  if (!deployment) {
    console.log(`\n[Chain ${chainId}] SKIP — no deployment file`);
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Chain ${chainId} (${CHAIN_NAMES[chainId]})`);
  console.log(`${"=".repeat(60)}`);

  const url0 = buildTxlistUrl(chainId, "0x", limit);
  if (!url0) {
    console.log(`  SKIP — no explorer configured (set ETHERSCAN_KEY for this chain?)`);
    return;
  }

  const provider = rpcUrl ? new ethers.providers.JsonRpcProvider(rpcUrl) : null;

  for (const opKey of (OPERATOR_KEYS[chainId] || [])) {
    const opEntry = deployment[opKey];
    if (!opEntry) continue;
    const opAddr = opEntry.address;

    const url = buildTxlistUrl(chainId, opAddr, limit);
    let txs;
    try {
      const raw = await httpGet(url);
      const j = JSON.parse(raw);
      if (j.status !== "1" || !Array.isArray(j.result)) {
        const hint = (EXPLORERS[chainId].kind === "etherscanV2" && !process.env.ETHERSCAN_KEY)
          ? "  (keyless fallback may be rate-limited — set ETHERSCAN_KEY for a reliable Etherscan V2 query)"
          : "";
        console.log(`\n  ${opKey} (${opAddr}): explorer returned "${j.message || j.result}"${hint}`);
        continue;
      }
      txs = j.result;
    } catch (e) {
      console.log(`\n  ${opKey} (${opAddr}): explorer error — ${e.message}`);
      continue;
    }

    // distinct successful senders, with their most recent tx timestamp
    const senders = new Map(); // addr(lower) -> { last, count, checksum }
    for (const t of txs) {
      if (t.isError !== "0") continue;
      const lower = t.from.toLowerCase();
      const ts = Number(t.timeStamp || t.timestamp) * 1000;
      const cur = senders.get(lower);
      if (!cur) senders.set(lower, { last: ts, count: 1, checksum: ethers.utils.getAddress(t.from) });
      else { cur.count++; if (ts > cur.last) cur.last = ts; }
    }

    console.log(`\n  ${opKey} (${opAddr})`);
    if (senders.size === 0) {
      console.log(`    no successful inbound txs found in last ${limit}`);
      continue;
    }

    // cross-check each sender against live whitelists() and owner()
    let owner = null;
    const operator = provider ? new ethers.Contract(opAddr, OPERATOR_ABI, provider) : null;
    if (operator) { try { owner = (await operator.owner()).toLowerCase(); } catch (_) {} }

    for (const [lower, info] of senders) {
      let tag = "";
      if (operator) {
        let wl = false;
        try { wl = await operator.whitelists(info.checksum); } catch (_) {}
        if (wl) tag = "  ✓ WHITELISTED";
        else if (lower === owner) tag = "  (owner)";
        else tag = "  ✗ not whitelisted now (past user / owner-only call)";
      } else {
        tag = "  (no RPC to verify)";
      }
      const date = new Date(info.last).toISOString().slice(0, 10);
      console.log(`    ${info.checksum}  last:${date}  txs:${info.count}${tag}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 50;
  const li = args.indexOf("--limit");
  if (li !== -1 && args[li + 1]) limit = parseInt(args[li + 1]);
  const chainArg = args.find((a) => /^\d+$/.test(a));

  const chains = chainArg
    ? [parseInt(chainArg)]
    : Object.keys(EXPLORERS).map(Number);

  for (const chainId of chains) {
    await traceChain(chainId, limit).catch((err) =>
      console.log(`\n[Chain ${chainId}] FATAL: ${err.message}`)
    );
  }
}

main().catch(console.error);
