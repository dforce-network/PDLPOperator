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
  2222: "kava",
  43114: "avalanche",
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
        ADDR: "0x448BBbDB706cD0a6AB74fA3d1157e7A33Dd3A4a8",
        iToken: "0x15962427A9795005c640A6BF7f99c2BA1531aD6d",
        viToken: "0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a",
        vMToken: "0x271479036bB31DE5BD4A3544Ed5bA2b8Ef4eEbD3",
        CBRIDGE: "0x88DCDC47D2f83a99CF0000FDF667A468bB958a78",
      },
    },
  },
  kava: {
    MSD_CONTROLLER: "0x853ea32391AaA14c112C645FD20BA389aB25C5e0",
    WHITE_LIST: "0x75B9a7B6F55754D4d0e952da4bDB55eAeA7dF38e",
    MSDs: {
      USX: {
        ADDR: "0xDb0E1e86B01c4ad25241b1843E407Efc4D615248",
        iToken: "0x9787aF345E765a3fBf0F881c49f8A6830D94A514",
        viToken: "0x7Ad45b901f4d15a2756E422768D1f4d37dAf96c1",
        vMToken: "0x9Ee9Ed4b19100DEb781313D426A43adf2A218AB4",
        CBRIDGE: "0xb51541df05DE07be38dcfc4a80c05389A54502BB",
      },
      // EUX: {
      //   ADDR: "0x448BBbDB706cD0a6AB74fA3d1157e7A33Dd3A4a8",
      //   iToken: "0x15962427A9795005c640A6BF7f99c2BA1531aD6d",
      //   viToken: "0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a",
      //   vMToken: "0x271479036bB31DE5BD4A3544Ed5bA2b8Ef4eEbD3",
      //   CBRIDGE: "0x88DCDC47D2f83a99CF0000FDF667A468bB958a78",
      // },
    },
  },
  avalanche: {
    MSD_CONTROLLER: "0x654f07ee98022Ec7Ed66DabDC5C0da18868bC2f0",
    WHITE_LIST: "0x75B9a7B6F55754D4d0e952da4bDB55eAeA7dF38e",
    MSDs: {
      USX: {
        ADDR: "0x853ea32391AaA14c112C645FD20BA389aB25C5e0",
        iToken: "0x73C01B355F2147E5FF315680E068354D6344Eb0b",
        viToken: "0x511eE68214890773ad112B15574d08980A83b770",
        vMToken: "0xf6f2E11C6974cb7910Ba17F22a0B40709aCA6cb2",
        CBRIDGE: "0xef3c714c9425a8F3697A9C969Dc1af30ba82e5d4",
      },
      // EUX: {
      //   ADDR: "0x448BBbDB706cD0a6AB74fA3d1157e7A33Dd3A4a8",
      //   iToken: "0x15962427A9795005c640A6BF7f99c2BA1531aD6d",
      //   viToken: "0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a",
      //   vMToken: "0x271479036bB31DE5BD4A3544Ed5bA2b8Ef4eEbD3",
      //   CBRIDGE: "0x88DCDC47D2f83a99CF0000FDF667A468bB958a78",
      // },
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
    path: "contracts/",
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
  await polyOperator("USX");

  // await polyOperator("EUX");
}

run(task, main);
