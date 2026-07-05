'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorStateProps {
  title?: string
  text?: string
  onRetry?: () => void
}

export default function ErrorState({
  title = 'Something went wrong',
  text = 'We could not load this content. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="empty-state" role="alert">
      <div className="empty-state-icon is-danger">
        <AlertTriangle size={22} />
      </div>
      <div>
        <h3 className="empty-state-title">{title}</h3>
        <p className="empty-state-text mx-auto mt-1.5">{text}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary">
          <RotateCcw size={15} /> Try again
        </button>
      )}
    </div>
  )
}
