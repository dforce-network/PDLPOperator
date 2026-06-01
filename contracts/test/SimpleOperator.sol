// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../base/OperatorBase.sol";

contract SimpleOperator is OperatorBase {
    constructor(IERC20Upgradeable _usx) public {
        __OperatorBase_init(_usx);
    }
}
