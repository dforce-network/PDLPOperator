// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./iTokenProvider.sol";

contract dForceLendingProvider is iTokenProvider {
    constructor(address _iToken)
        public
        iTokenProvider(bytes32("dForceLending"), _iToken)
    {}
}
