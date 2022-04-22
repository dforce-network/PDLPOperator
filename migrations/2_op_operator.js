import { run, sendTransaction } from "./helpers/utils";
import { deployContracts } from "./helpers/deploy";
import { printArgs } from "./helpers/timelock";
import { deposit, withdraw, depositToCBridge } from "./helpers/operator";

let task = { name: "PDLP" };

const network = {
  69: "optimism_kovan",
  10: "optimism",
};

let deployInfo = {
  optimism: {
    USX: "0xbfD291DA8A403DAAF7e5E9DC1ec0aCEaCd4848B9",
    iUSX: "0x7e7e1d8757b241Aa6791c089314604027544Ce43",
    // FLASH_VAULT
    vUSX: "0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a",
    viUSX: "0xA6a9EA5421ED356eC62fA4767A3745C5419aEbEC",
    cBridge: "0x9D39Fc627A6d9d9F8C831c16995b209548cc3401",
    opBridge: "0xc76cbFbAfD41761279E3EDb23Fd831Ccb74D5D67",
    WHITE_LIST: "0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75",
  },
  optimism_kovan: {
    USX: "0xab7020476D814C52629ff2e4cebC7A8cdC04F18E",
    VUSX: "",
    VIUSX: "",
    cBridge: "0x1e1a9f49D47AD5FAeADc03acA7a79BDbEA72A68d",
    opBridge: "0xB4d37826b14Cd3CB7257A2A5094507d701fe715f",
  },
};

async function deploy() {
  const info = deployInfo[network[task.chainId]];
  const USX = info.USX;
  const iUSX = info.iUSX;
  const vUSX = info.vUSX;
  const cBridge = info.cBridge;
  const opBridge = info.opBridge;

  task.contractsToDeploy = {
    opOperator: {
      contract: "OpOperator",
      useProxy: true,
      getArgs: () => [USX, vUSX, cBridge, opBridge],
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

async function addProviders() {
  const info = deployInfo[network[task.chainId]];
  const viUSX = info.viUSX;

  await sendTransaction(task, "opOperator", "_addProviderWithVCollateral", [
    task.deployments.dForceLendingProvider.address,
    viUSX,
  ]);

  await sendTransaction(task, "opOperator", "_addToWhitelists", [
    info.WHITE_LIST,
  ]);
}

async function opOperator() {
  // The flash vault should be deployed first
  await run(task, deploy);

  await run(task, addProviders);

  // Interact with the dForceLendingProvider
  await deposit(task, "opOperator", 0, ethers.utils.parseEther("100000"));
  await withdraw(task, "opOperator", 0, ethers.utils.parseEther("100000"));
  await depositToCBridge(task, "opOperator", ethers.utils.parseEther("100000"));
}

opOperator();
