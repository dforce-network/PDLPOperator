// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./VaultBase.sol";

interface IL1ArbiUSXGateway {
    function outboundTransfer(
        address l1Token,
        address to,
        uint256 amount,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes calldata data
    ) external payable returns (bytes memory);
}

abstract contract L1ArbiBridgeOperator is VaultBase {
    IL1ArbiUSXGateway public l1ArbiUSXGateway;

    address public l2ArbiOperator;

    function __L1ArbiBridgeOperator_init(
        IERC20Upgradeable _usx,
        IVault _vault,
        IL1ArbiUSXGateway _l1ArbiGateway,
        address _l2ArbiOperator
    ) internal {
        __VaultBase_init(_usx, _vault);
        __L1ArbiBridgeOperator_init_unchained(_l1ArbiGateway, _l2ArbiOperator);
    }

    function __L1ArbiBridgeOperator_init_unchained(
        IL1ArbiUSXGateway _l1ArbiGateway,
        address _l2ArbiOperator
    ) internal {
        require(
            address(_l1ArbiGateway) != address(0),
            "l1ArbiGateway can not be zero address"
        );
        require(
            address(_l2ArbiOperator) != address(0),
            "arbiOperator can not be zero address"
        );

        l1ArbiUSXGateway = _l1ArbiGateway;
        l2ArbiOperator = _l2ArbiOperator;

        USX.approve(address(l1ArbiUSXGateway), uint256(-1));
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

        l1ArbiUSXGateway.outboundTransfer{ value: msg.value }(
            address(USX),
            l2ArbiOperator,
            _amount,
            _maxGas,
            _gasPriceBid,
            _data
        );
    }

    /**
     * @dev Deposit USX to the cross-chain bridge
     * @param _to target address to deposit on L2.
     * @param _amount Amount to borrow from the vault and deposit to the bridge.
     * @param _maxGas Max gas for L2 message submission and execution.
     * @param _gasPriceBid Gas price bid for L2.
     * @param _data Encode data that contains Operator contract address and amount to deposit.
     */
    function depositToArbiBridgeTarget(
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data
    ) external payable nonReentrant onlyWhitelist(msg.sender) {
        vault.borrow(_amount);

        l1ArbiUSXGateway.outboundTransfer{ value: msg.value }(
            address(USX),
            _to,
            _amount,
            _maxGas,
            _gasPriceBid,
            _data
        );
    }
}
