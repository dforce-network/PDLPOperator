// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./OperatorBase.sol";

interface IVault {
  function borrow(uint256 _amount) external;

  function repayBorrow(uint256 _amount) external;

  function _acceptOwner() external;
}

abstract contract VaultBase is OperatorBase {
  IVault public vault;

  function __VaultBase_init(IERC20Upgradeable _usx, IVault _vault) internal {
    __OperatorBase_init(_usx);
    __VaultBase_init_unchained(_vault);
  }

  function __VaultBase_init_unchained(IVault _vault) internal {
    require(address(_vault) != address(0), "Vault can not be zero address");

    vault = _vault;

    USX.approve(address(vault), uint256(-1));
  }

  /**
   * @dev Accept ownership of the vault
   */
  function acceptOwner() external onlyOwner {
    // will revert if the pendingOwner is not set to this operator
    vault._acceptOwner();
  }

  /**
   * @dev Cleanup: repay borrow to the minter/vault. This burns the operator's USX
   *      AND reduces the minter's `totalMint` accounting in a single call (unlike a
   *      plain token burn, which leaves totalMint stale). The operator must hold at
   *      least `_amount` USX. Callable by whitelist users for the wind-down.
   */
  function repay(uint256 _amount) external onlyWhitelist(msg.sender) {
    vault.repayBorrow(_amount);
  }
}
