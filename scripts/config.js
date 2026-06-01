"use strict";
const path = require("path");
const fs = require("fs");

const TOKENS = {
  1:     { USX: "0x0a5E677a6A24b2F1A2Bf4F3bFfC443231d2fDEc8" },
  56:    { USX: "0xB5102CeE1528Ce2C760893034A4603663495fD72", EUX: "0x367c17D19fCd0f7746764455497D63c8e8b2BbA3" },
  10:    { USX: "0xbfD291DA8A403DAAF7e5E9DC1ec0aCEaCd4848B9" },
  42161: { USX: "0x641441c631e2F909700d2f41FD87F0aA6A6b4EDb" },
  137:   { USX: "0xCf66EB3D546F0415b368d98A95EAF56DeD7aA752", EUX: "0x448BBbDB706cD0a6AB74fA3d1157e7A33Dd3A4a8" },
  2222:  { USX: "0xDb0E1e86B01c4ad25241b1843E407Efc4D615248" },
  43114: { USX: "0x853ea32391AaA14c112C645FD20BA389aB25C5e0" },
  1030:  { USX: "0x422a86f57b6b6F1e557d406331c25EEeD075E7aA" },
  280:   { USX: "0x7fFBa6Ce2f536fC9782ff9AA1EbBa186849BAb89" },
};

const WHITELIST_CANDIDATES = {
  1:     ["0x18c30D9569fEb3ea3644573b013D329dD9fd01Af", "0xcC27B0206645aDbE5b5C8d212c2a98574090B68F"],
  56:    ["0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75"],
  10:    ["0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75"],
  42161: ["0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75"],
  137:   ["0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75"],
  2222:  ["0x75B9a7B6F55754D4d0e952da4bDB55eAeA7dF38e"],
  // Avalanche: migration config used 0x75B9..., but tx-tracing (whitelist-trace.js)
  // shows the actually-whitelisted operator is 0xDE6D... (active 2026-05).
  43114: ["0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75", "0x75B9a7B6F55754D4d0e952da4bDB55eAeA7dF38e"],
  1030:  ["0x655284BebCC6e1DfFd098Ec538750D43B57bC743"],
  280:   ["0x6b29b8af9AF126170513AE6524395E09025b214E"],
};

const RPC_KEYS = {
  1:     "MAINNET_RPC",
  56:    "BSC_RPC",
  10:    "OPTIMISM_RPC",
  42161: "ARBITRUM_RPC",
  137:   "POLYGON_RPC",
  2222:  "KAVA_RPC",
  43114: "AVALANCHE_RPC",
  1030:  "CONFLUX_RPC",
  280:   "ZKSYNC_RPC",
};

// Block-explorer endpoints for transaction-history discovery (Etherscan-compatible APIs).
//   - "etherscanV2": unified Etherscan API; needs ETHERSCAN_KEY, pass ?chainid=<id>
//   - "url": a standalone Etherscan-compatible endpoint (keyless or own key)
// Used by scripts/whitelist-trace.js to find who actually calls the operator.
const EXPLORERS = {
  1:     { kind: "etherscanV2" },
  56:    { kind: "etherscanV2" },
  10:    { kind: "etherscanV2" },
  42161: { kind: "etherscanV2" },
  137:   { kind: "etherscanV2" },
  43114: { kind: "etherscanV2", fallbackUrl: "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api" },
  2222:  { kind: "url", url: "https://kavascan.com/api" }, // note: may 403; Kava operator wallet is 0 anyway
  1030:  { kind: "url", url: "https://evmapi.confluxscan.org/api" },
  // zkSync (280) — Etherscan V2 supports chainid 324; testnet 280 not covered here
};

const CHAIN_NAMES = {
  1:     "Ethereum",
  56:    "BSC",
  10:    "Optimism",
  42161: "Arbitrum",
  137:   "Polygon",
  2222:  "Kava",
  43114: "Avalanche",
  1030:  "Conflux eSpace",
  280:   "zkSync Testnet",
};

// Keys in deployment JSON that are operator proxies (not impls)
const OPERATOR_KEYS = {
  1:     ["ethereumOperator"],
  56:    ["bscOperatorUSX", "bscOperatorEUX"],
  10:    ["opOperator"],
  42161: ["arbiOperatorUSX"],
  137:   ["polyOperatorUSX", "polyOperatorEUX"],
  2222:  ["polyOperatorUSX"],
  43114: ["polyOperatorUSX"],
  1030:  ["polyOperatorUSX"],
  280:   ["pdlpOperatorUSX"],
};

// Which token symbol(s) each operator key holds
const OPERATOR_TOKENS = {
  ethereumOperator: ["USX"],
  bscOperatorUSX:   ["USX"],
  bscOperatorEUX:   ["EUX"],
  opOperator:       ["USX"],
  arbiOperatorUSX:  ["USX"],
  polyOperatorUSX:  ["USX"],
  polyOperatorEUX:  ["EUX"],
  pdlpOperatorUSX:  ["USX"],
};

function loadDeployment(chainId) {
  const file = path.join(__dirname, `../deployments/PDLP-${chainId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

module.exports = {
  TOKENS,
  WHITELIST_CANDIDATES,
  RPC_KEYS,
  CHAIN_NAMES,
  EXPLORERS,
  OPERATOR_KEYS,
  OPERATOR_TOKENS,
  loadDeployment,
};
