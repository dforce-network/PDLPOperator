import {
  run,
  sendTransaction,
  printTransactionInsteadOfSend,
  printTenderlyInsteadOfSend,
} from "./helpers/utils.js";
import { deployContracts } from "./helpers/deploy.js";
import { deposit, depositToCBridge, withdraw } from "./helpers/operator";

const TENDERLY_FORK_ID = "8f7adf67-65c5-4103-a5dc-472c22dbec42";

let task = { name: "PDLP" };

const network = {
  42161: "arbitrum",
};

let deployInfo = {
  arbitrum: {
    WHITE_LIST: "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75",
    MSDs: {
      USX: {
        ADDR: "0x641441c631e2F909700d2f41FD87F0aA6A6b4EDb",
        iToken: "0x0385F851060c09A552F1A28Ea3f612660256cBAA",
        viToken: "0x3A5985F97222f7aB85C1A7e01563896e5C5c617C",
        vToken: "0x9E8B68E17441413b26C2f18e741EAba69894767c",
        CBRIDGE: "0x1619DE6B6B20eD217a58d00f37B9d47C7663feca",
        ARBI_BRIDGE: "0x1C4d5eCFBf2AF57251f20a524D0f0c1b4f6ED1C9",
      },
    },
  },
};

async function deploy(msd) {
  const info = deployInfo[network[task.chainId]];
  const MSD = info.MSDs[msd];

  task.contractsToDeploy = {};

  task.contractsToDeploy["arbiOperator" + msd] = {
    contract: "ArbiOperator",
    useProxy: true,
    getArgs: () => [MSD.ADDR, MSD.vToken, MSD.CBRIDGE, MSD.ARBI_BRIDGE],
  };
  task.contractsToDeploy["dForceLendingProvider" + msd] = {
    contract: "dForceLendingProvider",
    path: "contracts/base/providers/",
    useProxy: false,
    getArgs: () => [MSD.iToken],
  };

  await deployContracts(task);
}

async function upgrade(msd) {
  const info = deployInfo[network[task.chainId]];
  const MSD = info.MSDs[msd];

  task.contractsToDeploy = {};

  task.contractsToDeploy["ArbiOperatorImpl"] = {
    contract: "ArbiOperator",
    useProxy: false,
    getArgs: () => [MSD.ADDR, MSD.vToken, MSD.CBRIDGE, MSD.ARBI_BRIDGE],
  };

  task.contractsToDeploy["dForceLendingProvider" + msd] = {
    contract: "dForceLendingProvider",
    path: "contracts/base/providers/",
    useProxy: false,
    getArgs: () => [MSD.iToken],
  };

  await deployContracts(task);

  // Upgrade implementation
  await sendTransaction(task, "proxyAdmin", "upgrade", [
    task.deployments["arbiOperator" + msd].address,
    task.deployments.ArbiOperatorImpl.address,
  ]);

  // Call upgrade()
  await sendTransaction(task, ["arbiOperator" + msd], "upgrade", [
    MSD.ADDR,
    MSD.vToken,
    MSD.CBRIDGE,
    MSD.ARBI_BRIDGE,
  ]);
}

async function addProviders(msd) {
  const info = deployInfo[network[task.chainId]];

  await sendTransaction(
    task,
    "arbiOperator" + msd,
    "_addProviderWithVCollateral",
    [
      task.deployments["dForceLendingProvider" + msd].address,
      info.MSDs[msd].viToken,
    ]
  );
}

async function arbiOperator(msd) {
  // printTenderlyInsteadOfSend(
  //   TENDERLY_FORK_ID,
  //   "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75"
  // );

  // The flash vault should be deployed first
  await deploy(msd);
  await addProviders(msd);

  // After minter and whitelist is set, we can deposit
  // await depositTest(msd);
  // await withdrawTest(msd);
  // await depositToCBridge(msd);
}

async function arbiOperatorUpgrade(msd) {
  // printTenderlyInsteadOfSend(
  //   TENDERLY_FORK_ID,
  //   "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75" // from
  // );

  await upgrade(msd);
  await addProviders(msd);

  await deposit(
    task,
    "arbiOperator" + msd,
    0,
    ethers.utils.parseEther("10000")
  );

  await withdraw(
    task,
    "arbiOperator" + msd,
    0,
    ethers.utils.parseEther("10000")
  );
}

async function main() {
  // await arbiOperator("EUX");

  await arbiOperatorUpgrade("USX");
}

run(task, main);
