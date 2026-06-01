import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { format, isPast, isToday, isTomorrow, parseISO, differenceInDays } from 'date-fns'

export default function Deadlines() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .not('deadline', 'is', null)
        .neq('status', 'done')
        .order('deadline', { ascending: true })
      setTasks(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const getUrgency = (deadline) => {
    const d = parseISO(deadline)
    if (isPast(d)) return { label: 'Overdue', color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/40' }
    if (isToday(d)) return { label: 'Today', color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-800/40' }
    if (isTomorrow(d)) return { label: 'Tomorrow', color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800/40' }
    const days = differenceInDays(d, new Date())
    if (days <= 7) return { label: `${days}d left`, color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-800/40' }
    return { label: `${days}d left`, color: 'text-gray-400', bg: 'bg-card border-border' }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-border">
        <h2 className="text-white font-semibold text-lg">Deadlines</h2>
        <p className="text-gray-500 text-xs mt-0.5">{tasks.length} upcoming tasks</p>
      </div>

      <div className="flex-1 px-8 py-6 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600">
            <p className="text-lg">🎉</p>
            <p className="mt-2 text-sm">No upcoming deadlines</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {tasks.map(task => {
              const urgency = getUrgency(task.deadline)
              return (
                <div key={task.id} className={`flex items-center justify-between rounded-xl border p-4 ${urgency.bg}`}>
                  <div className="flex-1">
                    <p className="text-white font-medium text-sm">{task.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      {task.assigned_to && (
                        <span className="text-xs text-gray-500">{task.assigned_to}</span>
                      )}
                      <span className="text-xs text-gray-600 capitalize">{task.status.replace('inprogress', 'in progress')}</span>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <p className={`text-sm font-semibold ${urgency.color}`}>{urgency.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{format(parseISO(task.deadline), 'MMM d, yyyy')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
