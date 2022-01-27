// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./OperatorBase.sol";
import "./FlashVaultOperator.sol";
import "./L2Operator.sol";

contract ArbiOperator is OperatorBase, FlashVaultOperator, L2Operator {
  function initialize(
    IERC20Upgradeable _usx,
    address _vToken,
    address _viToken,
    address _cBridge,
    address _l2Bridge
  ) external initializer {
    __OperatorBase_init(_usx);
    __FlashVaultOperator_init_unchained(_vToken, _viToken);
    __L2Operator_init_unchained(_cBridge, _l2Bridge);
  }

  /**
   * @dev Deposit USX that transfered by the corss-chain bridge to the Vault Token contract
   *      or the cBridge contract.
   * @param _data Encode data that contains operator contract address and the action that
   *              encode with the function selector.
   */
  function executeStrategy(bytes memory _data) external override nonReentrant {
    require(
      msg.sender == L2Bridge,
      "executeStrategy: Only for arbitrum bridge!"
    );
    (, bytes memory _dataWithSignature) = abi.decode(_data, (address, bytes));

    (bool _success, ) = address(this).call(_dataWithSignature);
    _success;
  }

  /**
   * @dev Deposit USX to the Vault Token contract.
   */
  function mint(uint256 _amount) external override {
    require(
      msg.sender == address(this),
      "mint: Only for operator contract self!"
    );
    vToken.mint(address(this), _amount);
  }

  /**
   * @dev Add liquidity of USX to the cBridge contract.
   */
  function addLiquidity(uint256 _amount) external override {
    require(
      msg.sender == address(this),
      "mint: Only for operator contract self!"
    );
    cBridge.addLiquidity(address(USX), _amount);
  }
}
