'use client'

import { useEffect } from 'react'
import { celebrateLevelUp, playSound, xpToast } from '@/lib/gamification'

// Watches the signed-in user's XP across page loads. When their level increased
// since the last visit (e.g. an admin approved their task), it fires the
// level-up fanfare; when only XP increased, it shows a subtle XP toast.
export default function LevelUpWatcher({ userId, xp, level, rank }: { userId: string; xp: number; level: number; rank: string }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `safari-xp:${userId}`
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const prev = JSON.parse(raw) as { xp: number; level: number }
        if (level > prev.level) {
          // Delay slightly so the page has painted before the fanfare
          window.setTimeout(() => celebrateLevelUp(level, rank), 600)
        } else if (xp > prev.xp) {
          window.setTimeout(() => {
            playSound('xp')
            xpToast(xp - prev.xp)
          }, 600)
        }
      }
      window.localStorage.setItem(key, JSON.stringify({ xp, level }))
    } catch {
      // localStorage unavailable — skip silently
    }
  }, [userId, xp, level, rank])

  return null
}
