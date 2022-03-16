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

const TENDERLY_FORK_ID = "c38fb565-89b3-4665-a8a3-e32c1ad96c45";

let task = { name: "PDLP" };

const network = {
  137: "polygon",
};

let deployInfo = {
  polygon: {
    MSD_CONTROLLER: "0x40BE37096ce3b8A2E9eC002468Ab91071501C499",
    USX: "0xCf66EB3D546F0415b368d98A95EAF56DeD7aA752",
    iUSX: "0xc171EBE1A2873F042F1dDdd9327D00527CA29882",
    viUSX: "0x038362bd36AA7Baf45aC5b3EE75b784C2Fed8e86",
    // VMUSX
    FLASH_VAULT: "0x263d04d9aF1f31302322d6a7F77b4ddcb6B5097C",
    CBRIDGE: "0x88DCDC47D2f83a99CF0000FDF667A468bB958a78",
    CBRIGE_CAP: ethers.utils.parseEther("100000000"),
    // Mint cap for miniminter for cbridge
    MINT_CAP: ethers.utils.parseEther("100000000"),
    WHITE_LIST: "0x6b29b8af9AF126170513AE6524395E09025b214E",
  },
};

async function deploy() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const iUSX = info.iUSX;
  const MSD_CONTROLLER = info.MSD_CONTROLLER;
  const FLASH_VAULT = info.FLASH_VAULT;
  const CBRIDGE = info.CBRIDGE;

  task.contractsToDeploy = {
    pdlpMiniMinter: {
      contract: "MiniMinter",
      useProxy: true,
      getArgs: () => [USX, MSD_CONTROLLER],
    },
    polyOperator: {
      contract: "PolyOperator",
      path: "contracts/operator/",
      useProxy: true,
      getArgs: (deployments) => [
        USX,
        FLASH_VAULT,
        deployments.pdlpMiniMinter.address,
        CBRIDGE,
      ],
    },
    dForceLendingProvider: {
      contract: "dForceLendingProvider",
      path: "contracts/base/providers/",
      useProxy: false,
      getArgs: () => [iUSX],
    },
  };

  await deployContracts(task);
}

async function setOwner() {
  const info = deployInfo[network[task.chainId]];

  await sendTransaction(task, "pdlpMiniMinter", "_setPendingOwner", [
    task.deployments.polyOperator.address,
  ]);

  await sendTransaction(task, "polyOperator", "acceptOwner", []);

  await sendTransaction(task, "polyOperator", "_addToWhitelists", [
    info.WHITE_LIST,
  ]);
}

async function addUSXMinter() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const MINT_CAP = info.MINT_CAP;

  const transactions = [
    [
      "msdController",
      "_addMSD",
      [USX, [task.deployments.pdlpMiniMinter.address], [MINT_CAP]],
    ],
  ];

  // await sendTransaction(task, ...transactions[0]);
  await printArgs(task, transactions);
}

async function addProviders() {
  const info = deployInfo[network[task.chainId]];
  const viUSX = info.viUSX;

  await sendTransaction(task, "polyOperator", "_addProviderWithVCollateral", [
    task.deployments.dForceLendingProvider.address,
    viUSX,
  ]);
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

async function depositToCBridge() {
  await sendTransaction(task, "polyOperator", "depositToCBridge", [
    ethers.utils.parseEther("100000"),
  ]);
}

async function depositTest() {
  const providers = await task.contracts.polyOperator.getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to deposit to", await getName(providerAddress));

    await sendTransaction(task, "polyOperator", "deposit", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function withdrawTest() {
  const providers = await task.contracts.polyOperator.getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to withdraw from", await getName(providerAddress));

    await sendTransaction(task, "polyOperator", "withdraw", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function polyOperator() {
  // The flash vault should be deployed first
  await run(task, deploy);
  await run(task, setOwner);
  await run(task, addProviders);

  await run(task, depositTest);
  await run(task, withdrawTest);
  await run(task, depositToCBridge);
}

polyOperator();
