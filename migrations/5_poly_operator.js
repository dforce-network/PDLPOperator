import {
  run,
  sendTransaction,
  sendTransactionInsteadOfPrint,
  printTransactionInsteadOfSend,
  printTenderlyInsteadOfSend,
} from "./helpers/utils.js";
import { deployContracts } from "./helpers/deploy.js";
import { printArgs } from "./helpers/timelock.js";
import { attachContractAtAdddress } from "./helpers/contract";

const TENDERLY_FORK_ID = "63f6805a-d859-45ae-9073-15e24a6537d7";

let task = { name: "PDLP" };

const network = {
  137: "polygon",
};

let deployInfo = {
  polygon: {
    MSD_CONTROLLER: "0x40BE37096ce3b8A2E9eC002468Ab91071501C499",
    WHITE_LIST: "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75",
    MSDs: {
      USX: {
        ADDR: "0xCf66EB3D546F0415b368d98A95EAF56DeD7aA752",
        iToken: "0xc171EBE1A2873F042F1dDdd9327D00527CA29882",
        viToken: "0x53BF3c82f62B152800E0152DB743451849F1aFF9",
        vMToken: "0x9150e119bFD2692cf94Df8d54F27339929c0943d",
        CBRIDGE: "0x88DCDC47D2f83a99CF0000FDF667A468bB958a78",
      },
      EUX: {
        ADDR: "",
        iToken: "",
        viToken: "",
        vMToken: "",
        CBRIDGE: "0x88DCDC47D2f83a99CF0000FDF667A468bB958a78",
      },
    },
  },
};

async function deploy(msd) {
  const info = deployInfo[network[task.chainId]];
  const MSD = info.MSDs[msd];
  const MSD_CONTROLLER = info.MSD_CONTROLLER;

  task.contractsToDeploy = {};
  task.contractsToDeploy["pdlpMiniMinter" + msd] = {
    contract: "MiniMinter",
    useProxy: true,
    getArgs: () => [MSD.ADDR, MSD_CONTROLLER],
  };
  task.contractsToDeploy["polyOperator" + msd] = {
    contract: "PolyOperator",
    path: "contracts/operator/",
    useProxy: true,
    getArgs: (deployments) => [
      MSD.ADDR,
      MSD.vMToken,
      deployments["pdlpMiniMinter" + msd].address,
      MSD.CBRIDGE,
    ],
  };
  task.contractsToDeploy["dForceLendingProvider" + msd] = {
    contract: "dForceLendingProvider",
    path: "contracts/base/providers/",
    useProxy: false,
    getArgs: () => [MSD.iToken],
  };

  await deployContracts(task);
}

async function setOwner(msd) {
  const info = deployInfo[network[task.chainId]];

  await sendTransaction(task, "pdlpMiniMinter" + msd, "_setPendingOwner", [
    task.deployments["polyOperator" + msd].address,
  ]);

  await sendTransaction(task, "polyOperator" + msd, "acceptOwner", []);

  await sendTransaction(task, "polyOperator" + msd, "_addToWhitelists", [
    info.WHITE_LIST,
  ]);
}

async function addProviders(msd) {
  const info = deployInfo[network[task.chainId]];
  const viToken = info.MSDs[msd].viToken;

  await sendTransaction(
    task,
    "polyOperator" + msd,
    "_addProviderWithVCollateral",
    [task.deployments["dForceLendingProvider" + msd].address, viToken]
  );
}

async function getName(contractAddr) {
  const provider = await attachContractAtAdddress(
    task.signer,
    contractAddr,
    "iTokenProvider",
    "contracts/base/providers/"
  );

  return provider.name();
}

async function depositToCBridge(msd) {
  await sendTransaction(task, "polyOperator" + msd, "depositToCBridge", [
    ethers.utils.parseEther("100000"),
  ]);
}

async function depositTest(msd) {
  const providers = await task.contracts["polyOperator" + msd].getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to deposit to", await getName(providerAddress));

    await sendTransaction(task, "polyOperator" + msd, "deposit", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function withdrawTest(msd) {
  const providers = await task.contracts["polyOperator" + msd].getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to withdraw from", await getName(providerAddress));

    await sendTransaction(task, "polyOperator" + msd, "withdraw", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function polyOperator(msd) {
  // printTenderlyInsteadOfSend(
  //   TENDERLY_FORK_ID,
  //   "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75"
  // );

  // The flash vault should be deployed first
  await deploy(msd);
  await setOwner(msd);
  await addProviders(msd);

  // After minter and whitelist is set, we can deposit
  // await depositTest(msd);
  // await withdrawTest(msd);
  // await depositToCBridge(msd);
}

async function main() {
  // await polyOperator("USX");

  await polyOperator("EUX");
}

run(task, main);
