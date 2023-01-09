// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./base/L1ArbiBridgeOperator.sol";
import "./base/L1OptiBridgeOperator.sol";
import "./base/CBridgeOperator.sol";
import "./base/VLiquidityOperator.sol";
import "./base/CBridgeWithdrawer.sol";

contract EthereumOperator is
    VaultBase,
    L1ArbiBridgeOperator,
    CBridgeOperator,
    L1OptiBridgeOperator,
    VLiquidityOperator,
    CBridgeWithdrawer
{
    constructor(
        IERC20Upgradeable _usx,
        IVault _vault,
        IL1ArbiUSXGateway _l1ArbiGateway,
        address _l2ArbiOperator,
        IcBridge _cBridge,
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator,
        IWithdrawBox _withdrawBox
    ) public {
        _initialize(
            _usx,
            _vault,
            _l1ArbiGateway,
            _l2ArbiOperator,
            _cBridge,
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator,
            _withdrawBox
        );
    }

    /**
     * @dev External Initializer for the proxy
     * it will add the _iTokenProvider and _qTokenProvider by default
     */
    function initialize(
        IERC20Upgradeable _usx,
        IVault _vault,
        IL1ArbiUSXGateway _l1ArbiGateway,
        address _l2ArbiOperator,
        IcBridge _cBridge,
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator,
        IWithdrawBox _withdrawBox,
        address _iTokenProvider,
        address _qTokenProvider
    ) public {
        _initialize(
            _usx,
            _vault,
            _l1ArbiGateway,
            _l2ArbiOperator,
            _cBridge,
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator,
            _withdrawBox
        );

        LiquidityOperator._addProvider(_iTokenProvider);
        LiquidityOperator._addProvider(_qTokenProvider);
    }

    /**
     * @dev Internal Initializer for the constructor
     * no liquidity providers are added
     */
    function _initialize(
        IERC20Upgradeable _usx,
        IVault _vault,
        IL1ArbiUSXGateway _l1ArbiGateway,
        address _l2ArbiOperator,
        IcBridge _cBridge,
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator,
        IWithdrawBox _withdrawBox
    ) internal initializer {
        __VaultBase_init(_usx, _vault);
        __L1ArbiBridgeOperator_init_unchained(_l1ArbiGateway, _l2ArbiOperator);
        __CBridgeOperator_init_unchained(_cBridge);
        __L1OptiBridgeOperator_init_unchained(
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator
        );

        __LiquidityOperator_init_unchained();
        __CBridgeWithdrawer_init_unchained(_withdrawBox);
    }

    function upgrade(IWithdrawBox _withdrawBox) external onlyOwner {
        __CBridgeWithdrawer_init_unchained(_withdrawBox);
    }
}
