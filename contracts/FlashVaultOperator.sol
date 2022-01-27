// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./library/SafeRatioMath.sol";
import "./OperatorBase.sol";

interface IiToken {
  function mint(address _to, uint256 _amount) external;

  function redeem(address _from, uint256 _redeemiToken) external;

  function balanceOf(address _account) external returns (uint256);

  function exchangeRateCurrent() external returns (uint256);
}

interface IvToken {
  function isiToken() external returns (bool);

  function underlying() external returns (address);

  function mint(address _to, uint256 _amount) external;

  function balanceOf(address _account) external returns (uint256);

  function repayBorrow(uint256 _repayAmount) external;

  function flashBorrow(uint256 _borrowAmount) external;
}

interface IviToken {
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

abstract contract FlashVaultOperator is OperatorBase {
  using SafeRatioMath for uint256;

  IvToken public vToken; // flash vault vUSX that supply/borrow USX
  IiToken public iToken; // lending iUSX that deposit USX
  IviToken public viToken; // flash vault viUSX that deposit lending iUSX
  IControllerFlashVault public controllerFlashVault;

  function __FlashVaultOperator_init(
    IERC20Upgradeable _usx,
    address _vToken,
    address _viToken
  ) internal {
    __OperatorBase_init(_usx);
    __FlashVaultOperator_init_unchained(_vToken, _viToken);
  }

  function __FlashVaultOperator_init_unchained(
    address _vToken,
    address _viToken
  ) internal {
    require(
      IvToken(_vToken).isiToken(),
      "initialize: Invalid vault token address!"
    );
    require(
      IviToken(_viToken).isiToken(),
      "initialize: Invalid vault iToken address!"
    );

    vToken = IvToken(_vToken);
    viToken = IviToken(_viToken);

    // Gets underlying token of the viToken.
    iToken = IiToken(viToken.underlying());

    // Gets controller contract of the viToken.
    address _controllerAddress = viToken.controller();
    controllerFlashVault = IControllerFlashVault(_controllerAddress);

    __Whitelist_init();
    __ReentrancyGuard_init();

    approveAll();
  }

  function approveAll() internal {
    // approve to iToken
    USX.safeApprove(address(iToken), uint256(-1));

    // approve to viToken
    IERC20Upgradeable(address(iToken)).safeApprove(
      address(viToken),
      uint256(-1)
    );

    address[] memory _collaterals = new address[](1);
    _collaterals[0] = address(viToken);
    bool[] memory _results = controllerFlashVault.enterMarkets(_collaterals);
    require(_results[0], "approveAll: Fail to enter market!");

    // approve vToken to mint vToken and repay underlying
    USX.approve(address(vToken), uint256(-1));
  }

  /*********************************/
  /******** Security Check *********/
  /*********************************/
  function isL2Operator() external pure returns (bool) {
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
    vToken.flashBorrow(_borrowAmount);
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

    viToken.flashRedeemUnderlying(_actualRepayAmount);
  }

  /**
   * @notice Should call `approveAll` at first.
   */
  function executeFlashBorrow(uint256 _amount) external {
    require(
      msg.sender == address(vToken),
      "executeFlashBorrow: The caller is not the Falsh Vault iToken!"
    );
    iToken.mint(address(this), _amount);

    uint256 _iTokenBalance = iToken.balanceOf(address(this));

    viToken.mint(address(this), _iTokenBalance);
  }

  function executeFlashRepay(uint256 _amount) external {
    require(
      msg.sender == address(viToken),
      "executeFlashRepay: The caller is not the iToken Vault!"
    );
    iToken.redeem(address(this), _amount);

    uint256 _underlyingBalance = USX.balanceOf(address(this));

    vToken.repayBorrow(_underlyingBalance);
  }

  /**
   * @notice Only for the owner account.
   */
  function rescueTokens(address _token, uint256 _amount)
    external
    nonReentrant
    onlyOwner
  {
    IERC20Upgradeable(_token).safeTransfer(msg.sender, _amount);
  }
}
