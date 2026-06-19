import { Priority } from '@/lib/types'

const PRIORITY_STYLES: Record<Priority, { color: string; label: string }> = {
  LOW: { color: 'var(--muted)', label: 'LOW' },
  MEDIUM: { color: 'var(--amber)', label: 'MED' },
  HIGH: { color: 'var(--red)', label: 'HIGH' },
}

export default function PriorityBadge({ priority }: { priority: Priority }) {
  const { color, label } = PRIORITY_STYLES[priority]
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-mono"
      style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}
    >
      {label}
    </span>
  )
}
