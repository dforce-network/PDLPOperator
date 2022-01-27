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
}
