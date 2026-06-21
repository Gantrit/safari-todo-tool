'use client'

import { useState } from 'react'
import { Task, getTaskDeadline } from '@/lib/types'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import PriorityBadge from '../ui/PriorityBadge'

export default function CalendarView({ tasks }: { tasks: Task[] }) {
  const [current, setCurrent] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(new Date())
  const monthStart = startOfMonth(current)
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(current)) })
  const tasksFor = (day: Date) => tasks.filter((task) => {
    const deadline = getTaskDeadline(task)
    return deadline ? isSameDay(new Date(deadline), day) : false
  })
  const selectedTasks = tasksFor(selectedDay)
  const monthlyCount = tasks.filter((task) => {
    const deadline = getTaskDeadline(task)
    return deadline ? isSameMonth(new Date(deadline), current) : false
  }).length

  return <div className="calendar-layout">
    <section className="app-card min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-6" style={{ borderColor: 'var(--border)' }}>
        <div><h2 className="text-lg font-extrabold tracking-[-.02em]">{format(current, 'MMMM yyyy')}</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{monthlyCount} {monthlyCount === 1 ? 'deadline' : 'deadlines'} this month</p></div>
        <div className="flex items-center gap-2"><button onClick={() => { const today = new Date(); setCurrent(today); setSelectedDay(today) }} className="btn btn-secondary !min-h-9 !px-3">Today</button><button onClick={() => setCurrent(subMonths(current, 1))} className="icon-button" aria-label="Previous month"><ChevronLeft size={16} /></button><button onClick={() => setCurrent(addMonths(current, 1))} className="icon-button" aria-label="Next month"><ChevronRight size={16} /></button></div>
      </div>
      <div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}</div>
      <div className="calendar-grid">{days.map((day) => {
        const dayTasks = tasksFor(day)
        const selected = isSameDay(day, selectedDay)
        return <button key={day.toISOString()} onClick={() => setSelectedDay(day)} className={`calendar-day ${selected ? 'is-selected' : ''} ${!isSameMonth(day, current) ? 'is-outside' : ''}`}>
          <span className={`calendar-date ${isToday(day) ? 'is-today' : ''}`}>{format(day, 'd')}</span>
          <div className="mt-3 space-y-1.5">{dayTasks.slice(0, 3).map((task) => <span key={task.id} className={`calendar-chip priority-${task.priority.toLowerCase()}`}><span className="calendar-chip-dot" />{task.title}</span>)}{dayTasks.length > 3 && <span className="block px-1 text-[10px] font-semibold" style={{ color: 'var(--muted)' }}>+{dayTasks.length - 3} more</span>}</div>
        </button>
      })}</div>
    </section>

    <aside className="app-card calendar-agenda">
      <div className="card-header"><div><p className="page-eyebrow !mb-1">Selected day</p><h2 className="font-extrabold">{format(selectedDay, 'EEEE, MMM d')}</h2></div><span className="flex h-9 w-9 items-center justify-center rounded-[9px]" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}><CalendarDays size={17} /></span></div>
      <div className="p-4 sm:p-5">{selectedTasks.length ? <div className="space-y-3">{selectedTasks.map((task) => {
        const deadline = getTaskDeadline(task)!
        return <article key={task.id} className="rounded-[10px] border p-4" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}><div className="mb-3 flex items-start justify-between gap-3"><h3 className="text-sm font-bold leading-5">{task.title}</h3><PriorityBadge priority={task.priority} /></div>{task.description && <p className="mb-3 line-clamp-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>{task.description}</p>}<div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--muted)' }}><span>{task.assigned_profile?.full_name?.split(' ')[0] || 'Unassigned'}</span><span>{format(new Date(deadline), 'HH:mm')}</span></div></article>
      })}</div> : <div className="flex min-h-[220px] items-center justify-center text-center"><div><CalendarDays className="mx-auto mb-3" size={24} style={{ color: 'var(--muted)' }} /><p className="text-sm font-semibold">No deadlines</p><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>This day is clear.</p></div></div>}</div>
    </aside>
  </div>
}
