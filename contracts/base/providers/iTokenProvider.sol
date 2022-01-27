// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./ProviderBase.sol";

interface IiToken {
    function mint(address _recipient, uint256 _amount) external;

    function redeemUnderlying(address _from, uint256 _amount) external;
}

abstract contract iTokenProvider is ProviderBase {
    IiToken public immutable iToken;

    constructor(bytes32 _name, address _iToken) public ProviderBase(_name) {
        iToken = IiToken(_iToken);
    }

    function approveAddress() internal view override returns (address) {
        return address(iToken);
    }

    function deposit(uint256 _amount) external override {
        iToken.mint(address(this), _amount);
    }

    function withdraw(uint256 _amount) external override {
        iToken.redeemUnderlying(address(this), _amount);
    }
}
