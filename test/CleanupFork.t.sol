// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IMSD {
    function burn(address from, uint256 amount) external;
}

interface IProxyAdmin {
    function upgrade(address proxy, address implementation) external;
    function owner() external view returns (address);
}

// Minimal interface — only the functions we need for cleanup
interface IOperatorCleanup {
    function approve(address _token) external;
    function whitelists(address) external view returns (bool);
    function owner() external view returns (address);
}

contract CleanupForkTest is Test {

    // ─── core E2E helper ────────────────────────────────────────────────
    //
    // Full flow:
    //   1. Fork chain at latest block
    //   2. Deploy CleanupImpl (minimal OperatorBase subclass carrying the new approve())
    //   3. Upgrade proxy via ProxyAdmin (impersonate Timelock if needed)
    //   4. Whitelist user calls operator.approve(token) — new function
    //   5. Assert allowance == max
    //   6. Whitelist user calls IMSD(token).burn(operator, balance)
    //   7. Assert operator balance == 0
    //
    // proxyAdminOwnerOverride: pass Timelock address for chains where proxyAdmin is
    // owned by a Timelock. We impersonate the Timelock directly to bypass time-lock delay.
    function _runCleanup(
        string memory forkEnvKey,
        address proxy,
        address proxyAdminAddr,
        address proxyAdminOwnerOverride, // address(0) = read from proxyAdmin.owner()
        address token,
        address whitelistUser
    ) internal {
        string memory rpcUrl = vm.envOr(forkEnvKey, string(""));
        if (bytes(rpcUrl).length == 0) {
            emit log_string(string(abi.encodePacked("SKIP -- set ", forkEnvKey, " in .env")));
            return;
        }

        vm.createSelectFork(rpcUrl);

        // ── 1. record state before ──────────────────────────────────────
        uint256 balanceBefore = IERC20(token).balanceOf(proxy);
        emit log_named_uint("balance before", balanceBefore);

        // ── 2. deploy CleanupImpl ───────────────────────────────────────
        // CleanupImpl inherits OperatorBase only, keeping the same storage prefix as
        // all operators (Initializable/ReentrancyGuard/Whitelists/OperatorBase slots).
        // No constructor args — proxy is already initialised.
        address newImpl = deployCode("CleanupImpl.sol:CleanupImpl");
        emit log_named_address("new impl", newImpl);

        // ── 3. upgrade proxy ────────────────────────────────────────────
        IProxyAdmin proxyAdmin = IProxyAdmin(proxyAdminAddr);
        address upgrader = proxyAdminOwnerOverride != address(0)
            ? proxyAdminOwnerOverride
            : proxyAdmin.owner();

        vm.prank(upgrader);
        proxyAdmin.upgrade(proxy, newImpl);
        emit log_string("proxy upgraded");

        // ── 4. whitelist user calls new approve() ───────────────────────
        IOperatorCleanup operator = IOperatorCleanup(proxy);
        assertTrue(operator.whitelists(whitelistUser), "whitelistUser not whitelisted");

        vm.prank(whitelistUser);
        operator.approve(token);

        // ── 5. check allowance ──────────────────────────────────────────
        assertEq(
            IERC20(token).allowance(proxy, whitelistUser),
            type(uint256).max,
            "allowance != max after approve()"
        );
        emit log_string("approve() OK -- allowance is max");

        // ── 6 & 7. burn and assert ──────────────────────────────────────
        if (balanceBefore == 0) {
            emit log_string("balance is 0 -- burn step skipped");
            return;
        }

        vm.prank(whitelistUser);
        IMSD(token).burn(proxy, balanceBefore);

        assertEq(IERC20(token).balanceOf(proxy), 0, "balance not zero after burn");
        emit log_string("burn successful -- operator balance is 0");
    }

    // ─── Arbitrum ───────────────────────────────────────────────────────
    // proxyAdmin owner is direct (no Timelock)

    function testCleanupArbitrum() public {
        _runCleanup(
            "ARBITRUM_RPC",
            0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4, // arbiOperatorUSX (proxy)
            0xc9aa79F70ac4a11619c649e857D74F517bBFeE47, // proxyAdmin
            address(0),                                  // read owner from proxyAdmin
            0x641441c631e2F909700d2f41FD87F0aA6A6b4EDb, // USX on Arbitrum
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75  // whitelist candidate
        );
    }

    // ─── Optimism ───────────────────────────────────────────────────────
    // proxyAdmin owner is direct (no Timelock)

    function testCleanupOptimism() public {
        _runCleanup(
            "OPTIMISM_RPC",
            0x70a35414FaD53752C9352401BE211779EC413BD4, // opOperator (proxy)
            0x1C4d5eCFBf2AF57251f20a524D0f0c1b4f6ED1C9, // proxyAdmin
            address(0),
            0xbfD291DA8A403DAAF7e5E9DC1ec0aCEaCd4848B9, // USX on Optimism
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── BSC (USX) ──────────────────────────────────────────────────────
    // proxyAdmin owned by Timelock — we impersonate the Timelock to bypass delay

    function testCleanupBscUSX() public {
        _runCleanup(
            "BSC_RPC",
            0x6c69B26fBfdDA4d38e3aE2E32dCE0AB66Ba2C3c9, // bscOperatorUSX (proxy)
            0x0800604DA276c1D5e9c2C7FEC0e3b43FAb1Ca61a, // proxyAdmin
            0x8C3984Fb0F649c304D68DB69457DBF137D156D7a, // Timelock (proxyAdmin owner)
            0xB5102CeE1528Ce2C760893034A4603663495fD72, // USX on BSC
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── BSC (EUX) ──────────────────────────────────────────────────────

    function testCleanupBscEUX() public {
        _runCleanup(
            "BSC_RPC",
            0xf0D29c81d3ECdf0CeD8f7cB0B77E1907575fD30c, // bscOperatorEUX (proxy)
            0x0800604DA276c1D5e9c2C7FEC0e3b43FAb1Ca61a, // proxyAdmin
            0x8C3984Fb0F649c304D68DB69457DBF137D156D7a, // Timelock
            0x367c17D19fCd0f7746764455497D63c8e8b2BbA3, // EUX on BSC
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── Ethereum ───────────────────────────────────────────────────────

    function testCleanupEthereum() public {
        _runCleanup(
            "MAINNET_RPC",
            0x5268b3c4afb0860D365a093C184985FCFcb65234, // ethereumOperator (proxy)
            0x4FF0455bcfBB5886607c078E0F43Efb5DE34DeF4, // proxyAdmin
            0xBB247f5Ac912196A5AA80E9DD6aB252B79D6Ea25, // Timelock
            0x0a5E677a6A24b2F1A2Bf4F3bFfC443231d2fDEc8, // USX on Ethereum
            0x18c30D9569fEb3ea3644573b013D329dD9fd01Af  // whitelist candidate
        );
    }

    // ─── Polygon (USX) ──────────────────────────────────────────────────

    function testCleanupPolygonUSX() public {
        _runCleanup(
            "POLYGON_RPC",
            0x99E8352D079326Bc431633a61954F713AafE372C, // polyOperatorUSX (proxy)
            0x7e2Dc2b896b7AAc98D6ee8e954d3f5bDCC90076b, // proxyAdmin
            0x1C4d5eCFBf2AF57251f20a524D0f0c1b4f6ED1C9, // Timelock
            0xCf66EB3D546F0415b368d98A95EAF56DeD7aA752, // USX on Polygon
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── Polygon (EUX) ──────────────────────────────────────────────────

    function testCleanupPolygonEUX() public {
        _runCleanup(
            "POLYGON_RPC",
            0xC9d1cbc45dd3e86E98067B7eb279C13F7B77C627, // polyOperatorEUX (proxy)
            0x7e2Dc2b896b7AAc98D6ee8e954d3f5bDCC90076b, // proxyAdmin
            0x1C4d5eCFBf2AF57251f20a524D0f0c1b4f6ED1C9, // Timelock
            0x448BBbDB706cD0a6AB74fA3d1157e7A33Dd3A4a8, // EUX on Polygon
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }
}
