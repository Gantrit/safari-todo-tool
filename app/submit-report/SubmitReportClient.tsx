'use client'

import { useState } from 'react'
import { FilePlus2, FolderClock } from 'lucide-react'
import ShiftReportForm from './ShiftReportForm'
import MyReportsPanel from './MyReportsPanel'

interface Option {
  id: string
  name: string
}

type Tab = 'new' | 'mine'

// Public submit page shell: chatters either file a new report or pull up the
// ones they already submitted (to correct a rejected one without the edit link).
export default function SubmitReportClient({
  creators,
  members,
}: {
  creators: Option[]
  members: Option[]
}) {
  const [tab, setTab] = useState<Tab>('new')

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1.5 rounded-[12px] border p-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <TabButton active={tab === 'new'} onClick={() => setTab('new')} icon={<FilePlus2 size={15} />} label="New report" />
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} icon={<FolderClock size={15} />} label="My reports" />
      </div>

      {tab === 'new' ? (
        <ShiftReportForm creators={creators} members={members} />
      ) : (
        <MyReportsPanel creators={creators} members={members} />
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-10 items-center justify-center gap-2 rounded-[9px] text-[13px] font-bold transition-colors"
      style={active
        ? { background: 'var(--accent)', color: '#0b0d09' }
        : { background: 'transparent', color: 'var(--muted)' }}
    >
      {icon} {label}
    </button>
  )
}
