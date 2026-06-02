# PDLP Liquidity Status Report

**Date:** 2026-06-01
**Branch:** `feature/cleanup`
**Source:** on-chain reads via `scripts/status.js` + ad-hoc vault/lending-token probes
**Purpose:** snapshot current PDLP liquidity across all chains ahead of the cleanup (burn / repay) operation.

> All USX amounts are human-formatted (18 decimals). Figures are point-in-time reads at the
> latest block on each chain at report time and will drift; re-run `scripts/status.js` before acting.

---

## 1. Architecture

The PDLP system mints USX on Ethereum and distributes it to other chains:

- **Ethereum (L1)** — `MiniMinter.borrow()` mints USX against MSD credit; `repayBorrow()` burns
  it (`msd.burn`). `MiniMinter.totalMint` is the outstanding system debt. The bulk of L1-minted
  USX was **bridged to L2** rather than held on L1.
- **Arbitrum / Optimism (L2)** — **no MiniMinter.** Bridged USX is deposited into a **FlashVault**
  (the dForce `vToken` / `vMToken`, accessed by the operator via `IFlashVault`). This is what we
  refer to as the "MiniVault" — there is no contract literally named `MiniVault`; it is the dForce
  vault token. Operators may also deposit into dForce **lending pools** and hold `iUSX` (and the
  `viUSX` vCollateral).
- **BSC / Polygon / Kava** — each has its **own local MiniMinter**, independent of the bridged L1
  liquidity, with small balances.

Operator token holdings to account for on any chain:
`USX (wallet)` · `iUSX` (lending pool) · `viUSX` (vCollateral) · `vUSX` (FlashVault) · plus the
local `MiniMinter.totalMint` debt where a minter exists.

---

## 2. Bridged Ethereum liquidity (the ~122M)

| Location | USX |
|---|---:|
| **Ethereum** `MiniMinter.totalMint` (outstanding debt) | **122,237,859** |
| — Ethereum operator wallet | 0 |
| — Ethereum operator `iUSX` (underlying) | ~8 |
| — Ethereum operator `qUSX` (underlying) | ~0 |
| **Arbitrum** operator wallet | 6,166,567 |
| — Arbitrum FlashVault `vUSX` (operator holds 100.1M vTokens; vault cash = 100.1M) | 100,100,000 |
| — Arbitrum operator `viUSX` (underlying) | ~300 |
| — Arbitrum operator `iUSX` | 0 |
| **Optimism** operator wallet | 5,994,343 |
| — Optimism FlashVault / `iUSX` / `viUSX` | 0 |
| Arbitrum cBridge (operator LP, see §2a) | ~100,528 |
| Optimism cBridge (operator LP, see §2a) | ~99,001 |
| Ethereum cBridge (operator LP, see §2a) | ~100,357 |
| **Located subtotal** | **~112,561,104** |
| **Unreconciled gap** | **~9,676,755** |

**Key points**

- The dominant position is **100.1M USX locked in the Arbitrum FlashVault**, held by the operator
  as 100,100,000 vTokens (`vUSX`). Vault `getCash` and `balanceOf` both equal 100.1M, i.e. no net
  borrow currently drawn against it.
- The dForce lending-pool holdings are **negligible** (Arbitrum ~300 USX via `viUSX`, Ethereum ~8
  USX via `iUSX`); the gap is **not** in the lending pools. cBridge liquidity (§2a) adds only
  ~0.3M to the bridged reconciliation.
- After accounting for cBridge, a **~9.68M gap** between L1 mint (122.24M) and located funds
  (~112.56M) remains **unexplained** — candidates: in cBridge cross-chain transit, held by an
  external treasury/EOA, or bridged to a chain not covered here (see §4). **This must be traced
  before cleanup.**

---

## 2a. cBridge (Celer) liquidity

The operators provide USX liquidity to Celer's cBridge: `depositToCBridge(amount)` does
`vault.borrow(amount)` (mints USX, ↑`totalMint`) then `cBridge.addLiquidity(USX, amount)`. So the
operator is an LP, and its parked liquidity is `totalMint` that has been deployed to the bridge and
not yet recovered. Recovery is `withdrawFromCBridge` (SGN-signed withdraw) → `vault.repayBorrow`.

`USX.balanceOf(cBridge)` per chain (the bridge's total USX; for a niche token like USX the LPs are
realistically just these operators, so this approximates the operator's position):

| Chain | cBridge | USX in bridge |
|---|---|---:|
| Ethereum (1) | `0x5427FEFA…` | ~100,357 |
| Optimism (10) | `0x9D39Fc62…` | ~99,001 |
| BSC (56) | `0xdd90E5E8…` | ~100,197 |
| Arbitrum (42161) | `0x1619DE6B…` | ~100,528 |
| Polygon (137) | `0x88DCDC47…` | ~746 |
| Kava (2222) | `0xb51541df…` | ~628 |
| Avalanche (43114) | `0xef3c714c…` | ~27 |
| Conflux (1030) | `0x841ce48f…` | ~961 |
| **Total** | | **~402,445** |

> **Caveats.** These are **total** bridge balances (all LPs + any in-transit funds), an upper bound
> on operator-owned liquidity. A precise per-operator LP figure needs Celer SGN data or
> `LiquidityAdded`/withdraw event reconstruction — not feasible here because the free RPC tier caps
> `eth_getLogs` to a 10-block range. The uniform ~100K on ETH/OP/BSC/Arbitrum matches the
> migration scripts' standard `depositToCBridge(100000)`, supporting the operator-LP reading.

**Cleanup impact:** the ~100K parked on each major chain is recovered via `withdrawFromCBridge`
(needs an SGN withdraw message from Celer), after which `repayBorrow`/`repay()` retires it. It's a
minor slice (~0.4M total) of the cleanup, but should be drained as part of the wind-down.

---

## 3. Locally-minted liquidity (independent per-chain MiniMinters)

| Chain | Operator wallet USX | MiniMinter | `totalMint` |
|---|---:|---|---:|
| BSC USX | 0 | `pdlpMiniMinterUSX` | 232,406 |
| BSC EUX | 0 | `pdlpMiniMinterEUX` | 1,000 |
| Polygon USX | 172,824 | `pdlpMiniMinterUSX` | 144,030 |
| Polygon EUX | 0 | `pdlpMiniMinterEUX` | 1,000 |
| Kava USX | 0 | `pdlpMiniMinterUSX` | 1,993 |
| Conflux eSpace USX | 3,623 | `pdlpMiniMinterUSX` | 91 |
| Avalanche USX | 0 | `pdlpMiniMinterUSX` | 3,973 |

These are small and independent of the bridged Ethereum liquidity.

> **Avalanche whitelist note:** the migration-time candidate `0x75B9a7B6…` is **not** the active
> whitelist user. Transaction tracing (`scripts/whitelist-trace.js`) shows the real whitelisted
> operator is **`0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75`** (✓, active as of 2026-05). The config
> in `scripts/config.js` has been corrected accordingly.

---

## 4. Not covered / unreachable

| Chain | Reason |
|---|---|
| zkSync Era (280) | deployment JSON `PDLP-280.json` is **not committed to git**, so absent from this branch. |

To include this: commit the zkSync deployment file, then re-run `scripts/status.js`.

> Conflux eSpace (1030) and Avalanche (43114) were unreachable in the initial run but have since
> been re-read with updated `CONFLUX_RPC` / `AVALANCHE_RPC`; their figures are included in §3 above.

---

## 5. Implications for cleanup

Burning only the operator-held **wallet** balances is **not** sufficient to zero out the system.
Two things matter: (a) the dominant position (100.1M on Arbitrum) is locked in the FlashVault as
vTokens, and (b) `MiniMinter.totalMint` is **separate accounting** from the token supply.

### Two cleanup primitives (both added on this branch)

| Primitive | What it does | Use when |
|---|---|---|
| `repay(amount)` (`VaultBase`) | calls `vault.repayBorrow` → burns operator USX **and** decrements `totalMint` | minter chains (ETH, BSC, Polygon, Kava, Conflux) — **preferred** |
| `approve(token)` + `IMSD.burn(operator)` | burns the token only; leaves `totalMint` **stale** | non-minter chains (Arbitrum/OP), or to mop up a remainder / non-USX tokens |

Fork-proven (`test/RepayBorrowExplore.t.sol`): a direct burn leaves mainnet `totalMint` at
122,237,859 (stale), while `repay()` reduces it. So **minter chains must use `repay()`**, not a
plain burn, or the minter will permanently over-state outstanding debt.

When the operator holds **more** USX than `totalMint` (e.g. Polygon: 172,824 held vs 144,030
`totalMint`), the flow is `repay(min(balance, totalMint))` then `approve`+burn the remainder.
`scripts/simulate.js` does exactly this (Polygon fork: repay 144,030 → `totalMint` 0, then burn
28,794 → balance 0).

### End-to-end sequence for the bridged ~122M (Arbitrum example)

The 100.1M on Arbitrum is in the FlashVault, and the `totalMint` it backs lives on **Ethereum**:

1. **Arbitrum** — operator redeems FlashVault vTokens → underlying USX returns to the operator
   wallet (use the operator's `withdraw` / flash-redeem path; exit any lending positions too).
2. **Arbitrum** — bridge that USX back to the Ethereum operator (cBridge / native bridge) via the
   existing `depositToCBridge` / bridge functions.
3. **Ethereum** — once the USX lands in the L1 operator, call `repay(amount)` in tranches →
   `MiniMinter.repayBorrow` burns it and drives `totalMint` (122.2M) toward 0.

Optimism's 5.99M and any other wallet-idle balances feed the same L1 `repay`. Per-chain local
minters (BSC/Polygon/Kava/Conflux) are retired independently with `repay()` on their own chain.

### Recommended next actions

1. **Trace the remaining ~9.68M gap** (cBridge cross-chain in-transit, treasury/EOA holders,
   uncovered chains). cBridge LP balances (§2a) are now accounted for (~0.4M).
2. **Extend `scripts/status.js`** to natively report FlashVault (`vUSX`), lending (`iUSX`/`viUSX`),
   and cBridge (`USX.balanceOf(cBridge)`) balances, so the full reconciliation runs from one command
   instead of the ad-hoc probes used for this report.
3. **Restore coverage** for zkSync (deployment file) and Kava explorer access.
4. **Script the Arbitrum FlashVault redemption + bridge-back** (step 1–2 above); the L1 `repay`
   step is already simulated.
5. **Drain cBridge LP** on each chain via `withdrawFromCBridge` (needs a Celer SGN withdraw message),
   then `repay()` — retires the ~100K parked on each major chain.

---

## 5a. Whitelist user discovery (tx-tracing)

The `Whitelists` contract emits **no events**, so the active whitelist users cannot be queried
directly. Because operator functions (`deposit`/`withdraw`/`mint`/`depositToCBridge`) are gated by
`onlyWhitelist`, the `from` of any **successful** transaction to an operator is either a whitelist
user or the owner. `scripts/whitelist-trace.js` exploits this:

1. fetch the operator's recent txs from a block explorer (Etherscan V2 / Routescan / ConfluxScan),
2. collect distinct successful senders + their last-seen date,
3. cross-check each against the live `whitelists(address)` mapping over RPC.

**Why it matters:** the migration-time candidate list in `scripts/config.js` was **stale on Kava
and Avalanche** — both listed `0x75B9a7B6…`, but that address was migrated away and the real
current operator is `0xDE6D6f23…`. The config has been corrected. Treat `whitelist-trace.js`
output (and live `whitelists()` checks), not the static list, as the source of truth.

### Active whitelist user per operator (verified)

`0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75` is the current whitelist operator on **every USX
chain**. Conflux is the only exception. Verification method: ✅ = confirmed via explorer tx-trace
*and* live `whitelists()`; 🔗 = explorer unavailable on free plan, confirmed via `whitelists()` RPC only.

| Chain | Active whitelist user | Last tx seen | Method |
|---|---|---|---|
| Ethereum (1) | `0xDE6D6f23…` | 2026-05-20 (39 txs) | ✅ |
| Optimism (10) | `0xDE6D6f23…` | — (explorer not on free plan) | 🔗 |
| BSC (56, USX) | `0xDE6D6f23…` | — (explorer not on free plan) | 🔗 |
| Polygon (137, USX) | `0xDE6D6f23…` | 2026-05-16 (47 txs) | ✅ |
| Arbitrum (42161) | `0xDE6D6f23…` | 2026-05-20 (19 txs) | ✅ |
| Kava (2222) | `0xDE6D6f23…` | — (explorer 403) | 🔗 |
| Avalanche (43114) | `0xDE6D6f23…` | 2026-05-16 (8 txs) | ✅ |
| Conflux eSpace (1030) | `0x655284Be…` | 2023-09-08 (11 txs) | ✅ |

Stale/past users (no longer whitelisted): `0x75B9a7B6…` on Kava & Avalanche (last active 2022),
`0xDE6D6f23…` on Polygon **EUX** (last 2023; EUX operator no longer whitelisted).

**Explorer coverage:** free Etherscan V2 plan covers Ethereum / Polygon / Arbitrum; Optimism, BSC,
Avalanche need a paid plan (Avalanche has a working keyless Routescan fallback). Conflux uses
keyless ConfluxScan. Kava's explorer returns 403 — for those, the known operator is confirmed via
`whitelists()` RPC (in `status.js`) instead.

---

## 6. Reference — operator & key contract addresses

| Chain | Operator (proxy) | FlashVault `vUSX` | cBridge |
|---|---|---|---|
| Ethereum (1) | `0x5268b3c4afb0860D365a093C184985FCFcb65234` | — | `0x5427FEFA711Eff984124bFBB1AB6fbf5E3DA1820` |
| Optimism (10) | `0x70a35414FaD53752C9352401BE211779EC413BD4` | `0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a` | `0x9D39Fc627A6d9d9F8C831c16995b209548cc3401` |
| Arbitrum (42161) | `0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4` | `0x9E8B68E17441413b26C2f18e741EAba69894767c` | `0x1619DE6B6B20eD217a58d00f37B9d47C7663feca` |
| BSC (56) | `0x6c69B26fBfdDA4d38e3aE2E32dCE0AB66Ba2C3c9` (USX) / `0xf0D29c81d3ECdf0CeD8f7cB0B77E1907575fD30c` (EUX) | — | `0xdd90E5E87A2081Dcf0391920868eBc2FFB81a1aF` |
| Polygon (137) | `0x99E8352D079326Bc431633a61954F713AafE372C` (USX) / `0xC9d1cbc45dd3e86E98067B7eb279C13F7B77C627` (EUX) | — | `0x88DCDC47D2f83a99CF0000FDF667A468bB958a78` |
| Kava (2222) | `0xcA09A0a386ac213703e7F70f0b468dde39f026BC` | — | `0xb51541df05DE07be38dcfc4a80c05389A54502BB` |
| Conflux eSpace (1030) | `0x8d717271b1A0aE97fcdF7D0a21Fa3DE4334b1EFd` | — | `0x841ce48f9446c8e281d3f1444cb859b4a6d0738c` |
| Avalanche (43114) | `0x2610CC2f20F9F3c1B180b7e8836C8c222a540cc8` | — | `0xef3c714c9425a8F3697A9C969Dc1af30ba82e5d4` |

USX token addresses and whitelist candidates per chain are in `scripts/config.js`.
