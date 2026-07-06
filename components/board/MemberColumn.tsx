'use client'

import { Task, TaskSection, Profile } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import TaskSectionComp from './TaskSection'
import { Plus } from 'lucide-react'

const SECTIONS: TaskSection[] = ['DAILY', 'WEEKLY', 'MONTHLY']

interface MemberColumnProps {
  member: Profile
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: (memberId: string, section: TaskSection) => void
  onQuickAdd: (memberId: string, section: TaskSection, title: string) => void
  onDelete: (task: Task) => void
  currentUser: Profile
}

export default function MemberColumn({ member, tasks, onTaskClick, onAddTask, onQuickAdd, onDelete, currentUser }: MemberColumnProps) {
  const isOwn = member.id === currentUser.id

  return (
    <div
      className="member-column flex min-w-0 max-h-full flex-col overflow-hidden rounded-[15px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Column header */}
      <div
        className="flex min-h-[96px] flex-shrink-0 items-center gap-4 border-b px-5 sm:px-6"
        style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}
      >
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
          style={{ background: isOwn ? 'var(--accent)' : 'var(--surface2)', color: isOwn ? '#0e0e0e' : 'var(--text)' }}
        >
          {getInitials(member.full_name || member.email)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-[14px] font-bold" style={{ color: 'var(--text)' }}>
            {member.full_name?.split(' ')[0] || 'User'}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
            {tasks.filter((task) => task.status !== 'APPROVED').length} open tasks
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

      {/* Task sections */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-6">
        {SECTIONS.map((section) => (
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
