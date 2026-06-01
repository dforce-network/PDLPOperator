# PDLP Liquidity Cleanup Design

**Date:** 2026-06-01  
**Branch:** new worktree off `main`

## Goal

Burn USX (and EUX where applicable) held by the PDLP operator contracts across all chains. A whitelist user self-approves the operator's token balance, then calls `burn` on the MSD token contract directly. No private key required in the project — the cleanup script prints ready-to-execute calldatas.

## Burn Flow

```
whitelist user → operator.approve(tokenAddress)
  → IERC20(token).approve(msg.sender, uint256(-1))

whitelist user → IMSD(token).burn(operatorAddress, balance)
  → _burnFrom(operatorAddress, balance)   [uses allowance granted above]
```

## Section 1: Contract Change

**File:** `contracts/base/OperatorBase.sol`

Add one function:

```solidity
function approve(address _token) external onlyWhitelist(msg.sender) {
    IERC20Upgradeable(_token).approve(msg.sender, uint256(-1));
}
```

- `onlyWhitelist(msg.sender)` — only a whitelisted address can self-approve; no owner action needed at burn time
- `uint256(-1)` — max allowance, consistent with `VaultBase.__VaultBase_init_unchained`
- Accepts any token (`_token`), not just USX — covers EUX and any other token the operator holds
- No new state, no new events — the ERC20 `Approval` event from the token is sufficient audit trail

Each chain's operator proxy is upgraded to a new implementation that includes this function.

**Upgrade path per chain:**

| Chain | ProxyAdmin owner | Upgrade method |
|-------|-----------------|----------------|
| Ethereum (1) | Timelock | Print Timelock queue calldata |
| BSC (56) | Timelock | Print Timelock queue calldata |
| Polygon (137) | Timelock | Print Timelock queue calldata |
| Arbitrum (42161) | Direct | `proxyAdmin.upgrade(proxy, newImpl)` |
| Optimism (10) | Direct | `proxyAdmin.upgrade(proxy, newImpl)` |

## Section 2: Status Collection Script

**File:** `scripts/status.js`

Reads all `deployments/PDLP-*.json` files and for each chain queries:

- `operator.owner()`
- `token.balanceOf(operatorAddress)` — USX and EUX where deployed
- `operator.whitelists(candidate)` for the known whitelist candidates

**Known whitelist candidates (from migration scripts):**

| Chain(s) | Address |
|----------|---------|
| Ethereum | `0x18c30D9569fEb3ea3644573b013D329dD9fd01Af` |
| Ethereum | `0xcC27B0206645aDbE5b5C8d212c2a98574090B68F` |
| BSC, Arbitrum, Polygon | `0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75` |
| Kava, Avalanche | `0x75B9a7B6F55754D4d0e952da4bDB55eAeA7dF38e` |
| Conflux eSpace | `0x655284BebCC6e1DfFd098Ec538750D43B57bC743` |

RPC URLs are read from `.env` keys: `MAINNET_RPC`, `BSC_RPC`, `ARBITRUM_RPC`, `OPTIMISM_RPC`, `POLYGON_RPC`, etc.

Output is a human-readable table printed to stdout.

## Section 3: Upgrade + Cleanup Scripts

### `scripts/upgrade.js`

1. Compiles and deploys a new `[Chain]Operator` implementation
2. Checks `proxyAdmin.owner()`:
   - Timelock → prints queue calldata via `printArgs`
   - Direct → calls `proxyAdmin.upgrade(proxy, newImpl)`
3. Saves new impl address to `deployments/PDLP-<chainId>.json`

CLI: `--network <chainId>`

### `scripts/cleanup.js`

A **calldata printer** — no private key required.

1. Reads deployment JSON for the chain
2. For each operator + token with non-zero balance, prints:

```
=== Chain 56 (BSC) — bscOperatorUSX ===
Step 1: Call from WHITELIST_USER (0xDE6D6f...)
  To:       0x6c69B26fBfdDA4d38e3aE2E32dCE0AB66Ba2C3c9
  Function: approve(address)
  Calldata: 0x...

Step 2: Call from WHITELIST_USER (0xDE6D6f...)
  To:       0xB5102CeE1528Ce2C760893034A4603663495fD72  (USX)
  Function: burn(address,uint256)
  Calldata: 0x...
  (burns 890,000.00 USX from operator)
```

CLI: `--network <chainId>` (omit to print all chains)

## Section 4: Foundry Fork Test

**New files:** `foundry.toml`, `test/CleanupFork.t.sol`

Foundry is installed in the new worktree only — no changes to `package.json` or `hardhat.config.js`.

`foundry.toml`:
- `src = "contracts"`
- `out = "out"`
- Solidity `0.6.12`, optimizer on

**Test structure:**

```
CleanupForkTest
  ├── testCleanupEthereum()
  ├── testCleanupBSC()
  ├── testCleanupArbitrum()
  ├── testCleanupOptimism()
  └── testCleanupPolygon()
```

Each test:
1. `vm.createSelectFork(rpcUrl)` — forks live chain state
2. Deploys new operator impl, `vm.prank(proxyAdminOwner)` → `proxyAdmin.upgrade(proxy, newImpl)`
3. `vm.prank(whitelistUser)` → `operator.approve(tokenAddress)`
4. `vm.prank(whitelistUser)` → `IMSD(token).burn(operatorAddress, balance)`
5. `assertEq(token.balanceOf(operatorAddress), 0)`

RPC URLs from env vars — same keys used by the status and cleanup scripts.

## File Summary

| File | Purpose |
|------|---------|
| `contracts/base/OperatorBase.sol` | Add `approve(address _token)` function |
| `scripts/status.js` | Query on-chain state across all chains |
| `scripts/upgrade.js` | Deploy new impl + upgrade proxy or print Timelock calldata |
| `scripts/cleanup.js` | Print approve + burn calldatas for Safe/manual execution |
| `foundry.toml` | Foundry config (new worktree only) |
| `test/CleanupFork.t.sol` | End-to-end fork tests via Foundry |
