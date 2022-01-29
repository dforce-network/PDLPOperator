// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./VaultBase.sol";

interface IL1OptiUSXGateway {
    function depositERC20To(
        address _l1Token,
        address _l2Token,
        address _to,
        uint256 _amount,
        uint32 _l2Gas,
        bytes calldata _data
    ) external;
}

abstract contract L1OptiBridgeOperator is VaultBase {
    address public l2USX;

    IL1OptiUSXGateway public l1OptiUSXGateway;

    address public l2OptiOperator;

    function __L1OptiBridgeOperator_init(
        IERC20Upgradeable _usx,
        IVault _vault,
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator
    ) internal {
        __VaultBase_init(_usx, _vault);
        __L1OptiBridgeOperator_init_unchained(
            _l2USX,
            _l1OptiGateway,
            _l2OptiOperator
        );
    }

    function __L1OptiBridgeOperator_init_unchained(
        address _l2USX,
        IL1OptiUSXGateway _l1OptiGateway,
        address _l2OptiOperator
    ) internal {
        require(address(_l2USX) != address(0), "l2USX can not be zero address");
        require(
            address(_l1OptiGateway) != address(0),
            "l1OptiGateway can not be zero address"
        );
        require(
            address(_l2OptiOperator) != address(0),
            "optiOperator can not be zero address"
        );

        l2USX = _l2USX;
        l1OptiUSXGateway = _l1OptiGateway;
        l2OptiOperator = _l2OptiOperator;

        USX.approve(address(l1OptiUSXGateway), uint256(-1));
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

        l1OptiUSXGateway.depositERC20To(
            address(USX),
            address(l2USX),
            l2OptiOperator,
            _amount,
            _l2Gas,
            _data
        );
    }

    /**
     * @dev Deposit USX to the cross-chain bridge
     * @param _to target address to deposit on L2.
     * @param _amount Amount to borrow from the vault and deposit to the bridge.
     * @param _l2Gas gas for L2 message submission and execution.
     * @param _data Encode data that contains Operator contract address and amount to deposit.
     */
    function depositToOptiBridge(
        address _to,
        uint256 _amount,
        uint32 _l2Gas,
        bytes calldata _data
    ) external payable nonReentrant onlyWhitelist(msg.sender) {
        vault.borrow(_amount);

        l1OptiUSXGateway.depositERC20To(
            address(USX),
            address(l2USX),
            _to,
            _amount,
            _l2Gas,
            _data
        );
    }
}
