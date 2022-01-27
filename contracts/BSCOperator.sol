// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./L1Operator.sol";
import "./CBridgeOperator.sol";

contract BSCOperator is L1Operator, CBridgeOperator {
  function initialize(
    address _viToken,
    address _vMToken,
    IERC20Upgradeable _usx,
    IVault _vault,
    IcBridge _cBridge
  ) external initializer {
    L1Operator.initialize(_viToken, _vMToken);

    __CBridgeOperator_init(_usx, _vault, _cBridge);
  }

  function upgrade(
    IERC20Upgradeable _usx,
    IVault _vault,
    IcBridge _cBridge
  ) external {
    require(address(USX) == address(0), "Operator already upgraded");

    __CBridgeOperator_init(_usx, _vault, _cBridge);
  }
}
