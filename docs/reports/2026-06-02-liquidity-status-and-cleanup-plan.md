# PDLP Liquidity Status & Cleanup Plan

**Date:** 2026-06-02
**Branch:** `feature/cleanup`
**Data source:** on-chain reads via `scripts/status.js` (wallet + FlashVault + cBridge + `totalMint`)
plus `scripts/whitelist-trace.js`; figures are point-in-time and will drift — re-run before acting.

---

## 1. How the liquidity flows

There are **two independent liquidity systems**, and they must be cleaned up differently:

### A. The bridged system (Ethereum → Arbitrum / Optimism)

- **Ethereum is the only mint origin** for this system. `MiniMinter.borrow()` mints USX against MSD
  credit; `MiniMinter.totalMint` (currently **122,237,859 USX**) is the outstanding debt.
- **Arbitrum and Optimism have NO MiniMinter.** Every USX on those chains was **bridged in from
  Ethereum** (via cBridge / native bridge) — none of it is minted locally. Once on the L2 it is
  parked in the operator wallet, the **FlashVault** (`vUSX`), the **cBridge** LP, or lending pools.
- Therefore the entire 122M of L1 `totalMint` is distributed across **L1 + Arbitrum + Optimism
  only**. To retire `totalMint`, that USX has to come back to the Ethereum operator and be repaid.

```
 Ethereum MiniMinter ──borrow()──▶ Ethereum operator ──bridge──▶  Arbitrum / Optimism operator
   (totalMint 122.2M)                  │                              │
                                       ├─ cBridge LP                  ├─ FlashVault (vUSX)  ← 100.1M
                                       └─ (mostly bridged out)        ├─ operator wallet
                                                                      └─ cBridge LP
   cleanup ◀── repay() burns + retires totalMint ◀── bridge back ◀────┘
```

### B. The local-minter system (BSC / Polygon / Kava / Conflux)

- Each of these chains has its **own** MiniMinter with a small, independent `totalMint`. Its USX is
  minted **locally**, unrelated to the Ethereum 122M. These are retired in place with `repay()`.

> **Why this matters for cleanup:** burning the operator's USX token directly (the `approve`+`burn`
> path) does **not** touch `totalMint` — fork-proven (`test/RepayBorrowExplore.t.sol`). To wind a
> minter down cleanly you must use **`repayBorrow`** (exposed as `VaultBase.repay()`), which burns
> the USX **and** decrements `totalMint`.

---

## 2. Current liquidity status

### A. Bridged system — reconciling the 122.2M

| Location | USX |
|---|---:|
| **Ethereum** `MiniMinter.totalMint` (debt to retire) | **122,237,859** |
| Ethereum operator wallet | 0 |
| Ethereum cBridge LP | ~100,357 |
| Ethereum lending (`iUSX`/`qUSX`) | ~8 |
| **Arbitrum** operator wallet | 6,166,567 |
| Arbitrum **FlashVault** (`vUSX`, 100.1M vTokens; vault cash = 100.1M) | 100,100,000 |
| Arbitrum cBridge LP | ~100,528 |
| Arbitrum lending (`viUSX`) | ~300 |
| **Optimism** operator wallet | 5,994,343 |
| Optimism cBridge LP | ~99,001 |
| **Located total** | **~112,561,104** |
| **Unreconciled gap** | **~9,676,755** |

- The dominant position is **100.1M locked in the Arbitrum FlashVault** (operator holds 100.1M
  `vUSX`; `getCash` = `balanceOf` = 100.1M, no net borrow drawn).
- cBridge holds the operators' LP (~100K each on ETH/OP/Arbitrum — matches the migration scripts'
  `depositToCBridge(100000)`). Lending positions are negligible.
- **~9.68M is still unlocated.** Because Arb/OP USX is *only* bridged in, the gap must be either (a)
  cBridge value mid-transit / on a bridge contract, (b) held by an external treasury/EOA, or (c) an
  over-statement in `totalMint` from a historical borrow never repaid. **Trace before final repay.**

### B. Local-minter system (independent per chain)

| Chain | Operator wallet | `totalMint` | Active whitelist user |
|---|---:|---:|---|
| BSC USX | 0 | 232,406 | `0xDE6D6f23…` |
| BSC EUX | 0 | 1,000 | none (wound down) |
| Polygon USX | 172,824 | 144,030 | `0xDE6D6f23…` |
| Polygon EUX | 0 | 1,000 | none |
| Kava USX | 0 | 1,993 | `0xDE6D6f23…` |
| Conflux USX | 3,623 | 91 | `0x655284Be…` |
| Avalanche USX | 0 | 3,973 | `0xDE6D6f23…` |

> Polygon holds **more** USX (172,824) than its `totalMint` (144,030): repay 144,030 to zero the
> minter, then burn the 28,794 excess.

### Whitelist user (who executes cleanup)

`0xDE6D6f23AabBdC9469C8907eCE7c379F98e4Cb75` is the active whitelist operator on **every USX chain**
(Conflux uses `0x655284Be…`). Verified by tx-tracing + live `whitelists()` (`whitelist-trace.js`);
the migration-era addresses (`0x18c30D…`, `0x75B9a7B6…`) were migrated away. EUX operators have no
active whitelist user and 0 balance.

### Not covered

zkSync Era (280) — deployment JSON not committed to git. (All other chains reachable.)

---

## 3. Cleanup plan

Two operator functions added on this branch do the work:

| Function | Effect | Use for |
|---|---|---|
| `VaultBase.repay(amount)` | `vault.repayBorrow` → burns operator USX **and** ↓`totalMint` | minter chains (preferred) |
| `OperatorBase.approve(token)` + `IMSD.burn(operator)` | burns token only (totalMint untouched) | non-minter chains / remainder / non-USX |

Every chain first needs a **proxy upgrade** to the new implementation (carries `approve` + `repay`),
executed by the live `proxyAdmin` owner (an EOA on Arb/OP, a Timelock elsewhere). The full flow is
fork-proven in `test/CleanupFork.t.sol` and `test/RepayBorrowExplore.t.sol`, and locally
reproducible via `scripts/simulate.js <chainId>`.

### Phase 0 — Prep
1. Upgrade each operator proxy to the new impl (`scripts/upgrade.js` prints the calldata; Timelock
   chains queue/execute).
2. Confirm `0xDE6D6f23…` is whitelisted on each target operator (it is, per §2B).
3. **Trace the ~9.68M gap** (see §2A) before retiring L1 `totalMint`.

### Phase 1 — Local-minter chains (independent, do any time)
For BSC / Polygon / Kava / Conflux / Avalanche:
1. Bring any liquidity back to the operator wallet (FlashVault redeem, cBridge withdraw) if needed.
2. `repay(min(walletBalance, totalMint))` → burns USX and drives `totalMint` to 0.
3. If wallet balance > `totalMint` (Polygon), `approve(USX)` + burn the remainder.
4. Drain cBridge LP via `withdrawFromCBridge` (needs a Celer SGN withdraw message) → `repay()`.
   *(EUX operators: nothing to do — 0 balance, minter ~0.)*

### Phase 2 — Bridged system (the 122.2M), in order
1. **Arbitrum — redeem the FlashVault.** Operator redeems its 100.1M `vUSX` (and exits lending) so
   the USX lands in the operator wallet. Drain the cBridge LP too.
2. **Arbitrum & Optimism — bridge USX back to the Ethereum operator** via the existing
   `depositToCBridge` / bridge functions (Optimism's 5.99M + Arbitrum's ~106.3M).
3. **Ethereum — `repay()` in tranches.** As USX lands in the L1 operator, call `repay(amount)` →
   `MiniMinter.repayBorrow` burns it and drives the 122.2M `totalMint` toward 0.
4. Drain the Ethereum cBridge LP and repay it too.
5. Reconcile: `totalMint` should reach 0 (modulo the gap from Phase 0 step 3).

### Phase 3 — Verify
- `node scripts/status.js` → every operator wallet 0, every `totalMint` 0, cBridge LPs drained.

---

## 4. Tooling (all on this branch)

| Script / test | Purpose |
|---|---|
| `scripts/status.js` | one-command reconciliation: wallet + FlashVault + cBridge + `totalMint` + whitelist, all chains |
| `scripts/whitelist-trace.js` | discover/verify active whitelist users from operator tx history |
| `scripts/cleanup.js` | print `approve`+`burn` calldata per chain (Safe / manual exec) |
| `scripts/upgrade.js` | print ProxyAdmin upgrade calldata (Timelock-aware) |
| `scripts/simulate.js <chainId>` | Anvil fork: upgrade real operator → repay/approve+burn end-to-end |
| `test/CleanupFork.t.sol` | fork E2E upgrading to the real operators (7 chains) |
| `test/RepayBorrowExplore.t.sol` | proves `repay()` retires `totalMint`; direct burn leaves it stale |

Open follow-ups: trace the ~9.68M gap; restore zkSync coverage; script the Arbitrum
FlashVault-redeem + bridge-back (Phase 2 steps 1–2).

---

## 5. Reference — key addresses per chain

| Chain | Operator (proxy) | FlashVault `vUSX` | cBridge | MiniMinter |
|---|---|---|---|---|
| Ethereum (1) | `0x5268b3c4afb0860D365a093C184985FCFcb65234` | — | `0x5427FEFA711Eff984124bFBB1AB6fbf5E3DA1820` | `0xA7A084538DE04d808f20C785762934Dd5dA7b3B4` |
| Optimism (10) | `0x70a35414FaD53752C9352401BE211779EC413BD4` | `0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a` | `0x9D39Fc627A6d9d9F8C831c16995b209548cc3401` | — |
| Arbitrum (42161) | `0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4` | `0x9E8B68E17441413b26C2f18e741EAba69894767c` | `0x1619DE6B6B20eD217a58d00f37B9d47C7663feca` | — |
| BSC (56) | `0x6c69B26fBfdDA4d38e3aE2E32dCE0AB66Ba2C3c9` (USX) | `0x3de52B6340Cc138f811b5e752cA56042BDDA2812` | `0xdd90E5E87A2081Dcf0391920868eBc2FFB81a1aF` | `0xE8db80556Ea859b15e5075992b4F0070D88B3465` |
| Polygon (137) | `0x99E8352D079326Bc431633a61954F713AafE372C` (USX) | `0x9150e119bFD2692cf94Df8d54F27339929c0943d` | `0x88DCDC47D2f83a99CF0000FDF667A468bB958a78` | `0xc617076c27c418a3A2C593009A607A68aD178E78` |
| Kava (2222) | `0xcA09A0a386ac213703e7F70f0b468dde39f026BC` | `0x9Ee9Ed4b19100DEb781313D426A43adf2A218AB4` | `0xb51541df05DE07be38dcfc4a80c05389A54502BB` | `0x14493720Bb820c1e9e431EAF00d6ADdD2dd8e471` |
| Conflux (1030) | `0x8d717271b1A0aE97fcdF7D0a21Fa3DE4334b1EFd` | `0x2871cFaEcaeb16e1CECd8044B1A3892d9f706808` | `0x841ce48f9446c8e281d3f1444cb859b4a6d0738c` | `0xB5b3da79789dE012Fd75108138b2315E5645715A` |
| Avalanche (43114) | `0x2610CC2f20F9F3c1B180b7e8836C8c222a540cc8` | `0xf6f2E11C6974cb7910Ba17F22a0B40709aCA6cb2` | `0xef3c714c9425a8F3697A9C969Dc1af30ba82e5d4` | `0x2E3D3E621084F26C67d91D54Bc0993440329Dd1C` |

USX token addresses and whitelist candidates per chain live in `scripts/config.js`. The earlier
snapshot (with the whitelist-discovery write-up) is retained at
`docs/reports/2026-06-01-liquidity-status.md`.
