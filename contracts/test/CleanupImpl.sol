// SPDX-License-Identifier: MIT
// Used only for fork-testing the upgrade → approve → burn cleanup flow.
// Inherits OperatorBase to ensure storage layout compatibility with all operator proxies
// (which all place Initializable/ReentrancyGuard/Whitelists/OperatorBase slots first).
// The proxy is already initialized; this impl needs no init call.
pragma solidity 0.6.12;

import "../base/OperatorBase.sol";

contract CleanupImpl is OperatorBase {
    // solhint-disable-next-line no-empty-blocks
    constructor() public {}
}
