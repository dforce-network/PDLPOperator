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
    //   2. Build the REAL dedicated operator impl (e.g. ArbiOperator) carrying the new
    //      approve() and the full cleanup surface (deposit/withdraw/bridge/etc.)
    //   3. Upgrade proxy via ProxyAdmin (impersonate the live proxyAdmin owner)
    //   4. Whitelist user calls operator.approve(token) — new function
    //   5. Assert allowance == max
    //   6. Whitelist user calls IMSD(token).burn(operator, balance)
    //   7. Assert operator balance == 0
    //
    // We install the new impl by etching its *runtime* bytecode (vm.getDeployedCode)
    // rather than running its constructor: a proxy never executes the impl constructor,
    // so the runtime code is exactly what the upgraded proxy will run — and this avoids
    // fragile per-chain constructor args (cBridge/withdrawBox/flashVault validation).
    // Storage layout matches the live impl (same contract family; approve() adds no state).
    //
    // We read proxyAdmin.owner() live and impersonate it for the upgrade — works whether
    // the owner is an EOA or a Timelock, and pranking the owner bypasses any queue delay.
    function _runCleanup(
        string memory forkEnvKey,
        string memory operatorArtifact, // e.g. "ArbiOperator.sol:ArbiOperator"
        address proxy,
        address proxyAdminAddr,
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

        // ── 2. build the real operator impl ─────────────────────────────
        // Etch the real contract's runtime bytecode at a fresh address.
        bytes memory runtime = vm.getDeployedCode(operatorArtifact);
        address newImpl = makeAddr(operatorArtifact);
        vm.etch(newImpl, runtime);
        emit log_named_address("new impl (real operator)", newImpl);

        // ── 3. upgrade proxy ────────────────────────────────────────────
        IProxyAdmin proxyAdmin = IProxyAdmin(proxyAdminAddr);
        address upgrader = proxyAdmin.owner();
        emit log_named_address("proxyAdmin owner", upgrader);

        vm.prank(upgrader);
        proxyAdmin.upgrade(proxy, newImpl);
        emit log_string("proxy upgraded to real operator impl");

        // ── 4. whitelist user calls new approve() ───────────────────────
        IOperatorCleanup operator = IOperatorCleanup(proxy);
        if (!operator.whitelists(whitelistUser)) {
            // No active whitelist user (e.g. wound-down EUX operators). If there is
            // nothing to clean, skip; if there IS a balance, that's a real problem.
            assertEq(balanceBefore, 0, "balance present but no whitelisted user to clean it");
            emit log_string("no active whitelist user and balance is 0 -- nothing to do");
            return;
        }

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

    function testCleanupArbitrum() public {
        _runCleanup(
            "ARBITRUM_RPC",
            "ArbiOperator.sol:ArbiOperator",
            0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4, // arbiOperatorUSX (proxy)
            0xc9aa79F70ac4a11619c649e857D74F517bBFeE47, // proxyAdmin
            0x641441c631e2F909700d2f41FD87F0aA6A6b4EDb, // USX on Arbitrum
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75  // active whitelist user
        );
    }

    // ─── Optimism ───────────────────────────────────────────────────────

    function testCleanupOptimism() public {
        _runCleanup(
            "OPTIMISM_RPC",
            "OpOperator.sol:OpOperator",
            0x70a35414FaD53752C9352401BE211779EC413BD4, // opOperator (proxy)
            0x1C4d5eCFBf2AF57251f20a524D0f0c1b4f6ED1C9, // proxyAdmin
            0xbfD291DA8A403DAAF7e5E9DC1ec0aCEaCd4848B9, // USX on Optimism
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── BSC (USX) ──────────────────────────────────────────────────────

    function testCleanupBscUSX() public {
        _runCleanup(
            "BSC_RPC",
            "BSCOperator.sol:BSCOperator",
            0x6c69B26fBfdDA4d38e3aE2E32dCE0AB66Ba2C3c9, // bscOperatorUSX (proxy)
            0x0800604DA276c1D5e9c2C7FEC0e3b43FAb1Ca61a, // proxyAdmin
            0xB5102CeE1528Ce2C760893034A4603663495fD72, // USX on BSC
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── BSC (EUX) ──────────────────────────────────────────────────────

    function testCleanupBscEUX() public {
        _runCleanup(
            "BSC_RPC",
            "BSCOperator.sol:BSCOperator",
            0xf0D29c81d3ECdf0CeD8f7cB0B77E1907575fD30c, // bscOperatorEUX (proxy)
            0x0800604DA276c1D5e9c2C7FEC0e3b43FAb1Ca61a, // proxyAdmin
            0x367c17D19fCd0f7746764455497D63c8e8b2BbA3, // EUX on BSC
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── Ethereum ───────────────────────────────────────────────────────

    function testCleanupEthereum() public {
        _runCleanup(
            "MAINNET_RPC",
            "EthereumOperator.sol:EthereumOperator",
            0x5268b3c4afb0860D365a093C184985FCFcb65234, // ethereumOperator (proxy)
            0x4FF0455bcfBB5886607c078E0F43Efb5DE34DeF4, // proxyAdmin
            0x0a5E677a6A24b2F1A2Bf4F3bFfC443231d2fDEc8, // USX on Ethereum
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75  // active whitelist user (tx-trace)
        );
    }

    // ─── Polygon (USX) ──────────────────────────────────────────────────

    function testCleanupPolygonUSX() public {
        _runCleanup(
            "POLYGON_RPC",
            "PolyOperator.sol:PolyOperator",
            0x99E8352D079326Bc431633a61954F713AafE372C, // polyOperatorUSX (proxy)
            0x7e2Dc2b896b7AAc98D6ee8e954d3f5bDCC90076b, // proxyAdmin
            0xCf66EB3D546F0415b368d98A95EAF56DeD7aA752, // USX on Polygon
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }

    // ─── Polygon (EUX) ──────────────────────────────────────────────────

    function testCleanupPolygonEUX() public {
        _runCleanup(
            "POLYGON_RPC",
            "PolyOperator.sol:PolyOperator",
            0xC9d1cbc45dd3e86E98067B7eb279C13F7B77C627, // polyOperatorEUX (proxy)
            0x7e2Dc2b896b7AAc98D6ee8e954d3f5bDCC90076b, // proxyAdmin
            0x448BBbDB706cD0a6AB74fA3d1157e7A33Dd3A4a8, // EUX on Polygon
            0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75
        );
    }
}
