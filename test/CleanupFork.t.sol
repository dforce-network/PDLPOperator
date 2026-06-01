// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IMSD {
    function burn(address from, uint256 amount) external;
}

contract CleanupForkTest is Test {

    // Simulates the full cleanup flow:
    //   1. operator grants max allowance to whitelist user (what operator.approve(token) does)
    //   2. whitelist user calls IMSD(token).burn(operator, balance)
    //   3. assert operator balance == 0
    //
    // vm.prank(operator) in step 1 simulates the effect of calling operator.approve(tokenAddr)
    // on the upgraded proxy. The burn mechanism is tested against real chain state.
    function _runCleanup(
        string memory forkEnvKey,
        address operator,
        address token,
        address whitelistUser
    ) internal {
        string memory rpcUrl = vm.envOr(forkEnvKey, string(""));
        if (bytes(rpcUrl).length == 0) {
            emit log_string(string(abi.encodePacked("SKIP -- set ", forkEnvKey, " in .env")));
            return;
        }
        vm.createSelectFork(rpcUrl);

        uint256 balance = IERC20(token).balanceOf(operator);
        if (balance == 0) {
            emit log_string("balance is 0 -- nothing to burn, skipping");
            return;
        }

        emit log_named_uint("operator balance before burn", balance);

        // Simulate operator.approve(token): grants whitelisted caller max allowance.
        vm.prank(operator);
        IERC20(token).approve(whitelistUser, type(uint256).max);

        assertEq(
            IERC20(token).allowance(operator, whitelistUser),
            type(uint256).max,
            "allowance not set to max"
        );

        // Whitelist user burns the full operator balance.
        vm.prank(whitelistUser);
        IMSD(token).burn(operator, balance);

        assertEq(IERC20(token).balanceOf(operator), 0, "balance not zero after burn");
        emit log_string("burn successful");
    }

    function testCleanupArbitrum() public {
        _runCleanup(
            "ARBITRUM_RPC",
            0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4, // arbiOperatorUSX
            0x641441c631e2F909700d2f41FD87F0aA6A6b4EDb, // USX on Arbitrum
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    function testCleanupOptimism() public {
        _runCleanup(
            "OPTIMISM_RPC",
            0x70a35414FaD53752C9352401BE211779EC413BD4, // opOperator
            0xbfD291DA8A403DAAF7e5E9DC1ec0aCEaCd4848B9, // USX on Optimism
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    function testCleanupBscUSX() public {
        _runCleanup(
            "BSC_RPC",
            0x6c69B26fBfdDA4d38e3aE2E32dCE0AB66Ba2C3c9, // bscOperatorUSX
            0xB5102CeE1528Ce2C760893034A4603663495fD72, // USX on BSC
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    function testCleanupBscEUX() public {
        _runCleanup(
            "BSC_RPC",
            0xf0D29c81d3ECdf0CeD8f7cB0B77E1907575fD30c, // bscOperatorEUX
            0x367c17D19fCd0f7746764455497D63c8e8b2BbA3, // EUX on BSC
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    function testCleanupEthereum() public {
        _runCleanup(
            "MAINNET_RPC",
            0x5268b3c4afb0860D365a093C184985FCFcb65234, // ethereumOperator
            0x0a5E677a6A24b2F1A2Bf4F3bFfC443231d2fDEc8, // USX on Ethereum
            0x18c30D9569fEb3ea3644573b013D329dD9fd01Af
        );
    }

    function testCleanupPolygonUSX() public {
        _runCleanup(
            "POLYGON_RPC",
            0x99E8352D079326Bc431633a61954F713AafE372C, // polyOperatorUSX
            0xCf66EB3D546F0415b368d98A95EAF56DeD7aA752, // USX on Polygon
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    function testCleanupPolygonEUX() public {
        _runCleanup(
            "POLYGON_RPC",
            0xC9d1cbc45dd3e86E98067B7eb279C13F7B77C627, // polyOperatorEUX
            0x448BBbDB706cD0a6AB74fA3d1157e7A33Dd3A4a8, // EUX on Polygon
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }
}
