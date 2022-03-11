import {
  run,
  sendTransaction,
  printTransactionInsteadOfSend,
  printTenderlyInsteadOfSend,
} from "./helpers/utils.js";
import { deployContracts } from "./helpers/deploy.js";
import { printArgs } from "./helpers/timelock.js";
import { attachContractAtAdddress } from "./helpers/contract";

let task = { name: "PDLP" };

const network = {
  56: "bsc",
};

let deployInfo = {
  bsc: {
    DF: "0x4A9A2b2b04549C3927dd2c9668A5eF3fCA473623",
    USX: "0xB5102CeE1528Ce2C760893034A4603663495fD72",
    iUSX: "0x7B933e1c1F44bE9Fb111d87501bAADA7C8518aBe",
    viUSX: "0x206d2D5218c8Eed85Ee0f0FE9BfDad03025BC72E",
    qUSX: "0x450E09a303AA4bcc518b5F74Dd00433bd9555A77",
    vqUSX: "0xeF535decdCA4B72608ff82A692864E1A4ccd50e5",
    // VMUSX
    FLASH_VAULT: "0x3de52B6340Cc138f811b5e752cA56042BDDA2812",
    CBRIDGE: "0xdd90E5E87A2081Dcf0391920868eBc2FFB81a1aF",
    CBRIGE_CAP: ethers.utils.parseEther("100000000"),
    // Mint cap for miniminter for cbridge
    MINT_CAP: ethers.utils.parseEther("100000000"),
  },
};

async function deploy() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const MSD_CONTROLLER = info.MSD_CONTROLLER;
  const FLASH_VAULT = info.FLASH_VAULT;
  const CBRIDGE = info.CBRIDGE;

  task.contractsToDeploy = {
    pdlpMiniMinter: {
      contract: "MiniMinter",
      path: "contracts/msd/",
      useProxy: true,
      getArgs: () => [USX, MSD_CONTROLLER],
    },
    bscOperator: {
      contract: "BSCOperator",
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
    liqeeProvider: {
      contract: "LiqeeProvider",
      path: "contracts/base/providers/",
      useProxy: false,
      getArgs: () => [qUSX],
    },
  };

  await deployContracts(task);
}

async function setOwner() {
  await sendTransaction(task, "pdlpMiniMinter", "_setPendingOwner", [
    task.deployments.bscOperator.address,
  ]);

  await sendTransaction(task, "bscOperator", "acceptOwner", []);

  await sendTransaction(task, "bscOperator", "_addToWhitelists", [
    task.signerAddr,
  ]);
}

async function addUSXMinter() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const MINT_CAP = info.MINT_CAP;

  const transactions = [
    [
      "msdController",
      "_addMinters",
      [USX, [task.deployments.pdlpMiniMinter.address], [MINT_CAP]],
    ],
  ];

  // await sendTransaction(task, ...transactions[0]);
  await printArgs(task, transactions);
}

async function addToWhitelists() {
  console.log("Owner: ", await task.contracts.bscOperator.owner());

  await sendTransaction(task, "bscOperator", "_addToWhitelists", [
    "0xbA32Bc6396152025608a37005D80E0346aB4740b",
  ]);
}

async function upgradeBSCOperator() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const CBRIDGE = info.CBRIDGE;
  const FLASH_VAULT = info.FLASH_VAULT;

  const iUSX = info.iUSX;
  const qUSX = info.qUSX;

  task.contractsToDeploy = {
    dForceLendingProvider: {
      contract: "dForceLendingProvider",
      path: "contracts/base/providers/",
      useProxy: false,
      getArgs: () => [iUSX],
    },
    liqeeProvider: {
      contract: "LiqeeProvider",
      path: "contracts/base/providers/",
      useProxy: false,
      getArgs: () => [qUSX],
    },
    BSCOperatorImpl: {
      contract: "BSCOperator",
      useProxy: false,
      getArgs: (deployments) => [
        USX,
        FLASH_VAULT,
        deployments.pdlpMiniMinter.address,
        CBRIDGE,
      ],
    },
  };

  await deployContracts(task);

  // Check the proxyAdmin's owner is the Timelock
  if (
    (await task.contracts.proxyAdmin.owner()) ===
    task.contracts.timeLock.address
  ) {
    // print data if use Timelock
    await printArgs(task, [
      [
        "proxyAdmin",
        "upgrade",
        [
          task.deployments.bscOperator.address,
          task.deployments.BSCOperatorImpl.address,
        ],
      ],
    ]);
  } else {
    // Direct sendTransaction if no Timelock
    await sendTransaction(task, "proxyAdmin", "upgrade", [
      task.deployments.bscOperator.address,
      task.deployments.BSCOperatorImpl.address,
    ]);
  }

  // Call upgrade()
  await sendTransaction(task, "bscOperator", "upgrade", [
    USX,
    FLASH_VAULT,
    task.deployments.pdlpMiniMinter.address,
    CBRIDGE,
  ]);
}

async function addProviders() {
  const info = deployInfo[network[task.chainId]];
  const viUSX = info.viUSX;
  const vqUSX = info.vqUSX;

  await sendTransaction(task, "bscOperator", "_addProviderWithVCollateral", [
    task.deployments.dForceLendingProvider.address,
    viUSX,
  ]);

  await sendTransaction(task, "bscOperator", "_addProviderWithVCollateral", [
    task.deployments.liqeeProvider.address,
    vqUSX,
  ]);
}

async function addOperatorToFlashVaultQUSX() {
  await sendTransaction(task, "vqUSX", "_addToWhitelists", [
    task.contracts.bscOperator.address,
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

async function depositTest() {
  const providers = await task.contracts.bscOperator.getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to deposit to", await getName(providerAddress));

    await sendTransaction(task, "bscOperator", "deposit", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function withdrawTest() {
  const providers = await task.contracts.bscOperator.getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to withdraw from", await getName(providerAddress));

    await sendTransaction(task, "bscOperator", "withdraw", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function deployNewOperator() {
  await run(task, deploy);
  await run(task, setOwner);
  await run(task, addUSXMinter);
  await run(task, addToWhitelists);
  await run(task, addProviders);

  // await run(task, depositTest);
  // await run(task, withdrawTest);
}

async function upgrade() {
  const TENDERLY_FORK_ID = "aa5489d5-2a05-4c0f-9335-e8bd9e27ec0e";

  // printTransactionInsteadOfSend();
  // printTenderlyInsteadOfSend(
  //   TENDERLY_FORK_ID,
  //   "0x4006e4a788edff483b5a0c90ca9af9c0a497072b" // from
  // );

  // await run(task, upgradeBSCOperator);
  // await run(task, addProviders);

  // printTenderlyInsteadOfSend(
  //   TENDERLY_FORK_ID,
  //   "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75" // from
  // );
  // await run(task, addOperatorToFlashVaultQUSX);

  printTenderlyInsteadOfSend(
    TENDERLY_FORK_ID,
    "0x4006e4a788edff483b5a0c90ca9af9c0a497072b" // from
  );
  await run(task, depositTest);
  await run(task, withdrawTest);
}

// deployNewOperator();
upgrade();
