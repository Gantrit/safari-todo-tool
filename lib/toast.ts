'use client'

// Lightweight DOM-based action toasts (same idiom as the fx-* helpers in
// gamification.ts — no React context/provider needed, callable from anywhere).
// Used to make every mutating action visibly confirm or fail: the user should
// never click a button and wonder whether anything happened.

type ToastKind = 'success' | 'error' | 'info'

let stack: HTMLDivElement | null = null

function ensureStack(): HTMLDivElement {
  if (stack && document.body.contains(stack)) return stack
  stack = document.createElement('div')
  stack.className = 'fx-toast-stack'
  document.body.appendChild(stack)
  return stack
}

export function showToast(message: string, kind: ToastKind = 'info') {
  if (typeof document === 'undefined') return
  const root = ensureStack()
  const el = document.createElement('div')
  el.className = `fx-toast is-${kind}`
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status')
  el.textContent = message
  root.appendChild(el)
  // Errors linger longer so the message can actually be read.
  const ttl = kind === 'error' ? 6000 : 2800
  window.setTimeout(() => {
    el.classList.add('is-leaving')
    window.setTimeout(() => {
      el.remove()
      if (stack && stack.childElementCount === 0) { stack.remove(); stack = null }
    }, 260)
  }, ttl)
}

export const toastSuccess = (message: string) => showToast(message, 'success')
export const toastError = (message: string) => showToast(message, 'error')
