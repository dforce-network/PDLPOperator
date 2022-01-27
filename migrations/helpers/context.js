import { getProvider, loadJSON, saveJSON } from "./utils.js";
import { attachContractAtAdddress } from "./contract.js";

async function loadContracts(task) {
  task.contracts = {};
  for (const [name, { contract, path, address }] of Object.entries(
    task.deployments
  )) {
    // console.log(name);
    task.contracts[name] = await attachContractAtAdddress(
      task.signer,
      address,
      contract,
      path
    );
    // console.log(task.contracts[name].interface);
  }

  // console.log(task.contracts["generalPoolController"].interface);
}

async function getDeploymentsFile(task) {
  return `deployments/${task.name}-${task.chainId}.json`;
}

async function loadDeployments(task) {
  return await loadJSON(await getDeploymentsFile(task));
}

async function saveDeployments(task) {
  await saveJSON(await getDeploymentsFile(task), task.deployments);
}

export async function init(task) {
  const provider = getProvider();
  const network = await provider.getNetwork();
  task.chainId = network.chainId;
  console.log(`Chain ID: ${network.chainId}`);

  const signer = provider.getSigner();
  const signerAddr = await signer.getAddress();
  task.signer = signer;
  task.signerAddr = signerAddr;
  console.log(`Signer Address: ${signerAddr}`);

  task.deployments = await loadDeployments(task);

  await loadContracts(task);
  return task;
}

export async function finalize(task) {
  await saveDeployments(task);
}
