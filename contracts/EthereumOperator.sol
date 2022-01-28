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
        address _l2OptiOperator
    ) public {
        _initialize(
            _usx,
            _vault,
            _l1ArbiGateway,
            _l2ArbiOperator,
            _cBridge,
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator
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
            _l2OptiOperator
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
        address _l2OptiOperator
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
    }

    /**
     * @dev Current Ethereum Operator is a VaultBase, L1ArbiBridgeOperator and CBridgeOperator,
     *      Only set Optimism once, liquidity providers will be added separately
     */
    function upgrade(
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator
    ) external onlyOwner {
        require(address(l2USX) == address(0), "Operator already upgraded");

        __L1OptiBridgeOperator_init_unchained(
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator
        );

        __LiquidityOperator_init_unchained();
    }
}
