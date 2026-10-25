# Pledgeback specification

Pledgeback lets a group fund something together with a refund bonus. An organizer sets a goal and a deadline and puts up a bonus in USDC. People pledge USDC until the deadline. If the goal is reached, the organizer gets the pledges. If it is missed, every backer gets their pledge back plus a fixed share of the bonus, so backing a campaign that fails still pays. Anyone can add to the bonus as a sponsor. This is a dominant assurance contract, built on Arc mainnet with native USDC.

## 1. Contract: `contracts/Pledgeback.sol`

- Solidity 0.8.28. OpenZeppelin `ReentrancyGuard` is the only dependency.
- Money is Arc's native USDC (`msg.value`, 18 decimals). No ERC-20 calls, no approvals.
- No owner, no admin, no fees, no pause, no upgrade, no cancel, no `receive` or `fallback`. Plain transfers to the contract must revert.

### 1.1 Storage

```solidity
struct Campaign {
    address organizer;
    uint64 deadline;     // unix seconds
    bool collected;      // organizer collected after success
    uint256 goal;        // wei of native USDC
    uint256 pledged;     // total pledged
    uint256 bonusPool;   // organizer bonus + sponsor additions
    string title;        // 1..80 bytes
    string link;         // 0..200 bytes, free text (URL to details)
}
```

- Campaign ids start at 1. `campaignCount()` returns the highest id.
- Per campaign: `pledgeOf[id][addr]`, `bonusOf[id][addr]`, `refunded[id][addr]`, `bonusReclaimed[id][addr]`.
- Per campaign, append-only lists for display: `backers[id]` (address added on its first pledge) and `sponsors[id]` (address added on its first bonus contribution; the organizer is the first sponsor).

### 1.2 Status

- `Active` while `block.timestamp < deadline`.
- `Succeeded` when `block.timestamp >= deadline` and `pledged >= goal`.
- `Failed` when `block.timestamp >= deadline` and `pledged < goal`.

### 1.3 Write functions

1. `create(string title, string link, uint256 goal, uint64 deadline) payable returns (uint256 id)`
   - `msg.value` is the organizer's starting bonus and must be > 0.
   - `0 < goal <= 1e30` (1e30 wei is one trillion USDC). The cap keeps every payout formula far from overflow, so no campaign can lock sponsor funds.
   - `deadline >= block.timestamp + 10 minutes` and `deadline <= block.timestamp + 180 days`.
   - Title 1..80 bytes, link at most 200 bytes.
   - Sets organizer = `msg.sender`, bonusPool = `msg.value`, `bonusOf[id][msg.sender] = msg.value`, adds the organizer to `sponsors[id]`.
   - Emits `CampaignCreated(id, organizer, goal, deadline, msg.value, title, link)`.
2. `pledge(uint256 id) payable`
   - Campaign exists, status `Active`, `msg.value > 0`.
   - Adds to `pledgeOf` and `pledged`; adds the sender to `backers[id]` on its first pledge.
   - Emits `Pledged(id, backer, amount, backerTotal, campaignTotal)`.
3. `addBonus(uint256 id) payable`
   - Campaign exists, status `Active`, `msg.value > 0`.
   - Adds to `bonusOf` and `bonusPool`; adds the sender to `sponsors[id]` on its first contribution.
   - Emits `BonusAdded(id, sponsor, amount, bonusPool)`.
4. `collect(uint256 id)`
   - Status `Succeeded`, caller is the organizer, not yet collected.
   - Sets `collected = true`, then sends `pledged` to the organizer.
   - Emits `Collected(id, organizer, amount)`.
5. `claimRefund(uint256 id)`
   - Status `Failed`, caller has a pledge, not yet refunded.
   - Pays `pledge + pledge * bonusPool / goal` (floor division).
   - Sets `refunded` before sending. Emits `Refunded(id, backer, pledge, bonus)`.
6. `reclaimBonus(uint256 id)`
   - Status `Succeeded` or `Failed`, caller has a bonus contribution, not yet reclaimed.
   - Succeeded: pays the full contribution.
   - Failed: pays `contribution * (goal - pledged) / goal` (floor). When nobody pledged, this is the full contribution.
   - Sets `bonusReclaimed` before sending. Emits `BonusReclaimed(id, sponsor, amount)`.

Every payout uses checks-effects-interactions, `nonReentrant`, and `call{value: amount}("")`; a failed transfer reverts only that caller's claim. Use custom errors: `UnknownCampaign`, `CampaignClosed`, `CampaignOpen`, `GoalMet`, `GoalNotMet`, `NotOrganizer`, `NothingToClaim`, `AlreadyClaimed`, `InvalidGoal`, `InvalidDeadline`, `InvalidText`, `ZeroAmount`, `TransferFailed`.

### 1.4 Read functions (keep RPC calls few: Arc's public RPC allows about 0.5 calls per second)

- `campaignCount() returns (uint256)`
- `status(uint256 id) returns (uint8)` with 0 Active, 1 Succeeded, 2 Failed
- `getCampaigns(uint256 startId, uint256 limit) returns (CampaignView[])`: ids `startId` to `startId + limit - 1`, stopping at `campaignCount()`. `CampaignView` has `id, organizer, title, link, goal, pledged, bonusPool, deadline, collected, status, backerCount, sponsorCount, guaranteeBps` where `guaranteeBps = 10000 + bonusPool * 10000 / goal` (11000 means backers get 110% back on failure).
- `getBackers(uint256 id, uint256 offset, uint256 limit) returns (address[] addrs, uint256[] amounts)` and the same for `getSponsors`.
- `positionOf(uint256 id, address who) returns (uint256 pledge, uint256 bonus, bool refundDone, bool bonusDone, uint256 refundOwed, uint256 bonusOwed, uint256 collectOwed)`: what this address could claim right now (0 when nothing is claimable).

### 1.5 Invariants the tests must prove

1. The contract balance always covers everything still owed.
2. Success: the organizer receives exactly `pledged`, once; each sponsor receives exactly its contribution, once; no backer can claim.
3. Failure: each backer receives `pledge + floor(pledge * bonusPool / goal)`, once; each sponsor receives `floor(contribution * (goal - pledged) / goal)`, once; the organizer cannot collect; total paid out never exceeds total paid in.
4. Nothing can be pledged or added after the deadline; nothing can be claimed before it.
5. A late large pledge does not reduce any earlier backer's payout (fixed rate).

### 1.6 Required Foundry tests: `contracts/test/Pledgeback.t.sol`

- `test_create_storesCampaignAndBonus`, plus reverts for zero bonus, zero goal, deadline too soon, deadline too far, empty title, title over 80 bytes, link over 200 bytes.
- `test_pledge_tracksBackersAndTotals`, plus reverts after the deadline, for zero value and for an unknown id.
- `test_addBonus_raisesGuarantee`.
- `test_success_organizerCollectsOnce`, `test_success_sponsorsReclaimFullBonus`, `test_success_backerCannotClaimRefund`.
- `test_failure_exampleCampaignB`: goal 1.00 USDC, organizer bonus 0.05, sponsor bonus 0.05, pledges 0.20 and 0.10. Backers receive exactly 0.22 and 0.11; organizer and sponsor reclaim exactly 0.035 each; organizer cannot collect.
- `test_failure_doubleClaimReverts`, `test_failure_noPledges_sponsorsGetEverythingBack`, `test_claimsRevertBeforeDeadline`.
- `test_lateLargePledgeDoesNotDiluteEarlierBackers`.
- `test_reentrantBackerCannotDoubleClaim` (attacker contract re-enters `claimRefund` and `reclaimBonus` from its `receive`).
- `test_rejectingBackerOnlyBlocksItself` (a backer contract whose `receive` reverts cannot claim; others still can).
- `test_plainTransferReverts`.
- `testFuzz_conservation`: random goals, bonuses and pledges across several addresses, both outcomes, all claims made; total out <= total in, and leftover dust is at most one wei per claim.

Additional required tests (from independent review):
- Deadline boundary: pledge and addBonus succeed at `deadline - 1` and revert at exactly `deadline`; claims revert at `deadline - 1` and work at exactly `deadline`.
- Limits accepted at the edge: an 80-byte title, a 200-byte link, a deadline of exactly +10 minutes and exactly +180 days, and a goal of exactly 1e30; a goal of 1e30 + 1 reverts with `InvalidGoal`.
- `addBonus` reverts after the deadline, with zero value and for an unknown id.
- `collect` by anyone other than the organizer reverts with `NotOrganizer`; `claimRefund` by a non-backer and `reclaimBonus` by a non-sponsor revert with `NothingToClaim`.
- `positionOf` returns the exact owed amounts in the Campaign B example before and after each claim, and `getBackers` / `getSponsors` return the right addresses and amounts with paging.
- `test_pledge_tracksBackersAndTotals` also asserts the campaign's total `pledged`.
- `test_lateLargePledgeDoesNotDiluteEarlierBackers`: the late pledge is larger than the early one, and the early backer's payout is identical with and without it.
- The reentrancy test re-enters `reclaimBonus` from an attacker that really is a sponsor, as well as `claimRefund` from an attacker that is a backer, and proves only one payout each.
- The fuzz test also covers 0 to 3 extra sponsors, bonus added after pledges, campaigns with no pledges, pledged exactly equal to goal, and checks the contract balance left over equals the summed rounding dust.

## 2. Web app

- Arc Studio's default stack: Vite, React, Tailwind, wagmi and viem, injected wallet (MetaMask).
- Networks: Arc mainnet (chain 5042) and Arc Testnet (chain 5042002). Contract addresses per network live in `src/config/deployments.ts`. The mainnet address stays empty until the mainnet deploy, and the app then shows "Not deployed on this network yet".
- RPC: Arc mainnet goes through the same-origin path `/arc-rpc` first and falls back to `https://rpc.mainnet.arc.io`. Privacy filter lists (EasyPrivacy rule `||arc.io^$third-party`) block third-party arc.io requests, which breaks Arc apps for people using ad blockers.
- Read only contract state through the batch views. Never scan logs and never look up old transactions by hash: Arc's public RPC stops returning transactions older than about 7 days by hash and rejects log ranges of 10,000 blocks. Poll at most every 10 seconds.
- Amounts: native USDC with 18 decimals on chain. Accept and show at most 6 decimal places.

Pages:
1. `/` Home: the one-sentence idea, three short steps (create with a bonus, pledge, after the deadline everyone takes what they're owed), and the list of campaigns, newest first, with status, progress, guarantee and time left.
2. `/new` Create: title, link, goal (USDC), deadline (date and time), starting bonus (USDC). Live sentence: "If the goal is missed, backers get back 110% of what they pledged." Then the create transaction.
3. `/c/:id` Campaign (public, readable without a wallet): title, link, organizer, goal, pledged, progress, deadline countdown, guarantee, status, backers and sponsors with amounts. With a wallet connected, show only the actions that apply, with the exact amount before signing: Pledge, Add to bonus, Collect (organizer, after success), Claim refund and bonus (backer, after failure), Take back bonus (sponsor, after the deadline). After each transaction, wait for the receipt, re-read state and show the explorer link (`https://explorer.arc.io/tx/<hash>` or `https://explorer.testnet.arc.io/tx/<hash>`).
4. `/deploy` Deploy: deploys the Pledgeback bytecode compiled in this project from the connected wallet. Requires chain 5042 and typing `DEPLOY ON MAINNET` before mainnet. Shows the new address and transaction link, and the line to paste into `src/config/deployments.ts`.

Copy rules: plain English, short sentences, no em or en dashes, no hype words.

## 3. Hosting

`vercel.json`:
- rewrite `/arc-rpc` to `https://rpc.mainnet.arc.io/`;
- single-page fallback to `index.html`;
- headers: `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

## 4. Out of scope

Cancel, fees, owner or admin roles, EURC, voting, a backend, a database, analytics and email.
