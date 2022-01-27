// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "./library/Initializable.sol";
import "./library/Ownable.sol";

/**
 * @dev Interface for MSDController
 */
interface IMSDController {
  function mintMSD(
    address token,
    address to,
    uint256 amount
  ) external;

  function isMSDController() external returns (bool);
}

/**
 * @dev Interface for MSD
 */
interface IMSD {
  function burn(address from, uint256 amount) external;
}

/**
 * @dev Interface for Minters
 */
interface IMinter {
  function totalMint() external returns (uint256);

  function borrow(uint256 amount) external;

  function repayBorrow(uint256 amount) external;

  event Borrow(address borrower, uint256 borrowAmount);

  event RepayBorrow(address borrower, uint256 repayAmount);
}

/**
 * @title dForce's Multi-currency Stable Debt Token Credit Minter
 * @author dForce
 */

contract MiniMinter is Initializable, Ownable, IMinter {
  using SafeMathUpgradeable for uint256;

  IMSD public msd;
  IMSDController public msdController;

  uint256 public override totalMint;

  constructor(IMSD _msd, IMSDController _msdController) public {
    initialize(_msd, _msdController);
  }

  /**
   * @notice Expects to call only once to initialize the MSD CreditMinter.
   */
  function initialize(IMSD _msd, IMSDController _msdController)
    public
    initializer
  {
    require(address(_msd) != address(0), "msd cannot be zero address");
    require(
      _msdController.isMSDController(),
      "msdController is not MSD controller contract!"
    );

    __Ownable_init();

    msd = _msd;
    msdController = _msdController;
  }

  /**
   * @dev Caller borrows tokens from the minter to their own address.
   * @param _amount The amount of msd token to borrow.
   */
  function borrow(uint256 _amount) external virtual override onlyOwner {
    totalMint = totalMint.add(_amount);
    msdController.mintMSD(address(msd), msg.sender, _amount);

    emit Borrow(msg.sender, _amount);
  }

  /**
   * @dev Caller repays their own borrow.
   * @param _amount The amount of msd token to repay.
   */
  function repayBorrow(uint256 _amount) external virtual override onlyOwner {
    totalMint = totalMint.sub(_amount);
    msd.burn(msg.sender, _amount);

    emit RepayBorrow(msg.sender, _amount);
  }
}
