// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./Ownable.sol";

contract Whitelists is Ownable {
    mapping(address => bool) public whitelists;

    modifier onlyWhitelist(address _account) {
        require(whitelists[_account], "Account does not have the permission!");
        _;
    }

    function __Whitelist_init() internal {
        __Ownable_init();
    }

    /**
     * @dev Add a new account into the whitelist.
     */
    function _addToWhitelists(address _account) external onlyOwner {
        require(
            _account != address(0),
            "_addToWhitelists: Account can not be the zero address!"
        );
        require(
            !whitelists[_account],
            "_addToWhitelists: Account has already been in the whitelist!"
        );
        whitelists[_account] = true;
    }

    /**
     * @dev Remove an exist account from the whitelist.
     */
    function _removeFromWhitelists(address _account) external onlyOwner {
        require(
            _account != address(0),
            "_removeFromWhitelists: Account can not be zero address!"
        );
        require(
            whitelists[_account],
            "_removeFromWhitelists: Account does not in the whitelist!"
        );
        whitelists[_account] = false;
    }
}
