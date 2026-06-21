'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`w-full ${SIZE_CLASSES[size]} max-h-[94vh] overflow-hidden rounded-[14px] flex flex-col`}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {title && (
          <div
            className="flex min-h-[66px] flex-shrink-0 items-center justify-between border-b px-5 sm:px-6"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2 className="text-[17px] font-extrabold tracking-[-.02em]" style={{ color: 'var(--text)' }}>
              {title}
            </h2>
            <button onClick={onClose} style={{ color: 'var(--muted)' }} className="icon-button hover:opacity-70 transition-opacity" aria-label="Close modal">
              <X size={17} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
