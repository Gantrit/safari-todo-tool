'use client'

import { useEffect } from 'react'
import ErrorState from '@/components/ui/ErrorState'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="page-shell">
      <div className="app-card">
        <ErrorState
          title="This page hit a snag"
          text="An unexpected error occurred while loading your workspace. You can retry, and if it keeps happening let an admin know."
          onRetry={reset}
        />
      </div>
    </div>
  )
}
