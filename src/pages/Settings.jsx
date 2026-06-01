import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Settings({ session }) {
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setError(error.message)
    else { setMessage('Password updated!'); setNewPassword('') }
    setLoading(false)
  }

  const inputClass = "w-full bg-sidebar border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent"

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-border">
        <h2 className="text-white font-semibold text-lg">Settings</h2>
        <p className="text-gray-500 text-xs mt-0.5">Manage your workspace</p>
      </div>

      <div className="flex-1 px-8 py-6 overflow-y-auto max-w-xl space-y-6">

        {/* Account info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-white font-medium text-sm mb-4">Account</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <p className="text-sm text-gray-300">{session?.user?.email}</p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">User ID</label>
              <p className="text-xs text-gray-600 font-mono">{session?.user?.id}</p>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-white font-medium text-sm mb-4">Change Password</h3>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            {message && <p className="text-green-400 text-xs">{message}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-accent hover:bg-accent-hover text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* App info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-white font-medium text-sm mb-3">About</h3>
          <div className="space-y-2 text-xs text-gray-500">
            <div className="flex justify-between"><span>App</span><span className="text-gray-400">Team Todo Tool</span></div>
            <div className="flex justify-between"><span>Version</span><span className="text-gray-400">1.0.0</span></div>
            <div className="flex justify-between"><span>Stack</span><span className="text-gray-400">React + Supabase + Vercel</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
