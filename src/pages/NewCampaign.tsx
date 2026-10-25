import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, ExternalLink } from 'lucide-react'
import { PLEDGEBACK_ABI } from '@/config/pledgeback'
import {
  useReadChainId,
  getContractAddress,
  explorerBase,
  txUrl,
  chainName,
} from '@/hooks/usePledgebackContract'
import {
  parseNativeUsdc,
  formatNativeUsdc,
  formatWriteError,
  getMinDeadlineStr,
} from '@/lib/format'
import { decodeEventLog } from 'viem'

const glass = {
  card: {
    background: 'var(--surface-strong)',
    border: '1px solid var(--border)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  } as React.CSSProperties,
}

/** Max decimal places accepted in USDC input fields. */
const MAX_DP = 6

/** Strip characters that are not digits or a single dot. */
function sanitizeAmount(v: string): string {
  const stripped = v.replace(/[^0-9.]/g, '')
  // Allow at most one dot
  const parts = stripped.split('.')
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('')
  // Reject more than MAX_DP decimal places
  if (parts[1] !== undefined && parts[1].length > MAX_DP) {
    return parts[0] + '.' + parts[1].slice(0, MAX_DP)
  }
  return stripped
}

/** Minimum deadline offset in seconds (10 minutes). */
const MIN_DEADLINE_OFFSET = 10 * 60

/** Module-level time helper so the React purity lint does not flag Date.now inside a component. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function NewCampaign() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { address, isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()

  // The chain the page is reading from — actions are only allowed when the
  // wallet is on this same chain.
  const readChainId = useReadChainId()
  const contractAddress = getContractAddress(readChainId)
  const currentExplorerBase = explorerBase(readChainId)

  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [goalStr, setGoalStr] = useState('')
  const [bonusStr, setBonusStr] = useState('')
  const [deadlineStr, setDeadlineStr] = useState('')

  // Track the chain at the time of submission so receipt lookup uses the right chain
  const [sentChainId, setSentChainId] = useState<number | undefined>()

  const {
    writeContract,
    data: hash,
    isPending,
    isError,
    error,
    reset,
  } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash,
    chainId: sentChainId,
  })

  // Wallet must be on the read chain to write
  const walletOnReadChain = isConnected && chainId === readChainId
  const walletOnWrongChain = isConnected && chainId !== readChainId

  // Live guarantee sentence
  const goalVal = parseNativeUsdc(goalStr)
  const bonusVal = parseNativeUsdc(bonusStr)
  let guaranteeBps = 10000n
  if (goalVal && goalVal > 0n && bonusVal && bonusVal > 0n) {
    guaranteeBps = 10000n + (bonusVal * 10000n) / goalVal
  }
  // Floor the percentage — never overstate what backers are promised
  const guaranteePct = (guaranteeBps / 100n).toString()

  // Decode campaign id from the receipt
  let newId: string | null = null
  if (isSuccess && receipt) {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: PLEDGEBACK_ABI,
          data: log.data,
          topics: log.topics,
          eventName: 'CampaignCreated',
        })
        if (decoded.args && 'id' in decoded.args) {
          newId = decoded.args.id?.toString() ?? null
        }
      } catch {
        // non-matching log — ignore
      }
    }
  }

  // Refetch all reads on success
  if (isSuccess) {
    void queryClient.invalidateQueries()
  }

  function validate(nowTs: number): string | null {
    if (title.trim().length === 0) return 'Title is required.'
    if (new TextEncoder().encode(title).length > 80) return 'Title must be at most 80 bytes.'
    if (new TextEncoder().encode(link).length > 200) return 'Link must be at most 200 bytes.'
    if (!goalVal || goalVal <= 0n) return 'Goal must be greater than 0.'
    if (!bonusVal || bonusVal <= 0n) return 'Starting bonus must be greater than 0.'
    if (!deadlineStr) return 'Deadline is required.'
    const deadlineTs = Math.floor(new Date(deadlineStr).getTime() / 1000)
    if (deadlineTs < nowTs + MIN_DEADLINE_OFFSET) return 'Deadline must be at least 10 minutes from now.'
    if (deadlineTs > nowTs + 180 * 24 * 3600) return 'Deadline must be at most 180 days from now.'
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConnected || !address || !walletOnReadChain || !contractAddress) return

    const nowTs = nowSeconds()
    const err = validate(nowTs)
    if (err) { alert(err); return }

    const deadlineTs = BigInt(Math.floor(new Date(deadlineStr).getTime() / 1000))
    const addr = contractAddress as `0x${string}`
    setSentChainId(chainId)

    writeContract({
      address: addr,
      abi: PLEDGEBACK_ABI,
      functionName: 'create',
      args: [title.trim(), link.trim(), goalVal!, deadlineTs],
      value: bonusVal!,
      chainId: readChainId,
    })
  }

  const txHash = hash
  const txError = isError ? error : isReceiptError ? receiptError : null
  const busy = isPending || isConfirming

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <div className="mx-auto max-w-lg px-5 py-12">
        <div className="mb-1 flex items-center gap-2">
          <h1 className="display text-3xl font-bold tracking-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            New campaign
          </h1>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--muted)' }}
          >
            {chainName(readChainId)}
          </span>
        </div>
        <p className="mb-8 text-sm" style={{ color: 'var(--muted)' }}>
          Set a goal and put up a bonus. If the goal is missed, backers get their money back plus a share of your bonus.
        </p>

        {!contractAddress && (
          <div className="mb-6 rounded-2xl p-4 text-sm" style={{ ...glass.card, color: 'var(--muted)' }}>
            Not deployed on {chainName(readChainId)} yet.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div className="rounded-2xl p-4" style={glass.card}>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you funding?"
              maxLength={80}
              className="w-full bg-transparent text-base outline-none placeholder:opacity-40"
              style={{ color: 'var(--ink)' }}
              required
            />
            <div className="mt-1 text-right text-xs" style={{ color: 'var(--subtle)' }}>
              {new TextEncoder().encode(title).length}/80 bytes
            </div>
          </div>

          {/* Link */}
          <div className="rounded-2xl p-4" style={glass.card}>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Link <span className="normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              maxLength={200}
              className="w-full bg-transparent text-base outline-none placeholder:opacity-40"
              style={{ color: 'var(--ink)' }}
            />
          </div>

          {/* Goal + Bonus side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={glass.card}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Goal (USDC)
              </label>
              <input
                inputMode="decimal"
                value={goalStr}
                onChange={(e) => setGoalStr(sanitizeAmount(e.target.value))}
                placeholder="0.00"
                className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:opacity-30"
                style={{ color: 'var(--ink)' }}
              />
            </div>

            <div className="rounded-2xl p-4" style={glass.card}>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                Your bonus (USDC)
              </label>
              <input
                inputMode="decimal"
                value={bonusStr}
                onChange={(e) => setBonusStr(sanitizeAmount(e.target.value))}
                placeholder="0.00"
                className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:opacity-30"
                style={{ color: 'var(--ink)' }}
              />
            </div>
          </div>

          {/* Deadline */}
          <div className="rounded-2xl p-4" style={glass.card}>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Deadline (UTC)
            </label>
            <input
              type="datetime-local"
              value={deadlineStr}
              min={getMinDeadlineStr()}
              onChange={(e) => setDeadlineStr(e.target.value)}
              className="w-full bg-transparent text-base outline-none"
              style={{ color: 'var(--ink)' }}
              required
            />
          </div>

          {/* Live guarantee sentence */}
          <div
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ background: 'rgba(18,45,69,0.06)', color: 'var(--ink-2)' }}
          >
            {goalVal && goalVal > 0n && bonusVal && bonusVal > 0n ? (
              <>
                If the goal is missed, backers get back{' '}
                <strong className="tabular-nums">{guaranteePct}%</strong> of what they pledged.{' '}
                <span style={{ color: 'var(--muted)' }}>
                  (Bonus pool: {formatNativeUsdc(bonusVal)} USDC)
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>
                Enter a goal and bonus to see the guarantee.
              </span>
            )}
          </div>

          {/* Switch chain notice */}
          {walletOnWrongChain && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(18,45,69,0.06)', color: 'var(--ink-2)' }}>
              <div className="mb-2">
                Your wallet is on {chainId !== undefined ? chainName(chainId) : 'another network'}.
                Switch to {chainName(readChainId)} to create a campaign.
              </div>
              <button
                type="button"
                onClick={() => switchChain({ chainId: readChainId })}
                disabled={isSwitching}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: 'var(--accent)' }}
              >
                {isSwitching ? 'Switching...' : `Switch to ${chainName(readChainId)}`}
              </button>
              {switchError && (
                <div className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>
                  {formatWriteError(switchError)}
                </div>
              )}
            </div>
          )}

          {/* Tx error */}
          {txError && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}>
              {formatWriteError(txError)}
            </div>
          )}

          {/* Waiting for confirmation */}
          {isConfirming && txHash && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(18,45,69,0.06)', color: 'var(--ink-2)' }}>
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

          {/* Success */}
          {isSuccess && txHash && (
            <div className="rounded-2xl p-4" style={{ background: 'rgba(26,128,71,0.08)', border: '1px solid rgba(26,128,71,0.2)' }}>
              <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--success)' }}>Campaign created.</div>
              <a
                href={txUrl(currentExplorerBase, txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--success)' }}
              >
                View transaction <ExternalLink className="size-3" />
              </a>
              {newId && (
                <button
                  type="button"
                  onClick={() => { void navigate(`/c/${newId}`) }}
                  className="ml-4 text-xs font-semibold"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  Go to campaign
                </button>
              )}
            </div>
          )}

          {/* CTA */}
          {!isSuccess && (
            <button
              type="submit"
              disabled={busy || !contractAddress || walletOnWrongChain}
              className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {!isConnected ? 'Connect wallet to create' :
               walletOnWrongChain ? `Switch to ${chainName(readChainId)}` :
               isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" />Confirm in wallet...
                </span>
               ) :
               isConfirming ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="size-4 animate-spin" />Waiting for confirmation...
                </span>
               ) :
               'Create campaign'}
            </button>
          )}

          {isSuccess && (
            <button
              type="button"
              onClick={() => {
                reset()
                setTitle('')
                setLink('')
                setGoalStr('')
                setBonusStr('')
                setDeadlineStr('')
                setSentChainId(undefined)
              }}
              className="w-full rounded-2xl border py-3.5 text-sm font-semibold transition-all hover:scale-[1.01]"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}
            >
              Create another
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
