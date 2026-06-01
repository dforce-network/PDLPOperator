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
| **Located subtotal** | **~112,261,218** |
| **Unreconciled gap** | **~9,976,641** |

**Key points**

- The dominant position is **100.1M USX locked in the Arbitrum FlashVault**, held by the operator
  as 100,100,000 vTokens (`vUSX`). Vault `getCash` and `balanceOf` both equal 100.1M, i.e. no net
  borrow currently drawn against it.
- The dForce lending-pool holdings are **negligible** (Arbitrum ~300 USX via `viUSX`, Ethereum ~8
  USX via `iUSX`). The gap is **not** sitting in the lending pools.
- The **~10M gap** between L1 mint (122.24M) and located L2 funds (112.26M) is currently
  **unexplained** — candidates: in cBridge transit, held by an external treasury/EOA, or bridged to
  a chain not covered here (see §4). **This must be traced before cleanup.**

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

> **Avalanche whitelist note:** the whitelist candidate `0x75B9a7B6F55754D4d0e952da4bDB55eAeA7dF38e`
> is **not active** (✗) on the Avalanche operator. The operator wallet is already 0, but if any
> burn/cleanup is later required there, an address must first be added via `_addToWhitelists`.

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
The dominant position (100.1M on Arbitrum) is locked in the FlashVault as vTokens. The end-to-end
cleanup for the bridged liquidity is:

1. **L2** — operator redeems its FlashVault vTokens (and exits any lending positions) so the
   underlying USX returns to the operator wallet.
2. **L2** — bridge that USX back to the Ethereum operator (cBridge / native bridge).
3. **L1** — `MiniMinter.repayBorrow()` burns it, reducing `totalMint` toward 0.

The `approve(address)` + `IMSD.burn(operator, amount)` flow added on this branch handles the
**final burn-from-operator step** (and any chain where USX is already sitting in the operator
wallet, e.g. Optimism's 5.99M, Polygon's 172K). The redeem-from-vault and bridge-back steps are
upstream of it and are not yet scripted.

### Recommended next actions

1. **Trace the ~10M gap** (cBridge balances, treasury/EOA holders, uncovered chains).
2. **Extend `scripts/status.js`** to natively report FlashVault (`vUSX`) and lending
   (`iUSX`/`viUSX`) underlying balances, so the full reconciliation runs from one command instead
   of the ad-hoc probe used for this report.
3. **Restore coverage** for zkSync / Conflux / Avalanche (deployment file + RPC URLs).
4. Sequence the Arbitrum FlashVault redemption + bridge-back before the final L1 repay/burn.

---

## 6. Reference — operator & key contract addresses

| Chain | Operator (proxy) | FlashVault `vUSX` | iUSX |
|---|---|---|---|
| Ethereum (1) | `0x5268b3c4afb0860D365a093C184985FCFcb65234` | — | `0x1AdC34Af68e970a93062b67344269fD341979eb0` |
| Optimism (10) | `0x70a35414FaD53752C9352401BE211779EC413BD4` | `0x3EA2c9daa2aB26dbc0852ea653f99110c335f10a` | `0x7e7e1d8757b241Aa6791c089314604027544Ce43` |
| Arbitrum (42161) | `0x1D2eB423bC723DA7f927CA21B56A4C22aF6C72B4` | `0x9E8B68E17441413b26C2f18e741EAba69894767c` | `0x0385F851060c09A552F1A28Ea3f612660256cBAA` |
| BSC (56) | `0x6c69B26fBfdDA4d38e3aE2E32dCE0AB66Ba2C3c9` (USX) / `0xf0D29c81d3ECdf0CeD8f7cB0B77E1907575fD30c` (EUX) | — | — |
| Polygon (137) | `0x99E8352D079326Bc431633a61954F713AafE372C` (USX) / `0xC9d1cbc45dd3e86E98067B7eb279C13F7B77C627` (EUX) | — | — |
| Kava (2222) | `0xcA09A0a386ac213703e7F70f0b468dde39f026BC` | — | — |
| Conflux eSpace (1030) | `0x8d717271b1A0aE97fcdF7D0a21Fa3DE4334b1EFd` | — | — |
| Avalanche (43114) | `0x2610CC2f20F9F3c1B180b7e8836C8c222a540cc8` | — | — |

USX token addresses and whitelist candidates per chain are in `scripts/config.js`.
