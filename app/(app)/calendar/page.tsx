import { createClient } from '@/lib/supabase/server'
import CalendarView from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(*)')
    .is('deleted_at', null)
    .neq('status', 'APPROVED')
    .order('deadline_at', { ascending: true })

  return (
    <div className="h-full overflow-auto">
      <div className="page-shell">
        <header className="page-header"><div><p className="page-eyebrow">Schedule overview</p><h1 className="page-title">Calendar</h1><p className="page-description">See deadlines across the team and focus on one day at a time.</p></div></header>
        <CalendarView tasks={tasks || []} />
      </div>
    </div>
  )
}
