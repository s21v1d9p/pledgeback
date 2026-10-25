# Pledgeback

Built with Arc Studio — https://studio.arc.io

This is the **project memory** for Pledgeback. It records deployed addresses, tech decisions, and facts that matter when extending or redeploying the project.

---

## What This App Does

Pledgeback is a dominant assurance contract crowdfunding app on Arc. An organizer creates a campaign with a goal, a deadline, and a starting bonus. Backers pledge native USDC (18 decimals via `msg.value` — not the 6-decimal ERC-20 interface). If the goal is reached the organizer collects all pledges; if it is missed every backer gets their pledge back plus a pro-rata share of the bonus pool. Sponsors can add to the bonus at any time while the campaign is active.

---

## Deployed Contracts

| Contract | Network | Address | Tx Hash |
|---|---|---|---|
| Pledgeback (current) | Arc Testnet | 0x82f72eee77cfa6f95ed9ccb70087d386d8c1bec9 | 0x1ed5975198f34dfe44c35b005bb1b26d1a37dc98e949fb1e0710cfaf42784ccc |
| Pledgeback (mainnet) | Arc Mainnet | — | not yet deployed |

Explorer (testnet): https://explorer.testnet.arc.io/address/0x82f72eee77cfa6f95ed9ccb70087d386d8c1bec9

The earlier testnet deployment at `0xc87107ba4394db173041a2fb69869439aeb5b50c` is superseded (missing the `goal <= 1e30` cap). The current deployment adds that check and 12 additional test cases.

Contract addresses per network live in `src/config/deployments.ts`. The mainnet entry stays empty until a mainnet deploy from `/deploy`.

---

## Tech Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
- **Web3:** wagmi v2, viem v2, injected connector (MetaMask). ConnectKit is not used.
- **Wallet connection:** plain `useConnect`/`useDisconnect` with the wagmi `injected()` connector. No chain switch on connect.
- **Contracts:** Solidity 0.8.28 + Foundry. Sources in `contracts/`, tests in `contracts/test/*.t.sol`.
  - Build: `bun run contracts:build` (runs `forge build`)
  - Test: `bun run contracts:test` (runs `forge test --fuzz-runs 256`)
  - The compiled artifact at `contracts/out/Pledgeback.sol/Pledgeback.json` is committed so a fresh clone can `bun run build` without Foundry.
- **Token:** native USDC, 18 decimals on Arc, passed as `msg.value`. The 6-decimal ERC-20 at `0x3600000000000000000000000000000000000000` is NOT used.
- **Networks:** Arc Testnet (5042002) and Arc Mainnet (5042). Chain objects imported from `viem/chains` (`arcTestnet`, `arc`).
- **RPC:** Arc Mainnet goes through `/arc-rpc` first (Vercel rewrite proxies to `https://rpc.mainnet.arc.io`), then falls back to the public RPC directly. Arc Testnet uses the public RPC directly.
- **Hosting:** Vercel. `vercel.json` handles the `/arc-rpc` proxy, SPA fallback, and security headers.
- **Toasts:** Sonner

---

## Key Files

| Path | Purpose |
|---|---|
| `src/config.ts` | wagmi config — chains (`arc`, `arcTestnet`), injected connector, transports |
| `src/config/deployments.ts` | Contract address per chain ID |
| `src/config/pledgeback.ts` | Full contract ABI (functions, events, custom errors) |
| `src/hooks/usePledgebackContract.ts` | `useReadChainId`, `getContractAddress`, `chainName`, `explorerBase`, `txUrl` |
| `src/lib/format.ts` | USDC formatting/parsing (18 dec), `progressPct`, `formatGuaranteeBps`, `formatWriteError` |
| `src/pages/Home.tsx` | `/` — campaign list |
| `src/pages/NewCampaign.tsx` | `/new` — create campaign |
| `src/pages/Campaign.tsx` | `/c/:id` — campaign detail, wallet actions |
| `src/pages/Deploy.tsx` | `/deploy` — deploy contract from wallet (lazy-loaded) |
| `contracts/Pledgeback.sol` | The dominant assurance contract |
| `contracts/out/Pledgeback.sol/Pledgeback.json` | Compiled artifact (committed; used by `/deploy` page and tests) |
| `vercel.json` | Vercel rewrites + security headers |

---

## To Run

```bash
bun install
bun run dev
```

## To Build

```bash
bun run build
```

This runs `tsc --noEmit && vite build`. No Foundry required — the compiled artifact is committed.

## To Test Contracts

Requires Foundry (`forge`):

```bash
bun run contracts:test
```

---

## Security Notes

- All write actions require the wallet to be on the same chain the app reads from (no separate write chain).
- `positionOf` reads from the read chain, not from the wallet's chain.
- No admin, no pause, no upgrade. The contract is immutable.
- The `/deploy` page requires typing `DEPLOY ON MAINNET` before a mainnet deploy.
- `.env` and `.circle/` are gitignored and must never be committed.
