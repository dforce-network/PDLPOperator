import {
  run,
  sendTransaction,
  sendTransactionInsteadOfPrint,
  printTransactionInsteadOfSend,
  printTenderlyInsteadOfSend,
} from "./helpers/utils.js";
import { deployContracts } from "./helpers/deploy.js";
import { printArgs } from "./helpers/timelock.js";
import { attachContractAtAdddress } from "./helpers/contract.js";

const TENDERLY_FORK_ID = "63f6805a-d859-45ae-9073-15e24a6537d7";

let task = { name: "PDLP" };

const network = {
  280: "zkSyncEraTestnet",
  324: "zkSyncEra",
};

let deployInfo = {
  zkSyncEraTestnet: {
    MSD_CONTROLLER: "0x4291D97680a828C0EaA9C4A49bC05fE2c7A6094e",
    WHITE_LIST: "0x6b29b8af9AF126170513AE6524395E09025b214E",
    MSDs: {
      USX: {
        ADDR: "0x7fFBa6Ce2f536fC9782ff9AA1EbBa186849BAb89",
        iToken: ethers.constants.AddressZero,
        viToken: ethers.constants.AddressZero,
        vMToken: ethers.constants.AddressZero,
        CBRIDGE: "0x427F4542bA6208DF2B0b75B0a2d0797CbEba1628",
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
  zkSyncEra: {
    MSD_CONTROLLER: "0x6C56a24D587357e13bf9daBeA9f6bb2Cf3fda97c",
    WHITE_LIST: "",
    MSDs: {
      USX: {
        ADDR: "0xdb89D7b0Dccd0C0e5aC3571133A9aa1a037945cb",
        iToken: ethers.constants.AddressZero,
        viToken: ethers.constants.AddressZero,
        vMToken: ethers.constants.AddressZero,
        CBRIDGE: "0x54069e96C4247b37C2fbd9559CA99f08CD1CD66c",
        WITHDRAWBOX: "0x80Bd61013F1ca7908b75d88AD08f8dBdEab4e779",
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
  task.contractsToDeploy["pdlpOperator" + msd] = {
    contract: "ZksyncOperator",
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
  // task.contractsToDeploy["dForceLendingProvider" + msd] = {
  //   contract: "dForceLendingProvider",
  //   path: "contracts/base/providers/",
  //   useProxy: false,
  //   getArgs: () => [MSD.iToken],
  // };

  await deployContracts(task);
}

async function setOwner(msd) {
  const info = deployInfo[network[task.chainId]];

  await sendTransaction(task, "pdlpMiniMinter" + msd, "_setPendingOwner", [
    task.deployments["pdlpOperator" + msd].address,
  ]);

  await sendTransaction(task, "pdlpOperator" + msd, "acceptOwner", []);

  await sendTransaction(task, "pdlpOperator" + msd, "_addToWhitelists", [
    info.WHITE_LIST,
  ]);
}

async function addProviders(msd) {
  const info = deployInfo[network[task.chainId]];
  const viToken = info.MSDs[msd].viToken;

  await sendTransaction(
    task,
    "pdlpOperator" + msd,
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
  await sendTransaction(task, "pdlpOperator" + msd, "depositToCBridge", [
    ethers.utils.parseEther("10000"),
  ]);
}

async function depositTest(msd) {
  const providers = await task.contracts["pdlpOperator" + msd].getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to deposit to", await getName(providerAddress));

    await sendTransaction(task, "pdlpOperator" + msd, "deposit", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function withdrawTest(msd) {
  const providers = await task.contracts["pdlpOperator" + msd].getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    console.log("Going to withdraw from", await getName(providerAddress));

    await sendTransaction(task, "pdlpOperator" + msd, "withdraw", [
      index,
      ethers.utils.parseEther("100000"),
    ]);

    index++;
  }
}

async function pdlpOperator(msd) {
  // printTenderlyInsteadOfSend(
  //   TENDERLY_FORK_ID,
  //   "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75"
  // );

  // The flash vault should be deployed first
  await deploy(msd);
  await setOwner(msd);

  // No need for providers on zksync now
  // await addProviders(msd);

  // After minter and whitelist is set, we can deposit
  // await depositTest(msd);
  // await withdrawTest(msd);

  await depositToCBridge(msd);
}

async function main() {
  await pdlpOperator("USX");

  // await pdlpOperator("EUX");
}

run(task, main);
