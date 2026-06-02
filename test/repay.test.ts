import { ethers } from "hardhat";
import { expect } from "chai";

describe("VaultBase.repay", () => {
  const INITIAL_MINT = ethers.utils.parseEther("1000000");
  const OP_BALANCE = ethers.utils.parseEther("1000");

  async function setup() {
    const [owner, whitelistUser, other] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const usx = await MockERC20Factory.deploy("Mock USX", "mUSX");
    await usx.deployed();

    const MockMinterFactory = await ethers.getContractFactory("MockMinter");
    const minter = await MockMinterFactory.deploy(usx.address, INITIAL_MINT);
    await minter.deployed();

    const OperatorFactory = await ethers.getContractFactory("SimpleVaultOperator");
    const operator = await OperatorFactory.deploy(usx.address, minter.address);
    await operator.deployed();

    // operator holds USX to repay
    await usx.mint(operator.address, OP_BALANCE);

    return { usx, minter, operator, owner, whitelistUser, other };
  }

  it("reverts when called by non-whitelisted account", async () => {
    const { operator, other } = await setup();
    await expect(
      operator.connect(other).repay(OP_BALANCE)
    ).to.be.revertedWith("Account does not have the permission!");
  });

  it("burns operator USX AND reduces minter totalMint", async () => {
    const { usx, minter, operator, owner, whitelistUser } = await setup();

    await operator.connect(owner)._addToWhitelists(whitelistUser.address);

    const supplyBefore = await usx.totalSupply();
    await operator.connect(whitelistUser).repay(OP_BALANCE);

    expect(await usx.balanceOf(operator.address)).to.equal(0);
    expect(await usx.totalSupply()).to.equal(supplyBefore.sub(OP_BALANCE));
    expect(await minter.totalMint()).to.equal(INITIAL_MINT.sub(OP_BALANCE));
  });

  it("reverts if operator lacks USX to burn", async () => {
    const { minter, operator, owner, whitelistUser } = await setup();
    await operator.connect(owner)._addToWhitelists(whitelistUser.address);

    // try to repay more than the operator holds
    await expect(
      operator.connect(whitelistUser).repay(OP_BALANCE.add(1))
    ).to.be.reverted;
  });
});
