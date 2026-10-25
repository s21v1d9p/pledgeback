import { useAccount } from 'wagmi'
import { DEPLOYMENTS, getDeployment } from '@/config/deployments'

export const ARC_TESTNET_ID = 5042002
export const ARC_MAINNET_ID = 5042

/**
 * The chain to READ from (no wallet required).
 * Prefer mainnet when it has a deployment; otherwise testnet.
 */
export function useReadChainId(): number {
  return DEPLOYMENTS[ARC_MAINNET_ID] ? ARC_MAINNET_ID : ARC_TESTNET_ID
}

/**
 * The chain the connected wallet must be on to WRITE transactions.
 * Follows the wallet's current chain if it is one of our supported chains,
 * otherwise defaults to the read chain.
 */
export function useWriteChainId(): number {
  const { chainId } = useAccount()
  const readChain = useReadChainId()
  if (chainId === ARC_MAINNET_ID || chainId === ARC_TESTNET_ID) return chainId
  return readChain
}

/**
 * Contract address for the given chain, or '' if not deployed.
 */
export function getContractAddress(chainId: number): string {
  return getDeployment(chainId)
}

/** Returns the contract address for the read chain. */
export function useReadContractAddress(): string {
  return getDeployment(useReadChainId())
}

/** Returns the contract address for the wallet's write chain. */
export function useContractAddress(): string {
  const { chainId } = useAccount()
  const readChain = useReadChainId()
  const effectiveChain =
    chainId === ARC_MAINNET_ID || chainId === ARC_TESTNET_ID ? chainId : readChain
  return getDeployment(effectiveChain)
}

/** Returns the explorer base URL for the given chain. */
export function explorerBase(chainId: number): string {
  if (chainId === ARC_MAINNET_ID) return 'https://explorer.arc.io'
  return 'https://explorer.testnet.arc.io'
}

/** Returns the explorer base URL for the wallet's chain. */
export function useExplorerBase(): string {
  const { chainId } = useAccount()
  return explorerBase(chainId ?? ARC_TESTNET_ID)
}

/** Returns the target chain ID (alias kept for NewCampaign page). */
export function useTargetChainId(): number {
  return useWriteChainId()
}

export function txUrl(base: string, hash: string): string {
  return `${base}/tx/${hash}`
}

/** Chain name for display. */
export function chainName(chainId: number): string {
  if (chainId === ARC_MAINNET_ID) return 'Arc Mainnet'
  if (chainId === ARC_TESTNET_ID) return 'Arc Testnet'
  return `Chain ${chainId}`
}
