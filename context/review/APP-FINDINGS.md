# App findings from independent review (fix all)

Read chain = the network the site reads from (mainnet once src/config/deployments.ts has a mainnet address, otherwise Arc Testnet).

## High
1. Connecting must not switch networks. Replace ConnectKit with a small "Connect wallet" button using wagmi's injected connector (MetaMask), with no chain switch on connect. This also stops ConnectKit's ENS and avatar lookups to a public Ethereum RPC (a privacy leak of the user's address) and shrinks the bundle.
2. Use viem's `arc` (5042) and `arcTestnet` (5042002) chain objects from `viem/chains`, so wallet_addEthereumChain gets absolute https RPC URLs and viem gets the multicall3 address. Keep `/arc-rpc` only in the mainnet transport: `fallback([http('/arc-rpc'), http('https://rpc.mainnet.arc.io')], { retryCount: 1 })`. Set the QueryClient default retry to 1. Show `useSwitchChain().error` wherever a switch button exists.
3. Every write goes to the read chain only. Remove the separate write chain: show the action panel on /c/:id and the create button on /new only when the wallet's chain equals the read chain; otherwise show only "Switch to <read chain name>". Read `positionOf` from the read chain. Name the network on /new. No hard-coded testnet switch anywhere.
4. Transaction outcomes are never silent:
   - Keep the hash and the chain id from send time, and pass that chainId to useWaitForTransactionReceipt.
   - While waiting, show "Waiting for confirmation" with the explorer link, and keep the button disabled.
   - On a reverted receipt or a receipt error, show the error with the explorer link. Don't re-enable the same action until the user dismisses the result or state is re-read.
   - After success, refetch every read on the page immediately.
   - Treat a rejection by error name (`UserRejectedRequestError`, also checked on `error.cause`) and show "You cancelled in your wallet".
   - Apply the same rules on /new and /deploy.

## Medium
5. /deploy gas: show the fee as gas × maxFeePerGas (useEstimateFeesPerGas for the chain) in USDC, plus gas units on a separate line. Never format gas units as USDC.
6. Guarantee percent: floor in bigint (bps / 100n). Never round up what backers are promised.
7. Amounts:
   - Reject input with more than 6 decimal places, both in the input filter and in the parse function.
   - Progress percent floors.
   - Show 100% and the success colour only when pledged >= goal.
8. Covered by item 2 (multicall batching on mainnet).

## Smaller
- Use the full ABI from the compiled artifact (events and custom errors) so "Go to campaign" works after create (decode CampaignCreated from the receipt) and reverts show the custom error name in plain words.
- /c/:id with a non-numeric id shows "Campaign not found" instead of crashing. Add an error boundary around the routes.
- The /new deadline minimum uses local time, not UTC.
- Distinguish loading, read error and empty: show "Loading", "Could not reach Arc. Retrying", and only then "No campaigns yet" or "Campaign not found".
- /deploy imports only the creation bytecode (or lazy-load the /deploy route) so visitors don't download the 400 KB artifact.
- Load src/tracing.ts and src/console-capture.ts only when the app runs inside a frame (window.self !== window.top, as in the Arc Studio preview), never on the hosted site.
- Use system fonts instead of Google Fonts, so the site makes no third-party requests.
- Add "build": "tsc --noEmit && vite build" to package.json scripts.
