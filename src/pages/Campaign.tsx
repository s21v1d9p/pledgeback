import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, ExternalLink, Users, Star, RefreshCw } from 'lucide-react'
import { PLEDGEBACK_ABI } from '@/config/pledgeback'
import {
  useReadChainId,
  getContractAddress,
  chainName,
  explorerBase,
  txUrl,
  ARC_TESTNET_ID,
  ARC_MAINNET_ID,
} from '@/hooks/usePledgebackContract'
import {
  formatNativeUsdc,
  parseNativeUsdc,
  shortAddr,
  formatGuaranteeBps,
  formatCountdown,
  isSafeLink,
  formatWriteError,
  progressPct,
} from '@/lib/format'

const POLL_MS = 10_000

const glass = {
  card: {
    background: 'var(--surface-strong)',
    border: '1px solid var(--border)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  } as React.CSSProperties,
  inner: {
    background: 'var(--surface-muted)',
    borderRadius: '12px',
    border: '1px solid var(--border)',
  } as React.CSSProperties,
}

const STATUS_LABELS = ['Active', 'Succeeded', 'Failed'] as const

type CampaignView = {
  id: bigint
  organizer: string
  title: string
  link: string
  goal: bigint
  pledged: bigint
  bonusPool: bigint
  deadline: bigint
  collected: boolean
  status: number
  backerCount: bigint
  sponsorCount: bigint
  guaranteeBps: bigint
}

type ActionType = 'pledge' | 'bonus' | 'collect' | 'claimRefund' | 'reclaimBonus' | null

/** Max decimal places accepted in USDC input fields. */
const MAX_DP = 6

function sanitizeAmount(v: string): string {
  const stripped = v.replace(/[^0-9.]/g, '')
  const parts = stripped.split('.')
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('')
  if (parts[1] !== undefined && parts[1].length > MAX_DP) {
    return parts[0] + '.' + parts[1].slice(0, MAX_DP)
  }
  return stripped
}

function ActionButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: React.ReactNode
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: 'var(--accent)' }}
    >
      {busy ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />{label}
        </span>
      ) : label}
    </button>
  )
}

export function Campaign() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  // Guard: non-numeric id shows "Campaign not found" instead of crashing
  const idNum = id !== undefined && /^\d+$/.test(id) ? Number(id) : NaN
  const campaignId = !isNaN(idNum) && idNum > 0 ? BigInt(idNum) : 0n

  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()

  // Single read chain — all reads (including positionOf) use this chain
  const readChainId = useReadChainId()
  const readAddr = getContractAddress(readChainId) as `0x${string}` | undefined
  const deployed = !!readAddr && campaignId > 0n
  const currentExplorerBase = explorerBase(readChainId)

  // Wallet must be on the read chain to write
  const walletOnReadChain = isConnected && walletChainId === readChainId
  const walletOnOtherArc =
    isConnected &&
    !walletOnReadChain &&
    (walletChainId === ARC_MAINNET_ID || walletChainId === ARC_TESTNET_ID)
  const walletOnWrongChain =
    isConnected &&
    !walletOnReadChain &&
    !walletOnOtherArc

  // Track hash + chainId from send time
  const [sentChainId, setSentChainId] = useState<number | undefined>()

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [pledgeStr, setPledgeStr] = useState('')
  const [bonusStr, setBonusStr] = useState('')
  const [activeAction, setActiveAction] = useState<ActionType>(null)
  // After a tx is confirmed, keep the result visible until the user dismisses
  const [resultDismissed, setResultDismissed] = useState(false)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void queryClient.invalidateQueries()
    }, POLL_MS)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [queryClient])

  // Campaign data — always from readChainId
  const { data: campaignsData, isLoading, isError: isReadError } = useReadContract({
    address: readAddr,
    abi: PLEDGEBACK_ABI,
    functionName: 'getCampaigns',
    args: [campaignId, 1n],
    chainId: readChainId,
    query: { enabled: deployed, gcTime: 0 },
  })
  const campaign = campaignsData?.[0] as CampaignView | undefined

  const { data: backersData } = useReadContract({
    address: readAddr,
    abi: PLEDGEBACK_ABI,
    functionName: 'getBackers',
    args: [campaignId, 0n, 50n],
    chainId: readChainId,
    query: { enabled: deployed, gcTime: 0 },
  })

  const { data: sponsorsData } = useReadContract({
    address: readAddr,
    abi: PLEDGEBACK_ABI,
    functionName: 'getSponsors',
    args: [campaignId, 0n, 50n],
    chainId: readChainId,
    query: { enabled: deployed, gcTime: 0 },
  })

  // positionOf — reads from the read chain (same as campaign data)
  const { data: position } = useReadContract({
    address: readAddr,
    abi: PLEDGEBACK_ABI,
    functionName: 'positionOf',
    args: [campaignId, address ?? '0x0000000000000000000000000000000000000000'],
    chainId: readChainId,
    query: {
      enabled: deployed && isConnected && !!address && !!readAddr,
      gcTime: 0,
    },
  })

  const { writeContract, data: hash, isPending, isError, error, reset } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
    chainId: sentChainId,
  })

  // Refetch all reads immediately after confirmation
  if (isSuccess && !resultDismissed) {
    void queryClient.invalidateQueries()
  }

  const busy = isPending || isConfirming
  const txHash = hash
  const txError = isError ? error : isReceiptError ? receiptError : null
  const showResult = (isSuccess || !!txError) && !resultDismissed

  function dismissResult() {
    setResultDismissed(true)
    reset()
    setActiveAction(null)
  }

  function call(functionName: string, value?: bigint) {
    if (!readAddr || !walletOnReadChain) return
    setSentChainId(walletChainId)
    setResultDismissed(false)
    writeContract({
      address: readAddr,
      abi: PLEDGEBACK_ABI,
      functionName: functionName as never,
      args: [campaignId],
      value,
      chainId: readChainId,
    })
  }

  // -------------------------------------------------------------------------
  // Early returns
  // -------------------------------------------------------------------------

  if (!id || isNaN(idNum) || idNum <= 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: 'var(--muted)' }}>Campaign not found.</p>
      </div>
    )
  }

  if (!readAddr) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: 'var(--muted)' }}>Not deployed on this network yet.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh">
        <div className="mx-auto max-w-xl px-5 py-12">
          <div className="mb-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Loading from {chainName(readChainId)}...
          </div>
          <div className="h-64 animate-pulse rounded-3xl" style={{ background: 'var(--surface-muted)' }} />
        </div>
      </div>
    )
  }

  if (isReadError) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5">
        <div className="max-w-sm text-center">
          <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--danger)' }}>
            Could not reach {chainName(readChainId)}.
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Retrying...</p>
        </div>
      </div>
    )
  }

  if (!campaign || campaign.goal === 0n) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p style={{ color: 'var(--muted)' }}>Campaign not found.</p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const statusLabel = STATUS_LABELS[campaign.status] ?? 'Unknown'
  const pct = progressPct(campaign.pledged, campaign.goal)

  const pos = position
    ? {
        pledgeAmt: position[0],
        bonusAmt: position[1],
        refundDone: position[2],
        bonusDone: position[3],
        refundOwed: position[4],
        bonusOwed: position[5],
        collectOwed: position[6],
      }
    : null

  const isOrganizer = isConnected && address?.toLowerCase() === campaign.organizer.toLowerCase()
  const canPledge = campaign.status === 0 && walletOnReadChain
  const canBonus = campaign.status === 0 && walletOnReadChain
  const canCollect =
    isOrganizer && walletOnReadChain && campaign.status === 1 && !campaign.collected &&
    !!pos && pos.collectOwed > 0n
  const canClaimRefund =
    walletOnReadChain && campaign.status === 2 && !!pos &&
    pos.pledgeAmt > 0n && !pos.refundDone && pos.refundOwed > 0n
  const canReclaimBonus =
    walletOnReadChain && campaign.status !== 0 && !!pos &&
    pos.bonusAmt > 0n && !pos.bonusDone && pos.bonusOwed > 0n

  const pledgeVal = parseNativeUsdc(pledgeStr)
  const bonusAddVal = parseNativeUsdc(bonusStr)

  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-xl px-5 py-10">

        {/* Network label */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--muted)' }}
          >
            {chainName(readChainId)}
          </span>
        </div>

        {/* Header card */}
        <div className="mb-5 rounded-3xl p-6" style={glass.card}>
          <div className="mb-3 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                background: campaign.status === 2 ? 'rgba(186,43,76,0.10)' : 'rgba(26,128,71,0.10)',
                color: campaign.status === 2 ? 'var(--danger)' : 'var(--success)',
              }}
            >
              {statusLabel}
            </span>
            <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              {formatGuaranteeBps(campaign.guaranteeBps)} guaranteed on failure
            </span>
          </div>

          <h1
            className="display mb-1 text-2xl font-bold tracking-tight leading-snug"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            {campaign.title}
          </h1>

          {campaign.link && (
            <div className="mb-3 text-sm" style={{ color: 'var(--muted)' }}>
              {isSafeLink(campaign.link) ? (
                <a
                  href={campaign.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  {campaign.link.length > 60 ? campaign.link.slice(0, 60) + '...' : campaign.link}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <span>{campaign.link}</span>
              )}
            </div>
          )}

          <div className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
            Organizer:{' '}
            <span className="mono" style={{ color: 'var(--ink-2)' }}>{shortAddr(campaign.organizer)}</span>
          </div>

          <div className="mb-2 flex items-end justify-between text-sm">
            <span className="display tabular-nums font-bold" style={{ color: 'var(--ink)' }}>
              {formatNativeUsdc(campaign.pledged)} USDC
            </span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              of {formatNativeUsdc(campaign.goal)} goal
            </span>
          </div>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct >= 100 ? 'var(--success)' : 'var(--accent)',
              }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs" style={{ color: 'var(--muted)' }}>
            <div>
              <div className="tabular-nums font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>
                {formatNativeUsdc(campaign.bonusPool)}
              </div>
              <div>bonus pool USDC</div>
            </div>
            <div>
              <div className="tabular-nums font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>
                {Number(campaign.backerCount)}
              </div>
              <div>backers</div>
            </div>
            <div>
              <div className="font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>
                {formatCountdown(Number(campaign.deadline))}
              </div>
              <div>deadline</div>
            </div>
          </div>
        </div>

        {/* Tx feedback */}
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
            <button type="button" onClick={dismissResult} className="mt-2 text-xs underline" style={{ color: 'var(--danger)' }}>
              Dismiss
            </button>
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

        {showResult && isSuccess && txHash && (
          <div className="mb-4 rounded-2xl p-4" style={{ background: 'rgba(26,128,71,0.08)', border: '1px solid rgba(26,128,71,0.2)' }}>
            <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--success)' }}>Transaction confirmed.</div>
            <a
              href={txUrl(currentExplorerBase, txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--success)' }}
            >
              View on explorer <ExternalLink className="size-3" />
            </a>
            <button type="button" onClick={dismissResult} className="ml-4 text-xs" style={{ color: 'var(--subtle)' }}>
              Dismiss
            </button>
          </div>
        )}

        {/* Switch to read chain */}
        {(walletOnOtherArc || walletOnWrongChain) && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm" style={glass.card}>
            <span style={{ color: 'var(--muted)' }}>
              {walletOnOtherArc
                ? `This page reads from ${chainName(readChainId)}. Your wallet is on ${chainName(walletChainId)}.`
                : `Switch to ${chainName(readChainId)} to interact.`}
            </span>
            <button
              onClick={() => switchChain({ chainId: readChainId })}
              disabled={isSwitching}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <RefreshCw className="size-3" />
              Switch
            </button>
          </div>
        )}
        {switchError && (
          <div className="mb-4 text-xs" style={{ color: 'var(--danger)' }}>
            {formatWriteError(switchError)}
          </div>
        )}

        {/* Actions — only shown when wallet is on the read chain */}
        {walletOnReadChain && (
          <div className="mb-5 flex flex-col gap-3">

            {canPledge && (
              <div className="rounded-2xl p-4" style={glass.card}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Pledge USDC</div>
                <div className="mb-3 rounded-xl p-3" style={glass.inner}>
                  <input
                    inputMode="decimal"
                    value={pledgeStr}
                    onChange={(e) => setPledgeStr(sanitizeAmount(e.target.value))}
                    placeholder="0.00"
                    className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:opacity-30"
                    style={{ color: 'var(--ink)' }}
                  />
                  <div className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</div>
                </div>
                {pledgeVal !== null && pledgeVal > 0n && (
                  <div className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                    On failure, you get back at least{' '}
                    <strong className="tabular-nums">
                      {formatNativeUsdc(pledgeVal + (pledgeVal * campaign.bonusPool) / campaign.goal)}
                    </strong>{' '}
                    USDC
                  </div>
                )}
                <ActionButton
                  label={activeAction === 'pledge' && busy ? 'Confirming...' : `Pledge ${pledgeStr || '0'} USDC`}
                  busy={activeAction === 'pledge' && busy}
                  disabled={!pledgeVal || pledgeVal <= 0n}
                  onClick={() => {
                    if (!pledgeVal || pledgeVal <= 0n) return
                    setActiveAction('pledge')
                    call('pledge', pledgeVal)
                  }}
                />
              </div>
            )}

            {canBonus && (
              <div className="rounded-2xl p-4" style={glass.card}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Add to bonus</div>
                <div className="mb-3 rounded-xl p-3" style={glass.inner}>
                  <input
                    inputMode="decimal"
                    value={bonusStr}
                    onChange={(e) => setBonusStr(sanitizeAmount(e.target.value))}
                    placeholder="0.00"
                    className="display w-full bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:opacity-30"
                    style={{ color: 'var(--ink)' }}
                  />
                  <div className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</div>
                </div>
                <ActionButton
                  label={activeAction === 'bonus' && busy ? 'Confirming...' : `Add ${bonusStr || '0'} USDC to bonus`}
                  busy={activeAction === 'bonus' && busy}
                  disabled={!bonusAddVal || bonusAddVal <= 0n}
                  onClick={() => {
                    if (!bonusAddVal || bonusAddVal <= 0n) return
                    setActiveAction('bonus')
                    call('addBonus', bonusAddVal)
                  }}
                />
              </div>
            )}

            {canCollect && (
              <div className="rounded-2xl p-4" style={glass.card}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Collect pledges</div>
                <div className="mb-3 text-sm" style={{ color: 'var(--ink-2)' }}>
                  You will receive{' '}
                  <strong className="tabular-nums">{formatNativeUsdc(pos?.collectOwed)}</strong> USDC.
                </div>
                <ActionButton
                  label={activeAction === 'collect' && busy ? 'Confirming...' : 'Collect pledges'}
                  busy={activeAction === 'collect' && busy}
                  disabled={busy && activeAction !== 'collect'}
                  onClick={() => { setActiveAction('collect'); call('collect') }}
                />
              </div>
            )}

            {canClaimRefund && (
              <div className="rounded-2xl p-4" style={glass.card}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Claim refund</div>
                <div className="mb-3 text-sm" style={{ color: 'var(--ink-2)' }}>
                  You will receive{' '}
                  <strong className="tabular-nums">{formatNativeUsdc(pos?.refundOwed)}</strong> USDC (pledge + bonus share).
                </div>
                <ActionButton
                  label={activeAction === 'claimRefund' && busy ? 'Confirming...' : 'Claim refund and bonus'}
                  busy={activeAction === 'claimRefund' && busy}
                  disabled={busy && activeAction !== 'claimRefund'}
                  onClick={() => { setActiveAction('claimRefund'); call('claimRefund') }}
                />
              </div>
            )}

            {canReclaimBonus && (
              <div className="rounded-2xl p-4" style={glass.card}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Take back bonus</div>
                <div className="mb-3 text-sm" style={{ color: 'var(--ink-2)' }}>
                  You will receive{' '}
                  <strong className="tabular-nums">{formatNativeUsdc(pos?.bonusOwed)}</strong> USDC.
                </div>
                <ActionButton
                  label={activeAction === 'reclaimBonus' && busy ? 'Confirming...' : 'Take back bonus'}
                  busy={activeAction === 'reclaimBonus' && busy}
                  disabled={busy && activeAction !== 'reclaimBonus'}
                  onClick={() => { setActiveAction('reclaimBonus'); call('reclaimBonus') }}
                />
              </div>
            )}
          </div>
        )}

        {!isConnected && (
          <div className="mb-5 rounded-2xl p-4 text-center text-sm" style={glass.card}>
            <span style={{ color: 'var(--muted)' }}>Connect your wallet to pledge or claim.</span>
          </div>
        )}

        {/* Backers */}
        <div className="mb-4 rounded-2xl p-4" style={glass.card}>
          <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            <Users className="size-4" /> Backers ({Number(campaign.backerCount)})
          </div>
          {backersData && backersData[0].length > 0 ? (
            <div className="flex flex-col gap-2">
              {backersData[0].map((addr, i) => (
                <div key={addr} className="flex items-center justify-between text-xs">
                  <span className="mono" style={{ color: 'var(--ink-2)' }}>{shortAddr(addr)}</span>
                  <span className="tabular-nums" style={{ color: 'var(--muted)' }}>{formatNativeUsdc(backersData[1][i])} USDC</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>No backers yet.</p>
          )}
        </div>

        {/* Sponsors */}
        <div className="rounded-2xl p-4" style={glass.card}>
          <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            <Star className="size-4" /> Sponsors ({Number(campaign.sponsorCount)})
          </div>
          {sponsorsData && sponsorsData[0].length > 0 ? (
            <div className="flex flex-col gap-2">
              {sponsorsData[0].map((addr, i) => (
                <div key={addr} className="flex items-center justify-between text-xs">
                  <span className="mono" style={{ color: 'var(--ink-2)' }}>{shortAddr(addr)}</span>
                  <span className="tabular-nums" style={{ color: 'var(--muted)' }}>{formatNativeUsdc(sponsorsData[1][i])} USDC</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>No sponsors yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
