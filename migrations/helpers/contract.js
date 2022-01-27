export function getInitializerData(ImplFactory, args, initializer) {
  if (initializer === false) {
    return "0x";
  }

  const allowNoInitialization = initializer === undefined && args.length === 0;
  initializer = initializer ?? "initialize";

  try {
    if (ethers.version[0] == 4)
      return ImplFactory.interface.functions[initializer].encode(args);

    const fragment = ImplFactory.interface.getFunction(initializer);
    return ImplFactory.interface.encodeFunctionData(fragment, args);
  } catch (e) {
    if (e instanceof Error) {
      if (allowNoInitialization && e.message.includes("no matching function")) {
        return "0x";
      }
    }
    throw e;
  }
}

async function getContractFactoryByName(name, path = "contracts/") {
  // Hardhat has this helper function
  if (typeof remix !== "object") {
    return ethers.getContractFactory(name);
  }

  const contractPath = `browser/artifacts/${path}${name}.sol/${name}.json`;

  console.log(contractPath);

  // Use the hardhat artifact
  const artifacts = JSON.parse(
    await remix.call("fileManager", "getFile", contractPath)
  );

  return new ethers.ContractFactory(artifacts.abi, artifacts.bytecode);
}

export async function deployContractInternal(signer, contract, path, args) {
  const Contract = await getContractFactoryByName(contract, path);

  const deploy = await Contract.connect(signer).deploy(...args);
  await deploy.deployed();

  console.log(`${contract} deployed at ${deploy.address}`);

  return deploy;
}

export async function deployProxy(
  signer,
  contract,
  path,
  adminAddress,
  implAddress,
  args,
  initializer
) {
  const contractFactory = await getContractFactoryByName(contract, path);
  const data = getInitializerData(contractFactory, args, initializer);

  const proxy = await deployContractInternal(
    signer,
    "TransparentUpgradeableProxy",
    "@openzeppelin/contracts/proxy/",
    [implAddress, adminAddress, data]
  );

  //   console.log(proxy.address);
  return proxy;
}

export async function attachContractAtAdddress(
  signer,
  address,
  name,
  path = "contracts/"
) {
  // Hardhat has this helper function
  if (typeof remix !== "object") {
    return (await ethers.getContractFactory(name)).attach(address);
  }

  const contractPath = `browser/artifacts/${path}${name}.sol/${name}.json`;

  console.log(contractPath);

  // Use the hardhat artifact
  const artifacts = JSON.parse(
    await remix.call("fileManager", "getFile", contractPath)
  );

  return new ethers.Contract(address, artifacts.abi, signer);
}
