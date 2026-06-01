import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../supabaseClient'
import { format, isPast, parseISO } from 'date-fns'

const PRIORITY_STYLES = {
  high:   'bg-red-900/40 text-red-400 border border-red-800/50',
  medium: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800/50',
  low:    'bg-green-900/40 text-green-400 border border-green-800/50',
}

export default function TaskCard({ task, onRefresh, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.3 : 1,
  }

  const handleDelete = async (e) => {
    e.stopPropagation()
    await supabase.from('tasks').delete().eq('id', task.id)
    onRefresh?.()
  }

  const isOverdue = task.deadline && isPast(parseISO(task.deadline)) && task.status !== 'done'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-sidebar border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none
        ${isDragging ? 'shadow-2xl scale-105 rotate-1' : 'hover:border-gray-600'}
        transition-all`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-200 text-sm leading-snug flex-1">{task.title}</p>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={handleDelete}
          className="text-gray-600 hover:text-red-400 transition text-lg leading-none flex-shrink-0 mt-0.5"
        >
          ×
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {task.priority && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority] || ''}`}>
            {task.priority}
          </span>
        )}
        {task.assigned_to && (
          <span className="text-xs bg-purple-900/40 text-purple-400 border border-purple-800/50 px-2 py-0.5 rounded-full">
            {task.assigned_to}
          </span>
        )}
        {task.deadline && (
          <span className={`text-xs px-2 py-0.5 rounded-full border
            ${isOverdue
              ? 'bg-red-900/40 text-red-400 border-red-800/50 font-semibold'
              : 'bg-sidebar text-gray-500 border-border'}`}>
            {isOverdue ? '⚠ ' : ''}
            {format(parseISO(task.deadline), 'MMM d')}
          </span>
        )}
      </div>
    </div>
  )
}
