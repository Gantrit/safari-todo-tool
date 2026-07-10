'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

// Custom month-by-month date picker (the native <input type="date"> only offers
// the browser's own popup). Submits as a hidden yyyy-mm-dd input so it drops
// into any plain <form> unchanged.

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DateField({ name, defaultValue, required }: { name: string; defaultValue?: string; required?: boolean }) {
  const [value, setValue] = useState(defaultValue || toIso(new Date()))
  const [open, setOpen] = useState(false)
  const selected = new Date(`${value}T00:00:00`)
  const [viewYear, setViewYear] = useState(selected.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected.getMonth())
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7 // Monday-first grid
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const todayIso = toIso(new Date())

  const moveMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const pick = (day: number) => {
    setValue(toIso(new Date(viewYear, viewMonth, day)))
    setOpen(false)
  }

  const label = selected.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="relative" ref={wrapRef}>
      <input type="hidden" name={name} value={value} required={required} />
      <button
        type="button"
        onClick={() => { setViewYear(selected.getFullYear()); setViewMonth(selected.getMonth()); setOpen((o) => !o) }}
        className="form-control flex w-full items-center justify-between gap-2 text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span>{label}</span>
        <CalendarDays size={15} className="flex-none" style={{ color: 'var(--accent)' }} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 sm:absolute sm:inset-auto sm:left-0 sm:top-[calc(100%+6px)]"
          style={{ background: 'transparent' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
        <div
          className="absolute left-1/2 top-1/2 w-[276px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border p-3 sm:left-0 sm:top-0 sm:translate-x-0 sm:translate-y-0"
          style={{ background: 'var(--surface2)', borderColor: 'var(--border-strong)', boxShadow: 'var(--shadow-lg, var(--shadow-md))' }}
          role="dialog"
          aria-label="Choose a date"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => moveMonth(-1)} className="icon-button !h-8 !w-8" aria-label="Previous month"><ChevronLeft size={15} /></button>
            <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{monthLabel}</span>
            <button type="button" onClick={() => moveMonth(1)} className="icon-button !h-8 !w-8" aria-label="Next month"><ChevronRight size={15} /></button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1 text-center text-[10px] font-bold uppercase" style={{ color: 'var(--muted)' }}>{d}</span>
            ))}
            {Array.from({ length: startOffset }).map((_, i) => <span key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const iso = toIso(new Date(viewYear, viewMonth, day))
              const isSelected = iso === value
              const isToday = iso === todayIso
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  className="flex h-8 items-center justify-center rounded-[7px] text-[12.5px] font-semibold transition-colors hover:bg-white/5"
                  style={isSelected
                    ? { background: 'var(--accent)', color: '#0b0d09' }
                    : isToday
                      ? { border: '1px solid var(--accent)', color: 'var(--accent)' }
                      : { color: 'var(--text-secondary)' }}
                  aria-pressed={isSelected}
                >
                  {day}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => { setValue(todayIso); setOpen(false) }}
            className="mt-2 w-full rounded-[8px] py-1.5 text-[12px] font-bold"
            style={{ background: 'var(--surface3)', color: 'var(--text-secondary)' }}
          >
            Today
          </button>
        </div>
        </div>
      )}
    </div>
  )
}
