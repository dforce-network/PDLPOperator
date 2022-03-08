// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @dev Interface functions to deposit and withdraw ERC20 tokens.
 */
interface IProvider {
    function name() external view returns (string memory);

    function isProvider() external view returns (bool);

    function activate() external;

    function deactivate() external;

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function exchangeRateCurrent() external returns (uint256);
}
