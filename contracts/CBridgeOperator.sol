// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./VaultBase.sol";

interface IcBridge {
    function addLiquidity(address _token, uint256 _amount) external;
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
}
