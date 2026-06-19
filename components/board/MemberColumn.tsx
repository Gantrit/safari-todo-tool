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
      className="flex-shrink-0 flex flex-col rounded-[10px] overflow-hidden"
      style={{ width: '280px', background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
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
          className="p-1 rounded transition-opacity hover:opacity-70"
          style={{ color: 'var(--muted)' }}
          title="Add task"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Task sections */}
      <div className="flex-1 overflow-y-auto p-3">
        {SECTIONS.map((section) => (
          <TaskSectionComp
            key={section}
            section={section}
            tasks={tasks.filter((t) => t.section === section)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </div>
  )
}
