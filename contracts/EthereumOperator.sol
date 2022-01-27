// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./base/L1ArbiBridgeOperator.sol";
import "./base/L1OptiBridgeOperator.sol";
import "./base/CBridgeOperator.sol";
import "./base/LiquidityOperator.sol";

contract EthereumOperator is
    VaultBase,
    L1ArbiBridgeOperator,
    CBridgeOperator,
    L1OptiBridgeOperator,
    LiquidityOperator
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
        address _iTokenProvider,
        address _qTokenProvider
    ) public {
        initialize(
            _usx,
            _vault,
            _l1ArbiGateway,
            _l2ArbiOperator,
            _cBridge,
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator,
            _iTokenProvider,
            _qTokenProvider
        );
    }

    function initialize(
        IERC20Upgradeable _usx,
        IVault _vault,
        IL1ArbiUSXGateway _l1ArbiGateway,
        address _l2ArbiOperator,
        IcBridge _cBridge,
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator,
        address _iTokenProvider,
        address _qTokenProvider
    ) public initializer {
        __VaultBase_init(_usx, _vault);
        __L1ArbiBridgeOperator_init_unchained(_l1ArbiGateway, _l2ArbiOperator);
        __CBridgeOperator_init_unchained(_cBridge);
        __L1OptiBridgeOperator_init_unchained(
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator
        );

        __LiquidityOperator_init_unchained();
        LiquidityOperator._addProvider(_iTokenProvider);
        LiquidityOperator._addProvider(_qTokenProvider);
    }

    /**
     * @dev Current Ethereum Operator is a VaultBase, L1BridgeOperator and CBridgeOperator,
     *      Only set iToken and vToken and Optimism once
     */
    function upgrade(
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator,
        address _iTokenProvider,
        address _qTokenProvider
    ) external {
        require(address(l2USX) == address(0), "Operator already upgraded");

        __L1OptiBridgeOperator_init_unchained(
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator
        );

        __LiquidityOperator_init_unchained();
        LiquidityOperator._addProvider(_iTokenProvider);
        LiquidityOperator._addProvider(_qTokenProvider);
    }
}
