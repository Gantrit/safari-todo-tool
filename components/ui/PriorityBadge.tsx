import { Priority } from '@/lib/types'

const PRIORITY_STYLES: Record<Priority, { color: string; background: string; label: string }> = {
  LOW: { color: 'var(--green)', background: 'var(--green-dim)', label: 'Low' },
  MEDIUM: { color: 'var(--amber)', background: 'var(--amber-dim)', label: 'Medium' },
  HIGH: { color: 'var(--red)', background: 'var(--red-dim)', label: 'High' },
}

export default function PriorityBadge({ priority }: { priority: Priority }) {
  const { color, background, label } = PRIORITY_STYLES[priority]
  return (
    <span
      className="inline-flex min-h-6 items-center rounded-full px-2 text-[10px] font-extrabold uppercase tracking-[.06em]"
      style={{ color, background, border: '1px solid transparent' }}
    >
      {label}
    </span>
  )
}
