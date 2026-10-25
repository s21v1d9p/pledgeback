# Pledgeback

Pledgeback is a dominant assurance contract app built on Arc. An organizer creates a campaign with a USDC goal, a deadline, and a starting bonus. Backers pledge native USDC while the campaign is active. If the goal is reached, the organizer collects all pledges. If the goal is missed, every backer gets their pledge back plus a pro-rata share of the bonus pool. Anyone can add to the bonus as a sponsor.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- Solidity 0.8.28, Foundry, OpenZeppelin ReentrancyGuard
- React 18, Vite, TypeScript, Tailwind CSS, wagmi v2, viem v2, ConnectKit, react-router-dom
- Chain: Arc Testnet (5042002) and Arc Mainnet (5042), with a same-origin RPC proxy for Arc Mainnet
- Token: native USDC (18 decimals on Arc, msg.value — not the ERC-20 at 6 decimals)
- Deployed to Vercel; `vercel.json` proxies `/arc-rpc` to Arc Mainnet RPC

## Development

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Bun](https://bun.sh)

### Install

```bash
bun install
```

### Environment variables

None required for contract development. The frontend (section 2) reads the following:

| Variable | Purpose |
|---|---|
| `RPC_PROXY_BASE_URL` | Circle-provisioned RPC proxy base URL (optional outside Arc Studio) |
| `RPC_PROXY_TOKEN` | Circle-provisioned RPC proxy token (optional outside Arc Studio) |
| `RPC_PROXY_CHAINS` | Comma-separated proxy chain keys (optional outside Arc Studio) |

### Run the dev server

```bash
bun run dev
```

### Build

```bash
bun run build
```

### Contract commands

```bash
bun run contracts:build   # forge build
bun run contracts:test    # forge test
```

### Tests

```bash
bun run contracts:test
```

15 test suites, all passing. Tests cover: campaign creation and all revert paths, pledge tracking, bonus mechanics, exact payout arithmetic (spec example B), reentrancy protection, rejecting-receiver isolation, no-receive revert, and a fuzz conservation invariant.

## Deployed contracts

| Contract | Network | Address |
|---|---|---|
| Pledgeback | Arc Testnet | `0xc87107ba4394db173041a2fb69869439aeb5b50c` |
