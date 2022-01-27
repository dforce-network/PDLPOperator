// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "./VaultBase.sol";
import "./providers/IProvider.sol";

abstract contract LiquidityOperator is VaultBase {
  using Address for address;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

  EnumerableSetUpgradeable.AddressSet internal providers;

  event ProviderAdded(address indexed provider);
  event ProviderRemoved(address indexed provider);

  function __LiquidityOperator_init(IERC20Upgradeable _usx, IVault _vault)
    internal
  {
    __VaultBase_init(_usx, _vault);
    __LiquidityOperator_init_unchained();
  }

  function __LiquidityOperator_init_unchained() internal {}

  /**
   * @notice Adds a new provider.
   * @param _provider The provider to add.
   */
  function _addProvider(address _provider) public onlyOwner nonReentrant {
    require(
      IProvider(_provider).isProvider(),
      "Invalid provider contract address"
    );

    // add() will return false if the set already contains the _provider.
    require(providers.add(_provider), "Provider has already been added");

    _provider.functionDelegateCall(abi.encodeWithSignature("activate()"));

    emit ProviderAdded(_provider);
  }

  /**
   * @notice Remove a provider.
   * @param _provider The provider to remove.
   */
  function _removeProvider(address _provider) public onlyOwner nonReentrant {
    // remove() will return false if the set does not contain the _provider.
    require(providers.remove(_provider), "Provider does not exist");

    _provider.functionDelegateCall(abi.encodeWithSignature("deactivate()"));

    emit ProviderRemoved(_provider);
  }

  /**
   * @dev Deposit USX to the liquidity pool.
   * @param _amount Amount to borrow from the vault and deposit to the liquidity pool.
   */
  function deposit(uint256 _index, uint256 _amount)
    external
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
    nonReentrant
    onlyWhitelist(msg.sender)
  {
    providers.at(_index).functionDelegateCall(
      abi.encodeWithSignature("withdraw(uint256)", _amount)
    );

    vault.repayBorrow(_amount);
  }

  function getAddresses(EnumerableSetUpgradeable.AddressSet storage _addressSet)
    internal
    view
    returns (address[] memory _addresses)
  {
    uint256 _len = _addressSet.length();
    _addresses = new address[](_len);
    for (uint256 i = 0; i < _len; i++) {
      _addresses[i] = _addressSet.at(i);
    }
  }

  function getProviders() external view returns (address[] memory) {
    return getAddresses(providers);
  }
}
