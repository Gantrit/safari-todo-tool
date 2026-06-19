'use client'

interface XPBarProps {
  progress: number
  nextLevel?: string
}

export default function XPBar({ progress, nextLevel }: XPBarProps) {
  return (
    <div>
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--surface2)' }}
      >
        <div
          className="h-full rounded-full xp-bar-fill transition-all"
          style={{ width: `${Math.min(progress, 100)}%`, background: 'var(--accent)' }}
        />
      </div>
      {nextLevel && (
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Next: {nextLevel}
        </p>
      )}
    </div>
  )
}
