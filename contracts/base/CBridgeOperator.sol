// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "./VaultBase.sol";

interface IcBridge {
    function addLiquidity(address _token, uint256 _amount) external;

    function withdraw(
        bytes calldata _wdmsg,
        bytes[] calldata _sigs,
        address[] calldata _signers,
        uint256[] calldata _powers
    ) external;
}

abstract contract CBridgeOperator is VaultBase {
    IcBridge public cBridge;

    function __CBridgeOperator_init(
        IERC20Upgradeable _usx,
        IVault _vault,
        IcBridge _cBridge
    ) internal {
        __VaultBase_init(_usx, _vault);
        __CBridgeOperator_init_unchained(_cBridge);
    }

    function __CBridgeOperator_init_unchained(IcBridge _cBridge) internal {
        require(
            address(_cBridge) != address(0),
            "cBridge can not be zero address"
        );

        cBridge = _cBridge;

        USX.approve(address(cBridge), uint256(-1));
    }

    /**
     * @dev Deposit USX to the celer bridge pool
     * @param _amount Amount to borrow from the vault and deposit to the cbridge.
     */
    function depositToCBridge(uint256 _amount)
        external
        nonReentrant
        onlyWhitelist(msg.sender)
    {
        vault.borrow(_amount);

        cBridge.addLiquidity(address(USX), _amount);
    }

    /**
     * @dev Finalize the withdraw request to the celer bridge pool
     * can be called by anyone as request is submmitted by whitelist user
     */
    function withdrawFromCBridge(
        bytes calldata _wdmsg,
        bytes[] calldata _sigs,
        address[] calldata _signers,
        uint256[] calldata _powers
    ) external nonReentrant {
        cBridge.withdraw(_wdmsg, _sigs, _signers, _powers);

        vault.repayBorrow(USX.balanceOf(address(this)));
    }
}
