import { run, sendTransaction } from "./helpers/utils";
import { deployContracts } from "./helpers/deploy";
import { printArgs } from "./helpers/timelock";

let task = { name: "PDLP" };

const network = {
  69: "optimism_kovan",
  10: "optimism",
};

let deployInfo = {
  optimism: {
    USX: "0xbfD291DA8A403DAAF7e5E9DC1ec0aCEaCd4848B9",
    VUSX: "",
    VIUSX: "",
    cBridge: "0x9D39Fc627A6d9d9F8C831c16995b209548cc3401",
    opBridge: "0xc76cbFbAfD41761279E3EDb23Fd831Ccb74D5D67",
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
  const VUSX = info.VUSX;
  const VIUSX = info.VIUSX;
  const cBridge = info.cBridge;
  const opBridge = info.opBridge;

  task.contractsToDeploy = {
    opOperator: {
      contract: "OpOperator",
      useProxy: true,
      getArgs: () => [USX, VUSX, VIUSX, cBridge, opBridge],
    },
  };
  await deployContracts(task);

  await sendTransaction(task, "opOperator", "_addToWhitelists", [
    task.signerAddr,
  ]);
}

run(task, deploy);
