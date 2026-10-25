/**
 * Pledgeback contract addresses per network.
 * Chain IDs: 5042002 = Arc Testnet, 5042 = Arc Mainnet
 */
export const DEPLOYMENTS: Record<number, string> = {
  5042002: '0x82f72eee77cfa6f95ed9ccb70087d386d8c1bec9',
  5042: '', // mainnet: not yet deployed
}

export function getDeployment(chainId: number | undefined): string {
  if (chainId === undefined) return ''
  return DEPLOYMENTS[chainId] ?? ''
}
