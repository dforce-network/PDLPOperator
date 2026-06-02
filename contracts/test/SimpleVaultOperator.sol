// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../base/VaultBase.sol";

// Concrete VaultBase for unit-testing the repay() cleanup passthrough.
contract SimpleVaultOperator is VaultBase {
    constructor(IERC20Upgradeable _usx, IVault _vault) public {
        __VaultBase_init(_usx, _vault);
    }
}
