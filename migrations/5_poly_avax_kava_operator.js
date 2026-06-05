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
  1030: "confluxeSpace",
  8453: "base",
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
  confluxeSpace: {
    MSD_CONTROLLER: "0x13c0361698A38Ec1200C8BEC722F4D9aD0A2f558",
    WHITE_LIST: "0x655284BebCC6e1DfFd098Ec538750D43B57bC743",
    MSDs: {
      USX: {
        ADDR: "0x422a86f57b6b6F1e557d406331c25EEeD075E7aA",
        iToken: "0x6f87b39a2e36F205706921d81a6861B655db6358",
        viToken: "0x86516fd394781f9e23090F0A1e7C201DbDACc02C",
        vMToken: "0x2871cFaEcaeb16e1CECd8044B1A3892d9f706808",
        CBRIDGE: "0x841ce48f9446c8e281d3f1444cb859b4a6d0738c",
        WITHDRAWBOX: "0x78a21c1d3ed53a82d4247b9ee5bf001f4620ceec",
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
  base: {
    MSD_CONTROLLER: "0x82a295b259316c6180BBb7405909a2D1dB63e6D8",
    WHITE_LIST: "0x655284BebCC6e1DfFd098Ec538750D43B57bC743",
    MSDs: {
      USX: {
        ADDR: "0xc142171B138DB17a1B7Cb999C44526094a4dae05",
        iToken: "0x82AFc965E4E18009DD8d5AF05cfAa99bF0E605df",
        viToken: "0x5dE10D31af27C2cfD21f79a666CD9F9aDdf763E3",
        vMToken: "0xB8e4763bEf607d9253cfb28511f8C1073441CeeA",
        CBRIDGE: "0x7d43AABC515C356145049227CeE54B608342c0ad",
        WITHDRAWBOX: "0xAeC3b47eda9040b9C12F2Ac8d6980d2D2Bcc99F5",
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
    path: "contracts/",
    useProxy: true,
    getArgs: (deployments) => [
      MSD.ADDR,
      MSD.vMToken,
      deployments["pdlpMiniMinter" + msd].address,
      MSD.CBRIDGE,
      MSD.WITHDRAWBOX,
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
