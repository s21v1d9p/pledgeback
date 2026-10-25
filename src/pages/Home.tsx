import { useReadContract, useAccount, useSwitchChain } from 'wagmi'
import { Link } from 'react-router-dom'
import { ArrowRight, Target, Clock, Coins, RefreshCw } from 'lucide-react'
import { PLEDGEBACK_ABI } from '@/config/pledgeback'
import {
  useReadChainId,
  getContractAddress,
  chainName,
  ARC_MAINNET_ID,
  ARC_TESTNET_ID,
} from '@/hooks/usePledgebackContract'
import { CampaignCard } from '@/components/CampaignCard'
import { formatWriteError } from '@/lib/format'

const POLL_MS = 10_000
const PAGE_SIZE = 50n

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

const glass = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    backdropFilter: 'blur(16px) saturate(180%)',
    WebkitBackdropFilter: 'blur(16px) saturate(180%)',
  } as React.CSSProperties,
}

export function Home() {
  const readChainId = useReadChainId()
  const contractAddr = getContractAddress(readChainId) as `0x${string}` | undefined
  const deployed = !!contractAddr

  const { chainId: walletChainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()

  const { data: count, isLoading: isCountLoading, isError: isCountError } = useReadContract({
    address: contractAddr,
    abi: PLEDGEBACK_ABI,
    functionName: 'campaignCount',
    chainId: readChainId,
    query: { enabled: deployed, refetchInterval: POLL_MS, gcTime: 0 },
  })

  const total = count ?? 0n
  const startId = total > PAGE_SIZE ? total - PAGE_SIZE + 1n : 1n

  const { data: campaigns, isLoading: isCampaignsLoading } = useReadContract({
    address: contractAddr,
    abi: PLEDGEBACK_ABI,
    functionName: 'getCampaigns',
    args: [startId, PAGE_SIZE],
    chainId: readChainId,
    query: { enabled: deployed && total > 0n, refetchInterval: POLL_MS, gcTime: 0 },
  })

  const isLoading = isCountLoading || isCampaignsLoading
  const sorted = campaigns ? ([...campaigns].reverse() as CampaignView[]) : []

  // Wallet on a different Arc chain than the read chain
  const walletChainMismatch =
    isConnected &&
    walletChainId !== undefined &&
    walletChainId !== readChainId &&
    (walletChainId === ARC_MAINNET_ID || walletChainId === ARC_TESTNET_ID)

  // Wallet on a non-Arc chain entirely
  const walletOnWrongChain =
    isConnected &&
    walletChainId !== undefined &&
    walletChainId !== ARC_MAINNET_ID &&
    walletChainId !== ARC_TESTNET_ID

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Hero */}
      <div className="mx-auto max-w-2xl px-5 pb-8 pt-12">
        <h1
          className="display mb-3 text-4xl font-bold leading-tight tracking-tight text-balance"
          style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
        >
          Back things you believe in,<br />with a guarantee.
        </h1>
        <p className="mb-8 max-w-lg text-base leading-relaxed text-pretty" style={{ color: 'var(--muted)' }}>
          Pledgeback is a dominant assurance contract. If the goal is missed, every backer gets their pledge
          back plus a bonus. So you win either way.
        </p>

        {/* Three steps */}
        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: <Coins className="size-4" />, title: 'Create with a bonus', body: 'Set a goal, a deadline, and put up a bonus from your own funds.' },
            { icon: <Target className="size-4" />, title: 'Back the campaign', body: 'Pledge USDC. If the goal is met, the organizer receives everything.' },
            { icon: <Clock className="size-4" />, title: 'Claim what you are owed', body: 'After the deadline, each person claims their share. No manual distribution.' },
          ].map((step, i) => (
            <div key={i} className="rounded-2xl p-4" style={glass.card}>
              <div className="mb-2 flex size-7 items-center justify-center rounded-lg" style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--accent)' }}>
                {step.icon}
              </div>
              <div className="mb-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{step.title}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{step.body}</div>
            </div>
          ))}
        </div>

        <div className="mb-8 flex items-center gap-3">
          <Link
            to="/new"
            className="inline-flex items-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{ background: 'var(--accent)' }}
          >
            Create a campaign <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Campaign list */}
      <div className="mx-auto max-w-2xl px-5 pb-16">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>Campaigns</h2>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--muted)' }}
            >
              {chainName(readChainId)}
            </span>
          </div>
          {total > 0n && (
            <span className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
              {total.toString()} total
            </span>
          )}
        </div>

        {/* Wrong-chain notice: wallet on a different Arc network */}
        {walletChainMismatch && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm" style={glass.card}>
            <span style={{ color: 'var(--muted)' }}>
              You are connected to {chainName(walletChainId)}. This page reads from {chainName(readChainId)}.
            </span>
            <button
              onClick={() => switchChain({ chainId: readChainId })}
              disabled={isSwitching}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <RefreshCw className="size-3" />
              Switch to {chainName(readChainId)}
            </button>
          </div>
        )}
        {walletChainMismatch && switchError && (
          <div className="mb-4 text-xs" style={{ color: 'var(--danger)' }}>
            {formatWriteError(switchError)}
          </div>
        )}

        {/* Wallet not on Arc at all */}
        {walletOnWrongChain && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-sm" style={glass.card}>
            <span style={{ color: 'var(--muted)' }}>Connect to Arc Testnet or Arc Mainnet to interact with campaigns.</span>
          </div>
        )}

        {!deployed && (
          <div className="rounded-2xl p-5 text-center text-sm" style={glass.card}>
            <span style={{ color: 'var(--muted)' }}>Not deployed on this network yet.</span>
          </div>
        )}

        {deployed && isLoading && (
          <div className="flex flex-col gap-3">
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              Loading from {chainName(readChainId)}...
            </div>
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-28 animate-pulse rounded-2xl" style={{ background: 'var(--surface-muted)' }} />
            ))}
          </div>
        )}

        {deployed && !isLoading && isCountError && (
          <div className="rounded-2xl p-5 text-center text-sm" style={glass.card}>
            <p className="mb-1 font-semibold" style={{ color: 'var(--danger)' }}>
              Could not reach {chainName(readChainId)}.
            </p>
            <p style={{ color: 'var(--muted)' }}>Retrying...</p>
          </div>
        )}

        {deployed && !isLoading && !isCountError && total === 0n && (
          <div className="rounded-2xl p-8 text-center" style={glass.card}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No campaigns yet. Be the first.</p>
            <Link to="/new" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>
              Create one <ArrowRight className="size-3" />
            </Link>
          </div>
        )}

        {deployed && sorted.length > 0 && (
          <div className="flex flex-col gap-3">
            {sorted.map((c) => (
              <CampaignCard key={c.id.toString()} campaign={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
