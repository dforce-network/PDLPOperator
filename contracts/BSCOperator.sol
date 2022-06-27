// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./base/OperatorBase.sol";
import "./base/FVLiquidityOperator.sol";
import "./base/CBridgeOperator.sol";
import "./base/CBridgeWithdrawer.sol";

contract BSCOperator is
    OperatorBase,
    FVLiquidityOperator,
    CBridgeOperator,
    CBridgeWithdrawer
{
    constructor(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        IVault _vault,
        IcBridge _cBridge,
        IWithdrawBox _withdrawBox
    ) public {
        initialize(_usx, _flashVault, _vault, _cBridge, _withdrawBox);
    }

    function initialize(
        IERC20Upgradeable _usx,
        IFlashVault _flashVault,
        IVault _vault,
        IcBridge _cBridge,
        IWithdrawBox _withdrawBox
    ) public initializer {
        __OperatorBase_init(_usx);
        __FVLiquidityOperator_init_unchained(_flashVault);

        __VaultBase_init_unchained(_vault);
        __CBridgeOperator_init_unchained(_cBridge);
        __CBridgeWithdrawer_init_unchained(_withdrawBox);
    }

    /**
     * @dev Override the storages as the layout has been redesigned.
     *  Keep the owner and white list untouched
     */
    function upgrade(IWithdrawBox _withdrawBox) external onlyOwner {
        __CBridgeWithdrawer_init_unchained(_withdrawBox);
    }
}
