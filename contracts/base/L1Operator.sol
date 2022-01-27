// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../library/Whitelists.sol";
import "../library/Initializable.sol";
import "../library/ReentrancyGuard.sol";
import "../library/SafeRatioMath.sol";

interface IiMToken {
  function isiToken() external returns (bool);

  function underlying() external returns (address);

  function flashBorrow(uint256 _borrowAmount) external;

  function repayBorrow(uint256 _repayAmount) external;
}

interface IiToken {
  function mint(address _to, uint256 _amount) external;

  function redeem(address _from, uint256 _redeemiToken) external;

  function redeemUnderlying(address _from, uint256 _redeemiToken) external;

  function balanceOf(address _account) external returns (uint256);

  function exchangeRateCurrent() external returns (uint256);
}

interface IiiToken {
  function isiToken() external returns (bool);

  function underlying() external returns (address);

  function controller() external returns (address);

  function mint(address _to, uint256 _amount) external;

  function flashRedeemUnderlying(uint256 _redeemUnderlying) external;
}

interface IControllerFlashVault {
  function enterMarkets(address[] calldata _iTokens)
    external
    returns (bool[] memory _results);
}

contract L1Operator is Initializable, ReentrancyGuard, Whitelists {
  using SafeERC20 for IERC20;
  using SafeRatioMath for uint256;

  IiMToken public iMToken;
  IERC20 public underlying;
  IiToken public iToken;
  IiiToken public iiToken;
  IControllerFlashVault public controllerFlashVault;

  function initialize(address _iiToken, address _iMToken) public initializer {
    require(
      IiiToken(_iiToken).isiToken(),
      "initialize: Invalid vault iToken address!"
    );
    require(
      !IiMToken(_iMToken).isiToken(),
      "initialize: Invalid vault iMToken address!"
    );

    iiToken = IiiToken(_iiToken);
    iMToken = IiMToken(_iMToken);

    // Gets underlying token of the iMtoken.
    address _iMTokenUnderlying = iMToken.underlying();
    underlying = IERC20(_iMTokenUnderlying);

    // Gets underlying token of the iiToken.
    address _iTokenUnderlying = iiToken.underlying();
    iToken = IiToken(_iTokenUnderlying);

    // Gets controller contract of the iiToken.
    address _controllerAddress = iiToken.controller();
    controllerFlashVault = IControllerFlashVault(_controllerAddress);

    __Whitelist_init();
    __ReentrancyGuard_init();

    approveAll();
  }

  function approveAll() internal {
    // approve to iToken
    underlying.approve(address(iToken), uint256(-1));

    // approve to iiToken
    IERC20(address(iToken)).approve(address(iiToken), uint256(-1));

    address[] memory collaterals = new address[](1);
    collaterals[0] = address(iiToken);
    controllerFlashVault.enterMarkets(collaterals);

    // approve iMtoken
    underlying.approve(address(iMToken), uint256(-1));
  }

  /*********************************/
  /******** Security Check *********/
  /*********************************/
  function isFlashVault() external pure returns (bool) {
    return true;
  }

  /**
   * @notice Only for the user who is in the whitelist.
   * @dev Borrows USX without collaterals at first, then do any actions in this contract,
   *      finally, it should deposit collaterals to ensure there is no any shortfall.
   */
  function flashBorrow(uint256 _borrowAmount)
    external
    nonReentrant
    onlyWhitelist(msg.sender)
  {
    iMToken.flashBorrow(_borrowAmount);
  }

  /**
   * @notice Only for the user who is in the whitelist.
   * @dev Withdraws iToken without repaying borrowed assets at first, then do any actions
   *      in this contract, finally it should repay borrowed assets to ensure there is
   *      no any shortfall.
   */
  function flashRepayUnderlying(uint256 _repayAmount)
    external
    nonReentrant
    onlyWhitelist(msg.sender)
  {
    uint256 _currentExchangeRate = iToken.exchangeRateCurrent();
    uint256 _actualRepayAmount = _repayAmount.rdivup(_currentExchangeRate);

    iiToken.flashRedeemUnderlying(_actualRepayAmount);
  }

  /**
   * @notice Should call `approveAll` at first.
   */
  function executeFlashBorrow(uint256 _amount) external {
    require(
      msg.sender == address(iMToken),
      "executeFlashBorrow: The caller is not the iMtoken!"
    );
    iToken.mint(address(this), _amount);

    uint256 _iTokenBalance = iToken.balanceOf(address(this));

    iiToken.mint(address(this), _iTokenBalance);
  }

  function executeFlashRepay(uint256 _amount) external {
    require(
      msg.sender == address(iiToken),
      "executeFlashRepay: The caller is not the iToken Vault!"
    );
    iToken.redeem(address(this), _amount);

    uint256 _underlyingBalance = underlying.balanceOf(address(this));

    iMToken.repayBorrow(_underlyingBalance);
  }

  /**
   * @notice Only for the owner account.
   */
  function rescueTokens(address _token, uint256 _amount)
    external
    nonReentrant
    onlyOwner
  {
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }
}
