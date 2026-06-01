import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'

const COLUMN_ACCENT = {
  todo: 'border-t-gray-500',
  inprogress: 'border-t-blue-500',
  done: 'border-t-green-500',
}

const COLUMN_DOT = {
  todo: 'bg-gray-500',
  inprogress: 'bg-blue-500',
  done: 'bg-green-500',
}

export default function Column({ column, tasks, onRefresh }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex flex-col rounded-xl bg-card border border-border border-t-2 ${COLUMN_ACCENT[column.id]}
        ${isOver ? 'ring-1 ring-accent' : ''} transition`}
    >
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${COLUMN_DOT[column.id]}`} />
          <h2 className="font-medium text-gray-200 text-sm">{column.label}</h2>
        </div>
        <span className="text-xs bg-sidebar text-gray-500 px-2 py-0.5 rounded-full border border-border">
          {tasks.length}
        </span>
      </div>

      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 p-3 min-h-[200px]">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onRefresh={onRefresh} />
          ))}
          {tasks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-xs pt-10">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
