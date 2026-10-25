/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Re-export the viem chain objects so other modules can reference them
export { arc as arcMainnet, arcTestnet }

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, 'https://rpc.mainnet.arc.io')

export const config = createConfig({
  chains: [arcTestnet, arc],
  connectors: [injected()],
  transports: {
    // Arc Testnet: direct public RPC
    [arcTestnet.id]: http(),
    // Arc mainnet: try same-origin proxy first (avoids ad-blocker blocks on
    // third-party arc.io requests), fall back to the public RPC.
    [arc.id]: fallback(
      [http('/arc-rpc'), http('https://rpc.mainnet.arc.io')],
      { retryCount: 1 }
    ),
  },
})
