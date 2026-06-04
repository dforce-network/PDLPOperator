// migrations/7_cleanup_upgrade.js
//
// Deploys the new operator implementation (carrying the cleanup additions
// OperatorBase.approve + VaultBase.repay) and prints the ProxyAdmin.upgrade
// transaction — routed through the Timelock where the ProxyAdmin is Timelock-owned.
//
// Uses only the existing migration framework (helpers/*) — no new dependencies.
// Reference: migrations/1_ethereum_operator.js (upgradeEthereumOperator).
//
// The new implementation's constructor arguments are READ from the live operator
// (USX/vault/flashVault/cBridge/withdrawBox/... getters) so we redeploy with the
// exact same config and never hardcode addresses.
//
// Run per network, e.g.:  npx hardhat run migrations/7_cleanup_upgrade.js --network mainnet

import { run } from "./helpers/utils.js";
import { deployContracts } from "./helpers/deploy.js";
import { printArgs } from "./helpers/timelock.js";

let task = { name: "PDLP" };

// Operator proxy deployment keys to upgrade, per chain id.
// EUX operators are excluded (wound down: 0 balance, no active whitelist user).
const OPERATOR_KEYS = {
  1: ["ethereumOperator"],
  10: ["opOperator"],
  56: ["bscOperatorUSX"],
  137: ["polyOperatorUSX"],
  2222: ["polyOperatorUSX"],
  43114: ["polyOperatorUSX"],
  1030: ["polyOperatorUSX"],
  42161: ["arbiOperatorUSX"],
};

// Constructor-arg readers, keyed by the operator contract name. Each reads the
// existing config straight off the live operator so the new impl matches exactly.
const ARG_READERS = {
  EthereumOperator: async (op) => [
    await op.USX(),
    await op.vault(),
    await op.l1ArbiUSXGateway(),
    await op.l2ArbiOperator(),
    await op.cBridge(),
    await op.l2USX(),
    await op.l1OptiUSXGateway(),
    await op.l2OptiOperator(),
    await op.withdrawBox(),
  ],
  // L2 bridge operators: (usx, flashVault, cBridge, l2Bridge, withdrawBox)
  ArbiOperator: async (op) => [
    await op.USX(),
    await op.flashVault(),
    await op.cBridge(),
    await op.L2Bridge(),
    await op.withdrawBox(),
  ],
  OpOperator: async (op) => [
    await op.USX(),
    await op.flashVault(),
    await op.cBridge(),
    await op.L2Bridge(),
    await op.withdrawBox(),
  ],
  // Vault + flashVault operators: (usx, flashVault, vault, cBridge, withdrawBox)
  BSCOperator: async (op) => [
    await op.USX(),
    await op.flashVault(),
    await op.vault(),
    await op.cBridge(),
    await op.withdrawBox(),
  ],
  PolyOperator: async (op) => [
    await op.USX(),
    await op.flashVault(),
    await op.vault(),
    await op.cBridge(),
    await op.withdrawBox(),
  ],
};

function operatorKeys() {
  const keys = OPERATOR_KEYS[task.chainId];
  if (!keys) throw `No operator keys configured for chain ${task.chainId}`;
  return keys;
}

const implKey = (opKey) => `${opKey}CleanupImpl`;

// 1) Deploy the new implementation for each operator on this chain.
async function deployImpls(task) {
  task.contractsToDeploy = {};

  for (const opKey of operatorKeys()) {
    const entry = task.deployments[opKey];
    if (!entry) {
      console.log(`\n${opKey}: not found in deployments — skipping`);
      continue;
    }
    const contract = entry.contract;
    const reader = ARG_READERS[contract];
    if (!reader) throw `No ARG_READER for contract ${contract} (${opKey})`;

    let args;
    try {
      args = await reader(task.contracts[opKey]);
    } catch (e) {
      // Safety net: an older deployed impl may be missing a getter. Skip it.
      console.log(
        `\n${opKey} (${contract}): cannot read constructor args (${e.reason || e.code || e.message}). ` +
        `Likely an older impl — skipping upgrade.`
      );
      continue;
    }
    console.log(`\n${opKey} (${contract}) constructor args read from chain:`);
    args.forEach((a, i) => console.log(`  [${i}] ${a}`));

    task.contractsToDeploy[implKey(opKey)] = {
      contract,
      path: "contracts/",
      useProxy: false,
      getArgs: () => args,
    };
  }

  await deployContracts(task);
}

// 2) Print the ProxyAdmin.upgrade transaction (Timelock-routed where applicable).
async function printUpgrades(task) {
  const proxyAdmin = task.contracts.proxyAdmin;
  const proxyAdminOwner = await proxyAdmin.owner();

  // The deployment file uses "timeLock" or "timelock"; normalize for printArgs.
  const tlEntry = task.deployments.timeLock || task.deployments.timelock;
  if (tlEntry && !task.deployments.timeLock) task.deployments.timeLock = tlEntry;
  if (tlEntry && !task.contracts.timeLock) {
    task.contracts.timeLock = task.contracts.timelock;
  }
  const viaTimelock =
    tlEntry && tlEntry.address.toLowerCase() === proxyAdminOwner.toLowerCase();

  for (const opKey of operatorKeys()) {
    const proxy = task.deployments[opKey];
    const impl = task.deployments[implKey(opKey)];
    if (!proxy || !impl) continue;

    console.log(`\n================================================================`);
    console.log(`Upgrade ${opKey}`);
    console.log(`  proxy: ${proxy.address}`);
    console.log(`  newImpl: ${impl.address}`);
    console.log(`  proxyAdmin: ${task.deployments.proxyAdmin.address}  owner: ${proxyAdminOwner}`);
    console.log(`================================================================`);

    if (viaTimelock) {
      console.log(`Routing through Timelock ${tlEntry.address}:`);
      await printArgs(task, [
        ["proxyAdmin", "upgrade", [proxy.address, impl.address]],
      ]);
    } else {
      // ProxyAdmin owned directly (EOA / multisig) — print the raw upgrade tx.
      const txData = await proxyAdmin.populateTransaction.upgrade(
        proxy.address,
        impl.address
      );
      console.log(`Direct upgrade (call from proxyAdmin owner ${proxyAdminOwner}):`);
      console.log(`  to:   ${txData.to}`);
      console.log(`  data: ${txData.data}`);
    }
  }
}

async function main(task) {
  console.log(`\nCleanup upgrade on chain ${task.chainId}`);
  await deployImpls(task);
  await printUpgrades(task);
}

run(task, main);
