import { Link } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { PlusCircle } from 'lucide-react'
import { shortAddr } from '@/lib/format'

export function Navbar() {
  const { address, isConnected } = useAccount()
  const { connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between gap-4 px-5 py-3"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Link to="/" className="flex items-center gap-2 text-lg font-semibold no-underline" style={{ color: 'var(--ink)' }}>
        <span className="display font-bold tracking-tight">Pledgeback</span>
      </Link>

      <div className="flex items-center gap-3">
        <Link
          to="/new"
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
          style={{ color: 'var(--ink-2)', border: '1px solid var(--border)' }}
        >
          <PlusCircle className="size-4" />
          New campaign
        </Link>

        {isConnected && address ? (
          <button
            onClick={() => disconnect()}
            className="rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--ink-2)' }}
            title="Click to disconnect"
          >
            {shortAddr(address)}
          </button>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            disabled={isConnecting}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {isConnecting ? 'Connecting...' : 'Connect wallet'}
          </button>
        )}
      </div>
    </header>
  )
}
