interface Props {
  status: number // 0 Active, 1 Succeeded, 2 Failed
}

const LABELS = ['Active', 'Succeeded', 'Failed']
const COLORS = [
  { bg: 'rgba(26,128,71,0.10)', color: '#1a8047' },
  { bg: 'rgba(26,128,71,0.10)', color: '#1a8047' },
  { bg: 'rgba(186,43,76,0.10)', color: '#ba2b4c' },
]

export function StatusBadge({ status }: Props) {
  const s = COLORS[status] ?? COLORS[0]
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {LABELS[status] ?? 'Unknown'}
    </span>
  )
}
