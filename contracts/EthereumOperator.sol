// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./ArbiL1BridgeOperator.sol";
import "./OptiL1BridgeOperator.sol";
import "./CBridgeOperator.sol";
import "./LiquidityOperator.sol";

contract EthereumOperator is
    VaultBase,
    ArbiL1BridgeOperator,
    CBridgeOperator,
    OptiL1BridgeOperator,
    LiquidityOperator
{
    function initialize(
        IERC20Upgradeable _usx,
        IVault _vault,
        IArbiL1USXGateway _arbiL1Gateway,
        address _arbiL2Operator,
        IcBridge _cBridge,
        address _l2USX,
        IOptiL1USXGateway _optiL1Gateway,
        address _optiL2Operator,
        address _iTokenProvider,
        address _qTokenProvider
    ) external initializer {
        __VaultBase_init(_usx, _vault);
        __ArbiL1BridgeOperator_init_unchained(_arbiL1Gateway, _arbiL2Operator);
        __CBridgeOperator_init_unchained(_cBridge);
        __OptiL1BridgeOperator_init_unchained(
            _l2USX,
            _optiL1Gateway,
            _optiL2Operator
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
        IOptiL1USXGateway _optiL1Gateway,
        address _optiL2Operator,
        address _iTokenProvider,
        address _qTokenProvider
    ) external {
        require(address(l2USX) == address(0), "Operator already upgraded");

        __OptiL1BridgeOperator_init_unchained(
            _l2USX,
            _optiL1Gateway,
            _optiL2Operator
        );

        __LiquidityOperator_init_unchained();
        LiquidityOperator._addProvider(_iTokenProvider);
        LiquidityOperator._addProvider(_qTokenProvider);
    }
}
