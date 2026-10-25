/**
 * /deploy — Deploy Pledgeback from the connected wallet.
 *
 * Bytecode: imported from the Foundry artifact at build time.
 * Only the bytecode.object field is used so visitors who never visit /deploy
 * do not download the full 400 KB artifact (the route is lazy-loaded in App.tsx).
 * No constructor arguments.
 */
import { useState } from 'react'
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useEstimateGas,
  useEstimateFeesPerGas,
} from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import {
  ARC_TESTNET_ID,
  ARC_MAINNET_ID,
  chainName,
  explorerBase,
  txUrl,
} from '@/hooks/usePledgebackContract'
import { formatNativeUsdc, formatWriteError } from '@/lib/format'

// Import only the bytecode field — this is a small slice of the artifact.
// Vite resolves this static JSON import at build time.
const artifactBytecode = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const obj = (require('../../contracts/out/Pledgeback.sol/Pledgeback.json') as {
      bytecode?: { object?: string }
    }).bytecode?.object
    if (typeof obj === 'string' && obj.startsWith('0x') && obj.length > 4) return obj as `0x${string}`
  } catch { /* intentional */ }
  return '0x' as `0x${string}`
})()

const DEPLOY_CONFIRM_TEXT = 'DEPLOY ON MAINNET'

const glass = {
  card: {
    background: 'var(--surface-strong)',
    border: '1px solid var(--border)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  } as React.CSSProperties,
}

export function Deploy() {
  const queryClient = useQueryClient()
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()

  const [confirmText, setConfirmText] = useState('')
  const [sentChainId, setSentChainId] = useState<number | undefined>()
  const [resultDismissed, setResultDismissed] = useState(false)

  const isMainnet = walletChainId === ARC_MAINNET_ID
  const isTestnet = walletChainId === ARC_TESTNET_ID
  const isArcChain = isMainnet || isTestnet
  const confirmed = !isMainnet || confirmText.trim() === DEPLOY_CONFIRM_TEXT

  const BYTECODE = artifactBytecode
  const bytecodeOk = BYTECODE !== '0x'

  // Gas units estimate
  const { data: gasEstimate } = useEstimateGas({
    data: BYTECODE,
    account: address,
    query: { enabled: isConnected && isArcChain && bytecodeOk, retry: false },
  })

  // Current fee per gas (for cost display: gasUnits x maxFeePerGas)
  const { data: feeData } = useEstimateFeesPerGas({
    chainId: walletChainId,
    query: { enabled: isConnected && isArcChain },
  })

  // Fee estimate in native USDC wei: gasUnits * maxFeePerGas
  const feeEstimate =
    gasEstimate !== undefined && feeData?.maxFeePerGas !== undefined
      ? gasEstimate * feeData.maxFeePerGas
      : undefined

  const { sendTransaction, data: hash, isPending, isError, error, reset } = useSendTransaction()

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash, chainId: sentChainId })

  if (isSuccess) {
    void queryClient.invalidateQueries()
  }

  const newContractAddress = receipt?.contractAddress
  const busy = isPending || isConfirming
  const txHash = hash
  const txError = isError ? error : isReceiptError ? receiptError : null
  const showResult = (isSuccess || !!txError) && !resultDismissed
  const currentExplorerBase = explorerBase(walletChainId ?? ARC_TESTNET_ID)
  const canDeploy = isConnected && isArcChain && confirmed && bytecodeOk && !busy

  function deploy() {
    if (!canDeploy) return
    setSentChainId(walletChainId)
    setResultDismissed(false)
    sendTransaction({ data: BYTECODE, value: 0n, chainId: walletChainId })
  }

  function dismissResult() {
    setResultDismissed(true)
    reset()
  }

  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-xl px-5 pb-16 pt-10">

        <h1 className="display mb-1 text-2xl font-bold tracking-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.025em' }}>
          Deploy Pledgeback
        </h1>
        <p className="mb-8 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          Deploy the Pledgeback contract from your connected wallet. No constructor arguments.
          After deployment, paste the new address into <code className="mono text-xs">src/config/deployments.ts</code>.
        </p>

        {/* Bytecode status */}
        {!bytecodeOk && (
          <div className="mb-5 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
            <AlertTriangle className="size-4 shrink-0" />
            Bytecode not found. Run <code className="mono text-xs">forge build</code> first.
          </div>
        )}

        {/* Network card */}
        <div className="mb-5 rounded-2xl p-5" style={glass.card}>
          <div className="mb-4 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Network</div>

          {!isConnected && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to continue.</p>
          )}

          {isConnected && !isArcChain && (
            <div className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Switch to Arc Testnet or Arc Mainnet to deploy.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
                  disabled={isSwitching}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all"
                  style={{ background: 'var(--accent)' }}
                >
                  Arc Testnet
                </button>
                <button
                  onClick={() => switchChain({ chainId: ARC_MAINNET_ID })}
                  disabled={isSwitching}
                  className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
                  style={{ border: '1px solid var(--border)', color: 'var(--ink)' }}
                >
                  Arc Mainnet
                </button>
              </div>
              {switchError && (
                <div className="text-xs" style={{ color: 'var(--danger)' }}>
                  {formatWriteError(switchError)}
                </div>
              )}
            </div>
          )}

          {isConnected && isArcChain && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--muted)' }}>Network</span>
                <span className="font-semibold" style={{ color: isMainnet ? 'var(--danger)' : 'var(--success)' }}>
                  {chainName(walletChainId)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--muted)' }}>Deployer</span>
                <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>{address}</span>
              </div>
              {gasEstimate !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>Gas units</span>
                  <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {gasEstimate.toString()}
                  </span>
                </div>
              )}
              {feeEstimate !== undefined && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>Estimated fee</span>
                  <span className="tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {formatNativeUsdc(feeEstimate)} USDC
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mainnet confirmation gate */}
        {isConnected && isMainnet && !isSuccess && (
          <div className="mb-5 rounded-2xl p-5" style={{ ...glass.card, borderColor: 'rgba(186,43,76,0.30)' }}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--danger)' }}>
              <AlertTriangle className="size-4 shrink-0" /> Mainnet deployment
            </div>
            <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              This will deploy a live contract using real funds. There is no undo.
              Type <strong className="mono">{DEPLOY_CONFIRM_TEXT}</strong> to enable the deploy button.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={DEPLOY_CONFIRM_TEXT}
              className="w-full rounded-xl bg-transparent px-3 py-2 text-sm outline-none"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--ink)', fontFamily: 'monospace' }}
            />
          </div>
        )}

        {/* Waiting for confirmation */}
        {isConfirming && txHash && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(18,45,69,0.06)', color: 'var(--ink-2)' }}>
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Waiting for confirmation...{' '}
              <a
                href={txUrl(currentExplorerBase, txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs underline"
                style={{ color: 'var(--accent-hover)' }}
              >
                View <ExternalLink className="size-3" />
              </a>
            </span>
          </div>
        )}

        {/* Tx error */}
        {showResult && txError && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
            <div className="flex items-start justify-between gap-3">
              <span>{formatWriteError(txError)}</span>
              {txHash && (
                <a
                  href={txUrl(currentExplorerBase, txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 text-xs underline"
                  style={{ color: 'var(--danger)' }}
                >
                  View <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <button type="button" onClick={dismissResult} className="mt-2 text-xs underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Success */}
        {showResult && isSuccess && newContractAddress && (
          <div className="mb-5 rounded-2xl p-5" style={{ background: 'rgba(26,128,71,0.06)', border: '1px solid rgba(26,128,71,0.25)' }}>
            <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
              Contract deployed.
            </div>
            <div className="mb-3 flex items-center justify-between text-xs">
              <span style={{ color: 'var(--muted)' }}>Contract address</span>
              <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>{newContractAddress}</span>
            </div>
            {txHash && (
              <a
                href={txUrl(currentExplorerBase, txHash)}
                target="_blank"
                rel="noreferrer"
                className="mb-4 inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--success)' }}
              >
                View transaction <ExternalLink className="size-3" />
              </a>
            )}
            <div className="mt-4 rounded-xl p-3 text-xs" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="mb-1 font-semibold" style={{ color: 'var(--ink-2)' }}>
                Paste this line into <code className="mono">src/config/deployments.ts</code>:
              </div>
              <code className="mono block select-all" style={{ color: 'var(--ink)' }}>
                {walletChainId === ARC_MAINNET_ID
                  ? `  ${ARC_MAINNET_ID}: '${newContractAddress}',`
                  : `  ${ARC_TESTNET_ID}: '${newContractAddress}',`}
              </code>
            </div>
          </div>
        )}

        {/* Deploy button */}
        {isConnected && isArcChain && !isSuccess && (
          <button
            onClick={deploy}
            disabled={!canDeploy}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: isMainnet ? 'var(--danger)' : 'var(--accent)' }}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />Confirm in wallet...
              </span>
            ) : isConfirming ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />Waiting for confirmation...
              </span>
            ) : (
              `Deploy on ${chainName(walletChainId)}`
            )}
          </button>
        )}
      </div>
    </div>
  )
}
