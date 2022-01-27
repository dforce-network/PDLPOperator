// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./OperatorBase.sol";

interface IcBridge {
  function addLiquidity(address _token, uint256 _amount) external;
}

abstract contract L2Operator is OperatorBase {
  IcBridge public cBridge;
  address public L2Bridge;

  function __L2Operator_init(
    IERC20Upgradeable _usx,
    address _cBridge,
    address _L2Bridge
  ) internal {
    __OperatorBase_init(_usx);
    __L2Operator_init_unchained(_cBridge, _L2Bridge);
  }

  function __L2Operator_init_unchained(address _cBridge, address _L2Bridge)
    internal
  {
    require(
      _cBridge != address(0),
      "initialize: cBridge contract can not be the zero address!"
    );
    require(
      _L2Bridge != address(0),
      "initialize: L2 bridge contract can not be the zero address!"
    );

    cBridge = IcBridge(_cBridge);
    L2Bridge = _L2Bridge;

    // approve underlying to cBridge
    USX.approve(address(cBridge), uint256(-1));
  }

  /**
   * @dev Deposit USX that transfered by the corss-chain bridge to the Vault Token contract
   *      or the cBridge contract.
   * @param _data Encode data to execute.
   */
  function executeStrategy(bytes memory _data) external virtual {}

  /**
   * @dev Deposit USX.
   */
  function mint(uint256 _amount) external virtual {}

  /**
   * @dev Add liquidity of USX.
   */
  function addLiquidity(uint256 _amount) external virtual {}
}
