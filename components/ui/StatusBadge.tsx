import { TaskStatus } from '@/lib/types'
import { AlertTriangle, Check, Circle, Eye, XCircle, Zap } from 'lucide-react'

const STATUS_CONFIG: Record<TaskStatus, { icon: React.ReactNode; color: string; label: string; pulse?: boolean }> = {
  ASSIGNED: {
    icon: <Circle size={10} />,
    color: 'var(--muted)',
    label: 'ASSIGNED',
  },
  NOTICED: {
    icon: <Eye size={10} />,
    color: 'var(--amber)',
    label: 'NOTICED',
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
  const { icon, color, label, pulse } = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-semibold ${pulse ? 'pulse-blue' : ''}`}
      style={{ color, border: `1px solid ${color}`, background: 'rgba(255,255,255,0.02)' }}
    >
      {icon}
      {label}
    </span>
  )
}
