import { TaskStatus } from '@/lib/types'
import { AlertTriangle, Check, Circle, XCircle, Zap } from 'lucide-react'

const STATUS_CONFIG: Record<TaskStatus, { icon: React.ReactNode; color: string; label: string; pulse?: boolean }> = {
  ASSIGNED: {
    icon: <Circle size={10} />,
    color: 'var(--muted)',
    label: 'ASSIGNED',
  },
  IN_EDIT: {
    icon: <Zap size={10} />,
    color: 'var(--blue)',
    label: 'IN EDIT',
    pulse: true,
  },
  DONE: {
    icon: <AlertTriangle size={10} />,
    color: 'var(--accent)',
    label: 'APPROVAL',
  },
  APPROVED: {
    icon: <Check size={10} />,
    color: 'var(--green)',
    label: 'APPROVED',
  },
  REJECTED: {
    icon: <XCircle size={10} />,
    color: 'var(--red)',
    label: 'REJECTED',
  },
}

export default function StatusBadge({ status }: { status: TaskStatus }) {
  // Fallback covers any stale status value (e.g. a cached NOTICED task pre-migration 031).
  const { icon, color, label, pulse } = STATUS_CONFIG[status] || STATUS_CONFIG.IN_EDIT
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full px-2 text-[10px] font-extrabold uppercase tracking-[.055em] ${pulse ? 'pulse-blue' : ''}`}
      style={{ color, border: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      {icon}
      {label}
    </span>
  )
}
