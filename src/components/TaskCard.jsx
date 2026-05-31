import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../supabaseClient'
import { format, isPast, parseISO } from 'date-fns'

const PRIORITY_STYLES = {
  high:   'bg-red-100 text-red-600',
  medium: 'bg-yellow-100 text-yellow-600',
  low:    'bg-green-100 text-green-600',
}

export default function TaskCard({ task, onRefresh, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } =
    useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
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
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-3 cursor-grab active:cursor-grabbing select-none
        ${isDragging ? 'shadow-xl rotate-1 scale-105' : 'hover:shadow-md'}
        transition-shadow`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-800 text-sm leading-snug flex-1">{task.title}</p>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={handleDelete}
          className="text-gray-300 hover:text-red-400 transition text-lg leading-none flex-shrink-0"
        >
          ×
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {task.priority && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[task.priority] || ''}`}>
            {task.priority}
          </span>
        )}
        {task.assigned_to && (
          <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">
            {task.assigned_to}
          </span>
        )}
        {task.deadline && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${isOverdue ? 'bg-red-50 text-red-500 font-semibold' : 'bg-gray-50 text-gray-400'}`}>
            {isOverdue ? '⚠ ' : '📅 '}
            {format(parseISO(task.deadline), 'MMM d')}
          </span>
        )}
      </div>
    </div>
  )
}
