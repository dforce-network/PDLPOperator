// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "./VaultBase.sol";
import "./LiquidityOperator.sol";

abstract contract VLiquidityOperator is
    OperatorBase,
    VaultBase,
    LiquidityOperator
{
    function __VLiquidityOperator_init(IERC20Upgradeable _usx, IVault _vault)
        internal
    {
        __OperatorBase_init(_usx);
        __VaultBase_init_unchained(_vault);
        __LiquidityOperator_init_unchained();
        __VLiquidityOperator_init_unchained();
    }

    function __VLiquidityOperator_init_unchained() internal {}

    /**
     * @dev Deposit USX to the liquidity pool.
     * @param _amount Amount to borrow from the vault and deposit to the liquidity pool.
     */
    function deposit(uint256 _index, uint256 _amount)
        external
        virtual
        override
        nonReentrant
        onlyWhitelist(msg.sender)
    {
        vault.borrow(_amount);

        providers.at(_index).functionDelegateCall(
            abi.encodeWithSignature("deposit(uint256)", _amount)
        );
    }

    /**
     * @dev Withdraw USX from the liquidity pool
     * @param _amount Amount to withdraw from the pool and repay to the vault.
     */
    function withdraw(uint256 _index, uint256 _amount)
        external
        virtual
        override
        nonReentrant
        onlyWhitelist(msg.sender)
    {
        providers.at(_index).functionDelegateCall(
            abi.encodeWithSignature("withdraw(uint256)", _amount)
        );

        vault.repayBorrow(_amount);
    }
}
