'use client'

import { useState } from 'react'
import { Task } from '@/lib/types'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import PriorityBadge from '../ui/PriorityBadge'

interface CalendarViewProps {
  tasks: Task[]
}

export default function CalendarView({ tasks }: CalendarViewProps) {
  const [current, setCurrent] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const monthStart = startOfMonth(current)
  const monthEnd = endOfMonth(current)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad start
  const startPad = monthStart.getDay()
  const paddedDays = [...Array(startPad).fill(null), ...days]

  function getTasksForDay(day: Date) {
    return tasks.filter((t) => t.due_date && isSameDay(new Date(t.due_date), day))
  }

  const selectedTasks = selectedDay ? getTasksForDay(selectedDay) : []

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() - 1))}
            className="p-1.5 rounded-[8px] hover:opacity-70 transition-opacity"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="text-lg font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
            {format(current, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrent(new Date(current.getFullYear(), current.getMonth() + 1))}
            className="p-1.5 rounded-[8px] hover:opacity-70 transition-opacity"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs py-1" style={{ color: 'var(--muted)' }}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {paddedDays.map((day, i) => {
            if (!day) return <div key={i} />
            const dayTasks = getTasksForDay(day)
            const isSelected = selectedDay && isSameDay(day, selectedDay)
            const today = isToday(day)

            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className="min-h-[70px] p-1.5 rounded-[8px] text-left transition-all"
                style={{
                  background: isSelected ? 'var(--surface2)' : 'var(--surface)',
                  border: `1px solid ${today ? 'var(--accent)' : isSelected ? 'var(--border)' : 'var(--border)'}`,
                }}
              >
                <p
                  className="text-xs font-medium mb-1"
                  style={{ color: today ? 'var(--accent)' : isSameMonth(day, current) ? 'var(--text)' : 'var(--muted)' }}
                >
                  {format(day, 'd')}
                </p>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 2).map((t) => (
                    <div
                      key={t.id}
                      className="text-xs px-1 py-0.5 rounded truncate"
                      style={{
                        background: t.priority === 'HIGH' ? 'rgba(255,92,92,0.15)' : t.priority === 'MEDIUM' ? 'rgba(240,164,74,0.15)' : 'var(--surface2)',
                        color: t.priority === 'HIGH' ? 'var(--red)' : t.priority === 'MEDIUM' ? 'var(--amber)' : 'var(--muted)',
                      }}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>+{dayTasks.length - 2} more</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day tasks */}
      {selectedDay && (
        <div className="w-64 flex-shrink-0">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            {format(selectedDay, 'MMMM d, yyyy')}
          </h3>
          <div className="space-y-2">
            {selectedTasks.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>No tasks due</p>
            ) : (
              selectedTasks.map((t) => (
                <div
                  key={t.id}
                  className="p-3 rounded-[8px]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <p className="text-sm mb-2" style={{ color: 'var(--text)' }}>{t.title}</p>
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    {t.assigned_profile && (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {t.assigned_profile.full_name?.split(' ')[0]}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
