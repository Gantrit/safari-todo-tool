import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'

export default function Column({ column, tasks, onRefresh }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={`w-72 rounded-2xl flex flex-col ${column.color} ${isOver ? 'ring-2 ring-brand-500' : ''} transition`}
    >
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h2 className="font-semibold text-gray-700">{column.label}</h2>
        <span className="text-xs bg-white text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
          {tasks.length}
        </span>
      </div>

      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3 px-3 pb-4 min-h-[200px]">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onRefresh={onRefresh} />
          ))}
          {tasks.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-gray-300 text-sm pt-8">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}
