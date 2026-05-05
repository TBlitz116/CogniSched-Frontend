import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { clearAuth, getStoredRole, getRolePath } from '../lib/auth'

interface Person {
  id: number
  name: string
  email: string
  student_count?: number
}

interface AccountData {
  id: number
  name: string
  email: string
  role: string
  timezone: string
  has_google_calendar: boolean
  tas?: Person[]
  professor?: Person
  students?: Person[]
  ta?: Person
}

const ROLE_LABEL: Record<string, string> = {
  PROFESSOR: 'Professor',
  TA: 'Teaching Assistant',
  STUDENT: 'Student',
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const [account, setAccount] = useState<AccountData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/users/me/account')
      .then(r => setAccount(r.data))
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false))
  }, [navigate])

  function goBack() {
    const role = getStoredRole()
    if (role) navigate(getRolePath(role))
    else navigate('/login')
  }

  function logout() {
    clearAuth()
    navigate('/login')
  }

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete('/users/me')
      clearAuth()
      navigate('/login')
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error || 'Failed to delete account. Please try again.')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    )
  }

  if (!account) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={goBack}
            className="text-sm text-gray-500 hover:text-gray-800 transition"
          >
            &larr; Back to Dashboard
          </button>
          <h1 className="text-lg font-semibold text-gray-900">My Account</h1>
        </div>
        <button onClick={logout} className="text-sm text-blue-600 hover:text-blue-800 transition">
          Sign out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">
        {/* Profile Card */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Profile</h2>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-lg">
              {account.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">{account.name}</p>
              <p className="text-sm text-gray-500">{account.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">Role</p>
              <p className="text-gray-800 font-medium">{ROLE_LABEL[account.role] || account.role}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">Timezone</p>
              <p className="text-gray-800 font-medium">{account.timezone || 'UTC'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide">Google Calendar</p>
              <p className={`font-medium ${account.has_google_calendar ? 'text-green-600' : 'text-red-500'}`}>
                {account.has_google_calendar ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
        </section>

        {/* Professor: My TAs */}
        {account.role === 'PROFESSOR' && account.tas && (
          <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              My TAs ({account.tas.length})
            </h2>
            {account.tas.length === 0 ? (
              <p className="text-sm text-gray-400">No TAs assigned yet. Use "Invite TA" from the dashboard.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {account.tas.map(ta => (
                  <div key={ta.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{ta.name}</p>
                      <p className="text-xs text-gray-500">{ta.email}</p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {ta.student_count} student{ta.student_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TA: My Professor + My Students */}
        {account.role === 'TA' && (
          <>
            {account.professor && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">My Professor</h2>
                <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                    {account.professor.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{account.professor.name}</p>
                    <p className="text-xs text-gray-500">{account.professor.email}</p>
                  </div>
                </div>
              </section>
            )}

            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                My Students ({account.students?.length || 0})
              </h2>
              {(!account.students || account.students.length === 0) ? (
                <p className="text-sm text-gray-400">No students assigned yet. Use "Invite Student" from the dashboard.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {account.students.map(s => (
                    <div key={s.id} className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-500">{s.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* Student: My TA + My Professor */}
        {account.role === 'STUDENT' && (
          <>
            {account.ta && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">My TA</h2>
                <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                    {account.ta.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{account.ta.name}</p>
                    <p className="text-xs text-gray-500">{account.ta.email}</p>
                  </div>
                </div>
              </section>
            )}

            {account.professor && (
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">My Professor</h2>
                <div className="flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                    {account.professor.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{account.professor.name}</p>
                    <p className="text-xs text-gray-500">{account.professor.email}</p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        {/* Danger Zone */}
        <section className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-2">Danger Zone</h2>
          <p className="text-sm text-gray-500 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition"
          >
            Delete Account
          </button>
        </section>
      </main>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete account?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete your account ({account.email}) and all associated data. This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 mb-3">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
                disabled={deleting}
                className="text-sm px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
