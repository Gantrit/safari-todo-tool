'use client'

import Link from 'next/link'
import { Task, TaskSection, Profile, QuestTodo } from '@/lib/types'
import { getInitials, getUrgency } from '@/lib/utils'
import TaskSectionComp from './TaskSection'
import { Plus, Sparkles } from 'lucide-react'

const SECTIONS: TaskSection[] = ['DAILY', 'WEEKLY', 'MONTHLY']

interface MemberColumnProps {
  member: Profile
  tasks: Task[]
  questTodos?: QuestTodo[]
  onTaskClick: (task: Task) => void
  onAddTask: (memberId: string, section: TaskSection) => void
  onQuickAdd: (memberId: string, section: TaskSection, title: string) => void
  onDelete: (task: Task) => void
  currentUser: Profile
}

export default function MemberColumn({ member, tasks, questTodos = [], onTaskClick, onAddTask, onQuickAdd, onDelete, currentUser }: MemberColumnProps) {
  const isOwn = member.id === currentUser.id

  return (
    <div
      className="member-column flex min-w-0 max-h-full flex-col overflow-hidden rounded-[15px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Column header */}
      <div
        className="flex min-h-[68px] flex-shrink-0 items-center gap-3 border-b px-4 sm:px-5"
        style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}
      >
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatar_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" style={{ border: '1px solid var(--border-strong)' }} />
        ) : (
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
            style={{ background: isOwn ? 'var(--accent)' : 'var(--surface2)', color: isOwn ? '#0e0e0e' : 'var(--text)' }}
          >
            {getInitials(member.full_name || member.email)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="truncate text-[14px] font-bold" style={{ color: 'var(--text)' }}>
            {member.full_name?.split(' ')[0] || 'User'}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
            {(() => { const n = tasks.filter((task) => task.status !== 'APPROVED').length; return `${n} open ${n === 1 ? 'task' : 'tasks'}` })()}
          </p>
        </div>
        <button
          onClick={() => onAddTask(member.id, 'DAILY')}
          className="icon-button !h-9 !w-9"
          title="Add task"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Task sections — empty WEEKLY/MONTHLY stay hidden until a task of that
          category exists (create one via the Create-task modal); DAILY always
          renders so the column never looks dead and quick-add stays reachable. */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
        {/* Accepted quests as read-only to-dos. Clicking opens the Quests page,
            where the accept/submit/approve flow and XP live. */}
        {questTodos.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-1.5 px-0.5">
              <Sparkles size={12} style={{ color: 'var(--accent)' }} />
              <span className="text-[10px] font-bold uppercase tracking-[.08em]" style={{ color: 'var(--muted)' }}>Quests</span>
              <span className="text-[10px] font-bold" style={{ color: 'var(--muted)' }}>· {questTodos.length}</span>
            </div>
            <div className="space-y-2">
              {questTodos.map((q) => {
                const urgency = getUrgency(q.deadline_at)
                return (
                  <Link
                    key={q.acceptance_id}
                    href="/quests"
                    className="block rounded-[9px] border px-3 py-2.5 transition-colors hover:border-[var(--border-strong)]"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex-none rounded-[5px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        {q.status === 'DONE' ? 'Submitted' : 'Quest'}
                      </span>
                      <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>{q.title}</p>
                    </div>
                    {q.deadline_at && (
                      <p className="mt-1.5 text-[11px] font-semibold" style={{ color: urgency.color }}>
                        Due {urgency.label}
                      </p>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
        {SECTIONS.filter((section) => section === 'DAILY' || tasks.some((t) => t.section === section)).map((section) => (
          <TaskSectionComp
            key={section}
            section={section}
            tasks={tasks.filter((t) => t.section === section)}
            onTaskClick={onTaskClick}
            onAddTask={() => onAddTask(member.id, section)}
            onQuickAdd={onQuickAdd}
            onDelete={onDelete}
            currentUser={currentUser}
            memberId={member.id}
          />
        ))}
      </div>
    </div>
  )
}
