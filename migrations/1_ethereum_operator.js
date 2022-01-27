import { run, sendTransaction } from "./helpers/utils.js";
import { deployContracts } from "./helpers/deploy.js";
import { printArgs } from "./helpers/timelock.js";
import { attachContractAtAdddress } from "./helpers/contract";

let task = { name: "PDLP" };

const network = {
  1: "mainnet",
  4: "rinkeby",
  42: "kovan",
};

let deployInfo = {
  mainnet: {
    USX: "0x0a5E677a6A24b2F1A2Bf4F3bFfC443231d2fDEc8",
    MSD_CONTROLLER: "0x45677a101D70E9910C418D9426bC6c5874CE2Fd7",
    ARB_L1_GATEWAY: "0x870ac6a76A30742800609F205c741E86Db9b71a2",
    ARB_L2_OPERATOR: "0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4",
    L1_CBRIDGE: "0x5427FEFA711Eff984124bFBB1AB6fbf5E3DA1820",
    MINT_CAP: ethers.utils.parseEther("300000000"),
    OP_L1_GATEWAY: "0x870ac6a76A30742800609F205c741E86Db9b71a2",
    OP_L2_OPERATOR: "0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4",
    iUSX: "0x1AdC34Af68e970a93062b67344269fD341979eb0",
    qUSX: "0xA5d65E3bD7411D409EC2CCFa30C6511bA8a99D2B",
  },
  rinkeby: {
    USX: "0x2D76117C2C85c2E9C9FBF08199C9Be59af887526",
    MSD_CONTROLLER: "0x5161E46cd371e6CAe38ebD903DA03b5D559c7981",
    ARB_L1_GATEWAY: "0x9f94c5136A80B994AD53acfeF5e3F27609D221a8",
    ARB_L2_OPERATOR: "0x517237123bd7aFe8FC0e8a3a7F03a59511A910cF",
    L1_CBRIDGE: "0x4AC85451c974cF297e4Cf754036Dcc01182e1694",
    MINT_CAP: ethers.utils.parseEther("300000000"),
    OP_L1_GATEWAY: "0x870ac6a76A30742800609F205c741E86Db9b71a2",
    OP_L2_OPERATOR: "0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4",
    iUSX: "",
    qUSX: "",
  },
  kovan: {
    USX: "0xF76eAd4da04BbeB97d29F83e2Ec3a621d0FB3c6e",
    MSD_CONTROLLER: "0xF25beAE3d7cc31D666FeCcfF4a1304c9635A6FE4",
    // Kovan does not have arbitrum yet
    ARB_L1_GATEWAY: "0x9f94c5136A80B994AD53acfeF5e3F27609D221a8",
    ARB_L2_OPERATOR: "0x517237123bd7aFe8FC0e8a3a7F03a59511A910cF",
    L1_CBRIDGE: "0x2180323728a70d43779c653555A72B0e3E467C4C",
    MINT_CAP: ethers.utils.parseEther("300000000"),
    L2_USX: "0xab7020476D814C52629ff2e4cebC7A8cdC04F18E",
    OP_L1_GATEWAY: "0x40E862341b2416345F02c41Ac70df08525150dC7",
    OP_L2_OPERATOR: "0x85385347281690BCAb93b6d6B33babC2CE275800",
    iUSX: "0x9778dde08eC20418DC735a94805c20F5e2E7e51E",
    qUSX: "0x87A78b2e8f771Ae6Fb11e6D4d9767Cf8865A6fA9",
  },
};

async function deploy() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const MSD_CONTROLLER = info.MSD_CONTROLLER;
  const ARB_L1_GATEWAY = info.ARB_L1_GATEWAY;
  const ARB_L2_OPERATOR = info.ARB_L2_OPERATOR;
  const L1_CBRIDGE = info.L1_CBRIDGE;

  task.contractsToDeploy = {
    pdlpMiniMinter: {
      contract: "MiniMinter",
      path: "contracts/msd/",
      useProxy: true,
      getArgs: () => [USX, MSD_CONTROLLER],
    },
    l1BridgeOperator: {
      contract: "L1BridgeOperator",
      path: "contracts/operator/",
      useProxy: true,
      getArgs: (deployments) => [
        USX,
        deployments.pdlpMiniMinter.address,
        ARB_L1_GATEWAY,
        ARB_L2_OPERATOR,
        L1_CBRIDGE,
      ],
    },
  };

  await deployContracts(task);
}

async function setOwner() {
  await sendTransaction(task, "pdlpMiniMinter", "_setPendingOwner", [
    task.deployments.l1BridgeOperator.address,
  ]);

  await sendTransaction(task, "l1BridgeOperator", "acceptOwner", []);

  await sendTransaction(task, "l1BridgeOperator", "_addToWhitelists", [
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

async function depositToL2() {
  const amount = ethers.utils.parseEther("100000000");
  const maxGas = 1000000;
  const gasPriceBid = ethers.utils.parseUnits("10", "gwei");
  const data = "0x";

  await sendTransaction(task, "l1BridgeOperator", "depositToBridge", [
    amount,
    maxGas,
    gasPriceBid,
    data,
  ]);
}

async function addToWhitelists() {
  await sendTransaction(task, "l1BridgeOperator", "_addToWhitelists", [
    "0x18c30D9569fEb3ea3644573b013D329dD9fd01Af",
  ]);

  await sendTransaction(task, "l1BridgeOperator", "_addToWhitelists", [
    "0xcC27B0206645aDbE5b5C8d212c2a98574090B68F",
  ]);
}

async function upgradeEthereumOperator() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const ARB_L1_GATEWAY = info.ARB_L1_GATEWAY;
  const ARB_L2_OPERATOR = info.ARB_L2_OPERATOR;
  const L1_CBRIDGE = info.L1_CBRIDGE;
  const iUSX = info.iUSX;
  const qUSX = info.qUSX;
  const L2_USX = info.L2_USX;
  const OP_L1_GATEWAY = info.OP_L1_GATEWAY;
  const OP_L2_OPERATOR = info.OP_L2_OPERATOR;

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
    ethereumOperatorImpl: {
      contract: "EthereumOperator",
      useProxy: false,
      getArgs: (deployments) => [
        USX,
        deployments.pdlpMiniMinter.address,
        ARB_L1_GATEWAY,
        ARB_L2_OPERATOR,
        L1_CBRIDGE,
        L2_USX,
        OP_L1_GATEWAY,
        OP_L2_OPERATOR,
      ],
    },
  };

  await deployContracts(task);

  const upgradeCalldata = (
    await task.contracts.ethereumOperator.populateTransaction["upgrade"](
      L2_USX,
      OP_L1_GATEWAY,
      OP_L2_OPERATOR
    )
  ).data;

  // Direct sendTransaction if no Timelock
  await sendTransaction(task, "proxyAdmin", "upgradeAndCall", [
    task.deployments.ethereumOperator.address,
    task.deployments.ethereumOperatorImpl.address,
    upgradeCalldata,
  ]);

  // print data if use Timelock
  // await printArgs(task, [
  //   [
  //     "proxyAdmin",
  //     "upgradeAndCall",
  //     [
  //       task.deployments.ethereumOperator.address,
  //       task.deployments.ethereumOperatorImpl.address,
  //       upgradeCalldata,
  //     ],
  //   ],
  // ]);
}

async function addProviders() {
  await sendTransaction(task, "ethereumOperator", "_addProvider", [
    task.deployments.dForceLendingProvider.address,
  ]);

  await sendTransaction(task, "ethereumOperator", "_addProvider", [
    task.deployments.liqeeProvider.address,
  ]);
}

async function depositTest() {
  const providers = await task.contracts.ethereumOperator.getProviders();

  let index = 0;
  for (const providerAddress of providers) {
    const provider = await attachContractAtAdddress(
      task.signer,
      providerAddress,
      "iTokenProvider",
      "contracts/base/providers/"
    );
    console.log("Going to deposit to", await provider.name());

    await sendTransaction(task, "ethereumOperator", "deposit", [
      index,
      ethers.utils.parseEther("10000000"),
    ]);

    index++;
  }
}

// run(task, deploy);
// run(task, setOwner);
// run(task, addUSXMinter);
// run(task, depositToL2);
// run(task, addToWhitelists);

// run(task, upgradeEthereumOperator);
// run(task, addProviders);
run(task, depositTest);
