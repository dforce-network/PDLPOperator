import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "dotenv/config";
// import "hardhat-contract-sizer";
// import "solidity-coverage";

const privateKey = process.env.PRIVATE_KEY;
const infuraKey = process.env.INFURA_KEY;
const alchemyKey = process.env.ALCHEMY_KEY;

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
export default {
  mocha: { timeout: 2000000 },
  networks: {
    hardhat: {
      forking: {
        // url: "https://eth-mainnet.alchemyapi.io/v2/" + alchemyKey,
        // url: "https://bsc-dataseed.binance.org/",
        url: "https://arb-mainnet.g.alchemy.com/v2/" + alchemyKey,
      },
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
};
