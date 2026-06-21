'use client'

import { Task, TaskSection, Profile } from '@/lib/types'
import { getInitials } from '@/lib/utils'
import TaskSectionComp from './TaskSection'
import { Plus } from 'lucide-react'

const SECTIONS: TaskSection[] = ['IMMINENT', 'DAILY', 'WEEKLY', 'MONTHLY']

interface MemberColumnProps {
  member: Profile
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAddTask: (memberId: string, section: TaskSection) => void
  currentUserId: string
}

export default function MemberColumn({ member, tasks, onTaskClick, onAddTask, currentUserId }: MemberColumnProps) {
  const isOwn = member.id === currentUserId

  return (
    <div
      className="flex min-w-0 max-h-full flex-col overflow-hidden rounded-[14px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Column header */}
      <div
        className="flex min-h-[78px] flex-shrink-0 items-center gap-3 border-b px-5"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
          style={{ background: isOwn ? 'var(--accent)' : 'var(--surface2)', color: isOwn ? '#0e0e0e' : 'var(--text)' }}
        >
          {getInitials(member.full_name || member.email)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {member.full_name?.split(' ')[0] || 'User'}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
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
      <div className="flex-1 overflow-y-auto p-4">
        {SECTIONS.map((section) => (
          <TaskSectionComp
            key={section}
            section={section}
            tasks={tasks.filter((t) => t.section === section)}
            onTaskClick={onTaskClick}
            onAddTask={() => onAddTask(member.id, section)}
            memberId={member.id}
          />
        ))}
      </div>
    </div>
  )
}
