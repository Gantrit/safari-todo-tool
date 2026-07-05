import type { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  radius?: string | number
  style?: CSSProperties
}

export default function Skeleton({ className = '', width, height, radius, style }: SkeletonProps) {
  return (
    <span
      className={`skeleton block ${className}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden
    />
  )
}
