import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const NAV = [
  {
    section: 'WORKSPACE',
    items: [
      { to: '/',          icon: '▦', label: 'Board' },
      { to: '/deadlines', icon: '📅', label: 'Deadlines' },
    ],
  },
  {
    section: 'MANAGE',
    items: [
      { to: '/users',    icon: '👥', label: 'Users & Team' },
      { to: '/settings', icon: '⚙', label: 'Settings' },
    ],
  },
]

export default function Sidebar({ session }) {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-sidebar flex flex-col h-screen border-r border-border">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <h1 className="text-white font-bold text-base tracking-wide">Team Todo</h1>
        <p className="text-gray-500 text-xs mt-0.5">Workspace</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {NAV.map(group => (
          <div key={group.section}>
            <p className="text-gray-600 text-[10px] font-semibold tracking-widest px-2 mb-1">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(item => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
                      ${isActive
                        ? 'bg-sidebar-active text-white font-medium'
                        : 'text-gray-400 hover:bg-sidebar-hover hover:text-gray-200'}`
                    }
                  >
                    <span className="text-base w-4 text-center">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-border">
        <p className="text-gray-400 text-xs truncate mb-2">{session?.user?.email}</p>
        <button
          onClick={handleSignOut}
          className="w-full text-left text-xs text-gray-500 hover:text-red-400 transition px-1"
        >
          Sign Out →
        </button>
      </div>
    </aside>
  )
}
