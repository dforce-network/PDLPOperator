import { attachContractAtAdddress } from "./contract";
import { sendTransaction } from "./utils";

async function getName(task, contractAddr) {
  const provider = await attachContractAtAdddress(
    task.signer,
    contractAddr,
    "iTokenProvider",
    "contracts/base/providers/"
  );

  return provider.name();
}

export async function depositToCBridge(task, operator_key, amount) {
  await sendTransaction(task, operator_key, "depositToCBridge", [amount]);
}

export async function deposit(task, operator_key, index, amount) {
  const providers = await task.contracts[operator_key].getProviders();

  console.log("Going to deposit to", await getName(task, providers[index]));

  await sendTransaction(task, operator_key, "deposit", [index, amount]);
}

export async function withdraw(task, operator_key, index, amount) {
  const providers = await task.contracts[operator_key].getProviders();

  console.log("Going to withdraw from", await getName(task, providers[index]));

  await sendTransaction(task, operator_key, "withdraw", [index, amount]);
}
