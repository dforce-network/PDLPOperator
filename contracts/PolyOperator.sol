// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./base/OperatorBase.sol";
import "./base/FVLiquidityOperator.sol";
import "./base/CBridgeOperator.sol";

contract PolyOperator is OperatorBase, FVLiquidityOperator, CBridgeOperator {
    constructor(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        IVault _vault,
        IcBridge _cBridge
    ) public {
        initialize(_usx, _flashVault, _vault, _cBridge);
    }

    function initialize(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        IVault _vault,
        IcBridge _cBridge
    ) public initializer {
        __OperatorBase_init(_usx);
        __FVLiquidityOperator_init_unchained(_flashVault);

        __VaultBase_init_unchained(_vault);
        __CBridgeOperator_init_unchained(_cBridge);
    }
}
