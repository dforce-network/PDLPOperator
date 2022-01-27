// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./VaultBase.sol";

interface IArbiL1USXGateway {
    function outboundTransfer(
        address l1Token,
        address to,
        uint256 amount,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes calldata data
    ) external payable returns (bytes memory);
}

abstract contract ArbiL1BridgeOperator is VaultBase {
    IArbiL1USXGateway public arbiL1USXGateway;

    address public arbiL2Operator;

    function __ArbiBridgeOperator_init(
        IERC20Upgradeable _usx,
        IVault _vault,
        IArbiL1USXGateway _arbiL1Gateway,
        address _arbiL2Operator
    ) internal {
        __VaultBase_init(_usx, _vault);
        __ArbiL1BridgeOperator_init_unchained(_arbiL1Gateway, _arbiL2Operator);
    }

    function __ArbiL1BridgeOperator_init_unchained(
        IArbiL1USXGateway _arbiL1Gateway,
        address _arbiL2Operator
    ) internal {
        require(
            address(_arbiL1Gateway) != address(0),
            "arbiL1Gateway can not be zero address"
        );
        require(
            address(_arbiL2Operator) != address(0),
            "arbiOperator can not be zero address"
        );

        arbiL1USXGateway = _arbiL1Gateway;
        arbiL2Operator = _arbiL2Operator;

        USX.approve(address(arbiL1USXGateway), uint256(-1));
    }

    /**
     * @dev Deposit USX to the cross-chain bridge
     * @param _amount Amount to borrow from the vault and deposit to the bridge.
     * @param _maxGas Max gas for L2 message submission and execution.
     * @param _gasPriceBid Gas price bid for L2.
     * @param _data Encode data that contains Operator contract address and amount to deposit.
     */
    function depositToArbiBridge(
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data
    ) external payable nonReentrant onlyWhitelist(msg.sender) {
        vault.borrow(_amount);

        arbiL1USXGateway.outboundTransfer{ value: msg.value }(
            address(USX),
            arbiL2Operator,
            _amount,
            _maxGas,
            _gasPriceBid,
            _data
        );
    }
}
