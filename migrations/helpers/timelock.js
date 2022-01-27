async function getSignatureAndData(task, contract, method, args) {
  const target = task.contracts[contract].address;
  const value = 0;

  // We are not owner of the contract, so estimate gas would fail

  // // Try to estimate gas to check whether transaction is valid
  // try {
  //   await task.contracts[contract].estimateGas[method](...args);
  // } catch (e) {
  //   throw `estimateGas ${contract}.${method}(${args}) failed`;
  // }

  const tx = await task.contracts[contract].populateTransaction[method](
    ...args
  );
  const signature = task.contracts[contract].interface.parseTransaction(tx)
    .signature;
  const calldata = "0x" + tx.data.substr(10);

  return { target, value, signature, calldata };
}

function format_for_etherscan(args) {
  return JSON.stringify(args).replace(/\"/g, "");
}

const etherscan_url = {
  1: "https://etherscan.io/address",
  56: "https://bscscan.com/address",
  42161: "https://abiscan.io/address",
};

async function printArgsForExecuteTransactions(task, transactions) {
  let targets = [];
  let values = [];
  let signatures = [];
  let calldatas = [];

  for (const [contract, method, args] of transactions) {
    const { target, value, signature, calldata } = await getSignatureAndData(
      task,
      contract,
      method,
      args
    );

    targets.push(target);
    values.push(value);
    signatures.push(signature);
    calldatas.push(calldata);
  }

  console.log(
    "-----------------------------------------------------------------------------"
  );

  console.log("link:");
  console.log(
    `${etherscan_url[task.chainId]}/${
      task.deployments.timeLock.address
    }#writeContract\n`
  );

  const owner = await task.contracts.timeLock.owner();
  console.log(`owner:\n ${owner}\n`);

  console.log("4.executeTransactions");
  console.log("\n");

  console.log("executeTransactions");
  console.log("0");
  console.log("\n");

  console.log("targets (address[])");
  console.log(format_for_etherscan(targets));
  console.log("\n");

  console.log("values (uint256[])");
  console.log(format_for_etherscan(values));
  console.log("\n");

  // Signature is string[], it needs quotes ""
  console.log("signatures (string[])");
  console.log(JSON.stringify(signatures));
  console.log("\n");

  console.log("calldatas (bytes[])");
  console.log(format_for_etherscan(calldatas));
  console.log("\n");

  console.log("timeLock transaction data");
  console.log(
    await task.contracts["timeLock"].populateTransaction.executeTransactions(
      targets,
      values,
      signatures,
      calldatas
    )
  );
}

export async function printArgs(task, transactions) {
  await printArgsForExecuteTransactions(task, transactions);
}
