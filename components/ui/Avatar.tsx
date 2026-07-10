'use client'

import { getInitials } from '@/lib/utils'

// Profile picture with initials fallback. Size + colors mirror the previous
// initials-only chips so it drops into the sidebar, lanes, and leaderboard.
export default function Avatar({
  name,
  src,
  size = 40,
  accent = false,
  className = '',
  style,
}: {
  name: string
  src?: string | null
  size?: number
  /** Gold treatment for "this is you" spots. Ignored when a photo exists. */
  accent?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const base: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(9, Math.round(size * 0.32)),
    ...style,
  }

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`flex-none rounded-full object-cover ${className}`}
        style={{ ...base, border: '1px solid var(--border-strong)' }}
      />
    )
  }

  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full font-extrabold ${className}`}
      style={{
        ...base,
        background: accent ? 'var(--accent)' : 'var(--accent-dim)',
        color: accent ? '#0b0d09' : 'var(--accent)',
        border: '1px solid var(--border-strong)',
      }}
    >
      {getInitials(name)}
    </span>
  )
}
