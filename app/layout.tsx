import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Safari To-Dos',
  description: 'Team project management tool',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}
