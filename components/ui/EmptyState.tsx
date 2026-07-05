import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  text?: string
  tone?: 'accent' | 'muted' | 'danger'
  action?: ReactNode
}

const ICON_TONE = {
  accent: '',
  muted: 'is-muted',
  danger: 'is-danger',
} as const

export default function EmptyState({ icon, title, text, tone = 'accent', action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className={`empty-state-icon ${ICON_TONE[tone]}`}>{icon}</div>
      <div>
        <h3 className="empty-state-title">{title}</h3>
        {text && <p className="empty-state-text mx-auto mt-1.5">{text}</p>}
      </div>
      {action}
    </div>
  )
}
