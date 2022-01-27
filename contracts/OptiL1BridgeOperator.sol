// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./VaultBase.sol";

interface IOptiL1USXGateway {
    function depositERC20To(
        address _l1Token,
        address _l2Token,
        address _to,
        uint256 _amount,
        uint32 _l2Gas,
        bytes calldata _data
    ) external;
}

abstract contract OptiL1BridgeOperator is VaultBase {
    address public l2USX;

    IOptiL1USXGateway public optiL1USXGateway;

    address public optiL2Operator;

    function __OptiL1BridgeOperator_init(
        IERC20Upgradeable _usx,
        IVault _vault,
        address _l2USX,
        IOptiL1USXGateway _optiL1Gateway,
        address _optiL2Operator
    ) internal {
        __VaultBase_init(_usx, _vault);
        __OptiL1BridgeOperator_init_unchained(
            _l2USX,
            _optiL1Gateway,
            _optiL2Operator
        );
    }

    function __OptiL1BridgeOperator_init_unchained(
        address _l2USX,
        IOptiL1USXGateway _optiL1Gateway,
        address _optiL2Operator
    ) internal {
        require(address(_l2USX) != address(0), "l2USX can not be zero address");
        require(
            address(_optiL1Gateway) != address(0),
            "optiL1Gateway can not be zero address"
        );
        require(
            address(_optiL2Operator) != address(0),
            "optiOperator can not be zero address"
        );

        l2USX = _l2USX;
        optiL1USXGateway = _optiL1Gateway;
        optiL2Operator = _optiL2Operator;

        USX.approve(address(optiL1USXGateway), uint256(-1));
    }

    /**
     * @dev Deposit USX to the cross-chain bridge
     * @param _amount Amount to borrow from the vault and deposit to the bridge.
     * @param _l2Gas gas for L2 message submission and execution.
     * @param _data Encode data that contains Operator contract address and amount to deposit.
     */
    function depositToOptiBridge(
        uint256 _amount,
        uint32 _l2Gas,
        bytes calldata _data
    ) external payable nonReentrant onlyWhitelist(msg.sender) {
        vault.borrow(_amount);

        optiL1USXGateway.depositERC20To(
            address(USX),
            address(l2USX),
            optiL2Operator,
            _amount,
            _l2Gas,
            _data
        );
    }
}
