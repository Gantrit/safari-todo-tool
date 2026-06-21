import { Loader2 } from 'lucide-react'

export default function AppLoading() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm font-semibold" style={{ color: 'var(--muted)' }}>
        <Loader2 className="animate-spin" size={18} style={{ color: 'var(--accent)' }} />
        Loading workspace…
      </div>
    </div>
  )
}
