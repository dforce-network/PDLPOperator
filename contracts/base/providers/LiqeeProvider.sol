// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./iTokenProvider.sol";

contract LiqeeProvider is iTokenProvider {
    constructor(address _qToken)
        public
        iTokenProvider(bytes32("LiqeeProvider"), _qToken)
    {}
}
