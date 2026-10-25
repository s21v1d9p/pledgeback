import { Link } from 'react-router-dom'
import { StatusBadge } from './StatusBadge'
import { formatNativeUsdc, formatCountdown, formatGuaranteeBps, progressPct } from '@/lib/format'

interface CampaignView {
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

interface Props {
  campaign: CampaignView
}

export function CampaignCard({ campaign }: Props) {
  const pct = progressPct(campaign.pledged, campaign.goal)

  return (
    <Link
      to={`/c/${campaign.id}`}
      className="block rounded-2xl p-5 transition-transform hover:scale-[1.01] active:scale-[0.99] no-underline"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="display text-base font-semibold leading-snug" style={{ color: 'var(--ink)' }}>
          {campaign.title}
        </h3>
        <StatusBadge status={campaign.status} />
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : 'var(--accent)' }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: 'var(--muted)' }}>
        <div>
          <div className="tabular-nums font-semibold" style={{ color: 'var(--ink-2)' }}>
            {formatNativeUsdc(campaign.pledged)} <span style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          <div>of {formatNativeUsdc(campaign.goal)} goal</div>
        </div>
        <div className="text-center">
          <div className="tabular-nums font-semibold" style={{ color: 'var(--ink-2)' }}>
            {formatGuaranteeBps(campaign.guaranteeBps)}
          </div>
          <div>guaranteed</div>
        </div>
        <div className="text-right">
          <div className="font-semibold" style={{ color: 'var(--ink-2)' }}>
            {formatCountdown(Number(campaign.deadline))}
          </div>
          <div>{Number(campaign.backerCount)} backers</div>
        </div>
      </div>
    </Link>
  )
}
