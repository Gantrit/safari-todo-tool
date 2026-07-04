'use client'

// Gamification engine: synthesized sounds (Web Audio API — no audio files)
// and DOM-based celebration effects (confetti, XP toasts, level-up overlay).
// Everything degrades silently when the browser blocks audio before a user gesture.

type SoundName = 'accept' | 'done' | 'approve' | 'reject' | 'levelUp' | 'xp' | 'click'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(
  ac: AudioContext,
  { freq, start = 0, duration = 0.18, type = 'sine', gain = 0.16, glideTo }:
  { freq: number; start?: number; duration?: number; type?: OscillatorType; gain?: number; glideTo?: number }
) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  const t0 = ac.currentTime + start
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

export function playSound(name: SoundName) {
  const ac = audio()
  if (!ac) return
  switch (name) {
    case 'click': // subtle tactile tick for buttons
      tone(ac, { freq: 660, duration: 0.05, type: 'triangle', gain: 0.05 })
      break
    case 'accept': // rising two-note "let's go"
      tone(ac, { freq: 440, duration: 0.12, type: 'triangle' })
      tone(ac, { freq: 660, start: 0.1, duration: 0.16, type: 'triangle' })
      break
    case 'done': // soft satisfying pop
      tone(ac, { freq: 520, duration: 0.1, type: 'sine', glideTo: 780 })
      tone(ac, { freq: 1040, start: 0.08, duration: 0.12, type: 'sine', gain: 0.1 })
      break
    case 'xp': // coin sparkle
      tone(ac, { freq: 987, duration: 0.09, type: 'square', gain: 0.06 })
      tone(ac, { freq: 1318, start: 0.07, duration: 0.14, type: 'square', gain: 0.06 })
      break
    case 'approve': // golden chime arpeggio (C-E-G-C)
      tone(ac, { freq: 523, duration: 0.22, type: 'triangle' })
      tone(ac, { freq: 659, start: 0.09, duration: 0.22, type: 'triangle' })
      tone(ac, { freq: 784, start: 0.18, duration: 0.24, type: 'triangle' })
      tone(ac, { freq: 1046, start: 0.27, duration: 0.4, type: 'triangle', gain: 0.18 })
      break
    case 'levelUp': // full fanfare
      tone(ac, { freq: 392, duration: 0.16, type: 'sawtooth', gain: 0.08 })
      tone(ac, { freq: 523, start: 0.14, duration: 0.16, type: 'sawtooth', gain: 0.08 })
      tone(ac, { freq: 659, start: 0.28, duration: 0.16, type: 'sawtooth', gain: 0.08 })
      tone(ac, { freq: 784, start: 0.42, duration: 0.5, type: 'sawtooth', gain: 0.1 })
      tone(ac, { freq: 1046, start: 0.42, duration: 0.5, type: 'triangle', gain: 0.12 })
      break
    case 'reject': // gentle descending "not quite"
      tone(ac, { freq: 330, duration: 0.16, type: 'sine' })
      tone(ac, { freq: 247, start: 0.13, duration: 0.24, type: 'sine' })
      break
  }
}

// ---------------------------------------------------------------------------
// Visual effects
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ['#C8A96A', '#D7BC82', '#22C55E', '#38BDF8', '#F4F7F5', '#A78BFA']

export function confettiBurst(opts: { count?: number; origin?: { x: number; y: number } } = {}) {
  if (typeof document === 'undefined') return
  const { count = 90, origin } = opts
  const root = document.createElement('div')
  root.className = 'fx-confetti-root'
  document.body.appendChild(root)
  const ox = origin?.x ?? window.innerWidth / 2
  const oy = origin?.y ?? window.innerHeight * 0.38

  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    p.className = 'fx-confetti'
    const angle = Math.random() * Math.PI * 2
    const velocity = 140 + Math.random() * 340
    const dx = Math.cos(angle) * velocity
    const dy = Math.sin(angle) * velocity - 180
    const size = 5 + Math.random() * 7
    p.style.left = `${ox}px`
    p.style.top = `${oy}px`
    p.style.width = `${size}px`
    p.style.height = `${size * (Math.random() > 0.5 ? 0.45 : 1)}px`
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    p.style.setProperty('--dx', `${dx}px`)
    p.style.setProperty('--dy', `${dy}px`)
    p.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`)
    p.style.animationDelay = `${Math.random() * 0.12}s`
    root.appendChild(p)
  }
  window.setTimeout(() => root.remove(), 1800)
}

export function xpToast(amount: number, label = 'XP') {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.className = `fx-xp-toast ${amount < 0 ? 'is-negative' : ''}`
  el.textContent = `${amount >= 0 ? '+' : ''}${amount} ${label}`
  document.body.appendChild(el)
  window.setTimeout(() => el.remove(), 2200)
}

export function levelUpOverlay(level: number, rank: string) {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.className = 'fx-levelup'
  el.innerHTML = `
    <div class="fx-levelup-card">
      <div class="fx-levelup-glow"></div>
      <p class="fx-levelup-eyebrow">Level up!</p>
      <p class="fx-levelup-level">Level ${level}</p>
      <p class="fx-levelup-rank">${rank}</p>
    </div>`
  document.body.appendChild(el)
  el.addEventListener('click', () => el.remove())
  window.setTimeout(() => el.remove(), 3200)
}

// High-level celebration presets ---------------------------------------------

export function celebrateQuestAccepted() {
  playSound('accept')
}

export function celebrateTaskDone() {
  playSound('done')
}

export function celebrateApproval(xp?: number) {
  playSound('approve')
  confettiBurst()
  if (typeof xp === 'number' && xp !== 0) {
    window.setTimeout(() => {
      playSound('xp')
      xpToast(xp)
    }, 450)
  }
}

export function celebrateQuestApproved(bonusXp: number) {
  playSound('approve')
  confettiBurst({ count: 130 })
  window.setTimeout(() => {
    playSound('xp')
    xpToast(bonusXp, 'Bonus XP')
  }, 450)
}

export function celebrateLevelUp(level: number, rank: string) {
  playSound('levelUp')
  confettiBurst({ count: 160 })
  levelUpOverlay(level, rank)
}

export function feedbackReject() {
  playSound('reject')
}
