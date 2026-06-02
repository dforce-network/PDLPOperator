// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

interface IBurnableToken {
    function burn(address from, uint256 amount) external;
}

// Minimal stand-in for MiniMinter, implementing the IVault surface VaultBase uses.
// repayBorrow mirrors MiniMinter: reduce totalMint and burn from the caller (operator).
contract MockMinter {
    IBurnableToken public token;
    uint256 public totalMint;

    constructor(IBurnableToken _token, uint256 _initialMint) public {
        token = _token;
        totalMint = _initialMint;
    }

    function borrow(uint256 _amount) external {
        totalMint = totalMint + _amount;
    }

    function repayBorrow(uint256 _amount) external {
        totalMint = totalMint - _amount;
        token.burn(msg.sender, _amount);
    }

    // solhint-disable-next-line no-empty-blocks
    function _acceptOwner() external {}
}
