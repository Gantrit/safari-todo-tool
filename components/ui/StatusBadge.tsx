import { TaskStatus } from '@/lib/types'
import { Eye, Zap, Check } from 'lucide-react'

const STATUS_CONFIG: Record<TaskStatus, { icon: React.ReactNode; color: string; label: string; pulse?: boolean }> = {
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
    icon: <span className="font-black text-xs">!</span>,
    color: 'var(--accent)',
    label: 'DONE',
  },
  APPROVED: {
    icon: <Check size={10} />,
    color: 'var(--muted)',
    label: 'APPROVED',
  },
}

export default function StatusBadge({ status }: { status: TaskStatus }) {
  const { icon, color, label, pulse } = STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${pulse ? 'pulse-blue' : ''}`}
      style={{ color, border: `1px solid ${color}` }}
    >
      {icon}
      {label}
    </span>
  )
}
