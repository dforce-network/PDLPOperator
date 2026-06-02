// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

// Exploration: how to clean up MiniMinter.totalMint.
//
// MiniMinter.repayBorrow(amount) is onlyOwner (owner == operator) and does:
//     totalMint -= amount;  msd.burn(operator, amount);
// i.e. it BOTH burns the operator's USX AND reconciles the minter accounting.
//
// Contrast: the approve()+IMSD.burn(operator) flow burns the USX token but leaves
// totalMint untouched (stale over-statement of outstanding debt).
//
// This test forks mainnet, gives the operator USX, and demonstrates both paths.

interface IMiniMinter {
    function owner() external view returns (address);
    function totalMint() external view returns (uint256);
    function repayBorrow(uint256 amount) external;
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

interface IMSD {
    function burn(address from, uint256 amount) external;
}

contract RepayBorrowExploreTest is Test {
    // Ethereum mainnet PDLP deployment
    address constant MINTER   = 0xA7A084538DE04d808f20C785762934Dd5dA7b3B4; // pdlpMiniMinter
    address constant OPERATOR = 0x5268b3c4afb0860D365a093C184985FCFcb65234; // ethereumOperator (minter owner)
    address constant USX      = 0x0a5E677a6A24b2F1A2Bf4F3bFfC443231d2fDEc8;

    function _fork() internal returns (bool) {
        string memory rpc = vm.envOr("MAINNET_RPC", string(""));
        if (bytes(rpc).length == 0) {
            emit log_string("SKIP -- set MAINNET_RPC in .env");
            return false;
        }
        vm.createSelectFork(rpc);
        return true;
    }

    // ── Path A: repayBorrow — burns USX AND reduces totalMint ───────────
    function testRepayBorrowReducesTotalMint() public {
        if (!_fork()) return;

        uint256 totalMint0 = IMiniMinter(MINTER).totalMint();
        emit log_named_uint("totalMint before", totalMint0);
        assertEq(IMiniMinter(MINTER).owner(), OPERATOR, "minter owner != operator");

        uint256 amount = 1_000_000 ether; // repay 1M of the outstanding debt
        deal(USX, OPERATOR, amount); // fund the operator with USX to repay

        uint256 opBal0 = IERC20(USX).balanceOf(OPERATOR);
        uint256 supply0 = IERC20(USX).totalSupply();

        // Only the operator (owner) may call repayBorrow.
        vm.prank(OPERATOR);
        IMiniMinter(MINTER).repayBorrow(amount);

        emit log_named_uint("totalMint after ", IMiniMinter(MINTER).totalMint());

        assertEq(IMiniMinter(MINTER).totalMint(), totalMint0 - amount, "totalMint not reduced");
        assertEq(IERC20(USX).balanceOf(OPERATOR), opBal0 - amount, "operator USX not burned");
        assertEq(IERC20(USX).totalSupply(), supply0 - amount, "USX supply not reduced");
        emit log_string("repayBorrow: burned USX AND reduced totalMint");
    }

    // ── repayBorrow is owner-gated ──────────────────────────────────────
    function testRepayBorrowOnlyOwner() public {
        if (!_fork()) return;
        deal(USX, address(this), 1 ether);
        vm.expectRevert(); // onlyOwner
        IMiniMinter(MINTER).repayBorrow(1 ether);
        emit log_string("repayBorrow correctly reverts for non-owner");
    }

    // ── Path B (contrast): direct burn leaves totalMint STALE ───────────
    function testDirectBurnLeavesTotalMintStale() public {
        if (!_fork()) return;

        uint256 totalMint0 = IMiniMinter(MINTER).totalMint();
        uint256 amount = 1_000_000 ether;
        deal(USX, OPERATOR, amount);

        // Simulate the approve()+burn cleanup: the minter (authorized) burns the
        // operator's USX directly. This is what USX.burn(operator, amount) does.
        vm.prank(MINTER);
        IMSD(USX).burn(OPERATOR, amount);

        // USX is gone, but totalMint is UNCHANGED -> now over-states real debt.
        assertEq(IERC20(USX).balanceOf(OPERATOR), 0, "operator USX not burned");
        assertEq(IMiniMinter(MINTER).totalMint(), totalMint0, "totalMint unexpectedly changed");
        emit log_named_uint("totalMint still", IMiniMinter(MINTER).totalMint());
        emit log_string("direct burn: USX burned but totalMint left STALE");
    }
}
