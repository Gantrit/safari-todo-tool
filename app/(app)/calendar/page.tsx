import { createClient } from '@/lib/supabase/server'
import CalendarView from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*)')
    .not('due_date', 'is', null)
    .neq('status', 'APPROVED')
    .order('due_date', { ascending: true })

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--text)' }}>
          Calendar
        </h1>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <CalendarView tasks={tasks || []} />
      </div>
    </div>
  )
}
