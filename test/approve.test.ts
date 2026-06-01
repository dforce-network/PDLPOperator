import { ethers } from "hardhat";
import { expect } from "chai";

describe("OperatorBase.approve", () => {
  async function setup() {
    const [owner, whitelistUser, other] = await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20Factory.deploy("Mock USX", "mUSX");
    await token.deployed();

    const SimpleOperatorFactory = await ethers.getContractFactory("SimpleOperator");
    const operator = await SimpleOperatorFactory.deploy(token.address);
    await operator.deployed();

    await token.mint(operator.address, ethers.utils.parseEther("1000000"));

    return { operator, token, owner, whitelistUser, other };
  }

  it("reverts when called by non-whitelisted account", async () => {
    const { operator, token, other } = await setup();
    await expect(
      operator.connect(other).approve(token.address)
    ).to.be.revertedWith("Account does not have the permission!");
  });

  it("grants max allowance to whitelisted caller", async () => {
    const { operator, token, owner, whitelistUser } = await setup();

    await operator.connect(owner)._addToWhitelists(whitelistUser.address);
    await operator.connect(whitelistUser).approve(token.address);

    const allowance = await token.allowance(operator.address, whitelistUser.address);
    expect(allowance).to.equal(ethers.constants.MaxUint256);
  });

  it("allows any token address, not only USX", async () => {
    const { operator, owner, whitelistUser } = await setup();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const otherToken = await MockERC20Factory.deploy("Other Token", "OTH");
    await otherToken.deployed();
    await otherToken.mint(operator.address, ethers.utils.parseEther("500"));

    await operator.connect(owner)._addToWhitelists(whitelistUser.address);
    await operator.connect(whitelistUser).approve(otherToken.address);

    const allowance = await otherToken.allowance(operator.address, whitelistUser.address);
    expect(allowance).to.equal(ethers.constants.MaxUint256);
  });
});
