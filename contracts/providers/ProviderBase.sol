// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./IProvider.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IOperator {
    function USX() external returns (IERC20Upgradeable);
}

abstract contract ProviderBase is IProvider {
    /// @dev name of the provider to identify, eg. "dForceLending"
    bytes32 private immutable __name;

    constructor(bytes32 _name) public {
        __name = _name;
    }

    /**
     * @notice Ensure this is a Provider contract.
     */
    function isProvider() external view override returns (bool) {
        return true;
    }

    function name() external view override returns (string memory) {
        return string(abi.encodePacked(__name));
    }

    function activate() external override {
        address _approveAddress = approveAddress();

        IOperator(address(this)).USX().approve(_approveAddress, uint256(-1));
    }

    function deactivate() external override {
        address _approveAddress = approveAddress();

        IOperator(address(this)).USX().approve(_approveAddress, 0);
    }

    function approveAddress() internal view virtual returns (address);
}
