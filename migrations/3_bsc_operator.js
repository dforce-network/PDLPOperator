import {
  run,
  sendTransaction,
  printTransactionInsteadOfSend,
  printTenderlyInsteadOfSend,
} from "./helpers/utils.js";
import { deployContracts } from "./helpers/deploy.js";
import { printArgs } from "./helpers/timelock.js";
import { attachContractAtAdddress } from "./helpers/contract";

const TENDERLY_FORK_ID = "0868fa5a-7403-4e8f-a094-ba32fb837e08";

let task = { name: "PDLP" };

const network = {
  56: "bsc",
};

let deployInfo = {
  bsc: {
    MSD_CONTROLLER: "0x4601d9c8def18c101496dec0a4864e8751295bee",
    WHITE_LIST: "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75",
    MSDs: {
      USX: {
        ADDR: "0xB5102CeE1528Ce2C760893034A4603663495fD72",
        iToken: "0x7B933e1c1F44bE9Fb111d87501bAADA7C8518aBe",
        viToken: "0x206d2D5218c8Eed85Ee0f0FE9BfDad03025BC72E",
        vMToken: "0x3de52B6340Cc138f811b5e752cA56042BDDA2812",
        CBRIDGE: "0xdd90E5E87A2081Dcf0391920868eBc2FFB81a1aF",
      },
      EUX: {
        ADDR: "0x367c17D19fCd0f7746764455497D63c8e8b2BbA3",
        iToken: "0x983A727Aa3491AB251780A13acb5e876D3f2B1d8",
        viToken: "0x1441b99Da7854a304133630048dc6CF43580B1Af",
        vMToken: "0x66941a87529Ed17667dB4Ebd554b34ebBEb9372E",
        CBRIDGE: "0xdd90E5E87A2081Dcf0391920868eBc2FFB81a1aF",
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
  task.contractsToDeploy["bscOperator" + msd] = {
    contract: "BSCOperator",
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
  if (msd.hasOwnProperty("qToken")) {
    task.contractsToDeploy["liqeeProvider" + msd] = {
      contract: "liqeeProvider",
      path: "contracts/base/providers/",
      useProxy: false,
      getArgs: () => [MSD.qToken],
    };
  }

  await deployContracts(task);
}

async function setOwner(msd) {
  const info = deployInfo[network[task.chainId]];

  await sendTransaction(task, "pdlpMiniMinter" + msd, "_setPendingOwner", [
    task.deployments["bscOperator" + msd].address,
  ]);

  await sendTransaction(task, "bscOperator" + msd, "acceptOwner", []);

  await sendTransaction(task, "bscOperator" + msd, "_addToWhitelists", [
    info.WHITE_LIST,
  ]);
}

async function upgradeBSCOperator(msd) {
  const info = deployInfo[network[task.chainId]];
  const MSD = info.MSDs[msd];

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
          task.deployments["bscOperator" + msd].address,
          task.deployments.BSCOperatorImpl.address,
        ],
      ],
    ]);
  } else {
    // Direct sendTransaction if no Timelock
    await sendTransaction(task, "proxyAdmin", "upgrade", [
      task.deployments["bscOperator" + msd].address,
      task.deployments.BSCOperatorImpl.address,
    ]);
  }

  // Call upgrade()
  await sendTransaction(task, ["bscOperator" + msd], "upgrade", [
    MSD.ADDR,
    MSD.vMToken,
    task.deployments["pdlpMiniMinter" + msd].address,
    MSD.CBRIDGE,
  ]);
}

async function addProviders(msd) {
  const info = deployInfo[network[task.chainId]];

  await sendTransaction(
    task,
    "bscOperator" + msd,
    "_addProviderWithVCollateral",
    [
      task.deployments["dForceLendingProvider" + msd].address,
      info.MSDs[msd].viToken,
    ]
  );

  if (info.MSDs[msd].hasOwnProperty("qToken")) {
    await sendTransaction(
      task,
      "bscOperator" + msd,
      "_addProviderWithVCollateral",
      [task.deployments["liqeeProvider" + msd].address, info.MSDs[msd].qToken]
    );
  }
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

async function depositTest(msd) {
  const providers = await task.contracts["bscOperator" + msd].getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to deposit to", await getName(providerAddress));

    await sendTransaction(task, "bscOperator" + msd, "deposit", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function withdrawTest(msd) {
  const providers = await task.contracts["bscOperator" + msd].getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to withdraw from", await getName(providerAddress));

    await sendTransaction(task, "bscOperator" + msd, "withdraw", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function depositToCBridge(msd) {
  await sendTransaction(task, "bscOperator" + msd, "depositToCBridge", [
    ethers.utils.parseEther("100000"),
  ]);
}

async function bscOperator(msd) {
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

async function bscOperatorUpgrade(msd) {
  // printTenderlyInsteadOfSend(
  //   TENDERLY_FORK_ID,
  //   "0x8C3984Fb0F649c304D68DB69457DBF137D156D7a" // from
  // );

  await deploy(msd);
  await upgradeBSCOperator(msd);
  await addProviders(msd);

  await depositTest(msd);
  await withdrawTest(msd);
  await depositToCBridge(msd);
}

async function main() {
  await bscOperator("EUX");

  // await bscOperatorUpgrade("USX");
}

run(task, main);
