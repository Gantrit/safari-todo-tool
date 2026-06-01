import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Users({ session }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('tasks').select('*')
      setTasks(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  // Group tasks by assigned_to
  const memberMap = {}
  tasks.forEach(task => {
    const name = task.assigned_to || 'Unassigned'
    if (!memberMap[name]) memberMap[name] = { todo: 0, inprogress: 0, done: 0 }
    memberMap[name][task.status] = (memberMap[name][task.status] || 0) + 1
  })

  const members = Object.entries(memberMap)

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-border">
        <h2 className="text-white font-semibold text-lg">Users & Team</h2>
        <p className="text-gray-500 text-xs mt-0.5">{members.length} members with tasks</p>
      </div>

      <div className="flex-1 px-8 py-6 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-4xl">
            {members.map(([name, counts]) => {
              const total = (counts.todo || 0) + (counts.inprogress || 0) + (counts.done || 0)
              const donePercent = total > 0 ? Math.round((counts.done / total) * 100) : 0
              const initials = name === 'Unassigned' ? '?' : name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

              return (
                <div key={name} className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{name}</p>
                      <p className="text-gray-500 text-xs">{total} task{total !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs mb-4">
                    <div className="flex justify-between text-gray-500">
                      <span>To Do</span><span className="text-gray-400">{counts.todo || 0}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>In Progress</span><span className="text-blue-400">{counts.inprogress || 0}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Done</span><span className="text-green-400">{counts.done || 0}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-sidebar rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${donePercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{donePercent}% complete</p>
                </div>
              )
            })}

            {members.length === 0 && (
              <div className="col-span-3 flex items-center justify-center h-40 text-gray-600 text-sm">
                No tasks assigned yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
