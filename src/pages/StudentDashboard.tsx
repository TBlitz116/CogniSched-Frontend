import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { clearAuth } from '../lib/auth'
import PriorityBadge from '../components/PriorityBadge'

interface MeetingRequest {
  id: number
  prompt_text: string
  detected_priority: number | null
  detected_topic: string | null
  preferred_time_range: string | null
  status: 'PENDING' | 'SCHEDULED' | 'DECLINED'
  created_at: string
  summary?: string
}


const STATUS_STYLES: Record<string, string> = {
  PENDING:   'bg-yellow-100 text-yellow-700',
  SCHEDULED: 'bg-green-100 text-green-700',
  DECLINED:  'bg-red-100 text-red-700',
}

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [latest, setLatest] = useState<(MeetingRequest & { summary?: string }) | null>(null)
  const [requests, setRequests] = useState<MeetingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/users/me').then(r => setUser(r.data)),
      api.get('/requests/mine').then(r => setRequests(r.data)),
    ]).finally(() => setLoading(false))
  }, [])

  async function submit() {
    if (!prompt.trim()) return
    setSubmitting(true)
    try {
      const res = await api.post('/requests/new', { prompt_text: prompt })
      setLatest(res.data)
      setRequests(prev => [res.data, ...prev])
      setPrompt('')
    } finally {
      setSubmitting(false)
    }
  }

  function logout() {
    clearAuth()
    navigate('/login')
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Scheduler</h1>
          {user && <p className="text-xs text-gray-500">{user.name} · Student</p>}
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 transition">
          Sign out
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-8">
        {/* Request bar */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Request a meeting with your TA</h2>
          <div className="flex gap-3">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
              placeholder='e.g. "I need help understanding my midterm grade"'
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              disabled={submitting}
            />
            <button
              onClick={submit}
              disabled={submitting || !prompt.trim()}
              className="bg-indigo-600 text-white px-5 py-3 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>

          {/* Latest submission result */}
          {latest && (
            <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {latest.detected_priority && <PriorityBadge priority={latest.detected_priority} />}
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_STYLES[latest.status]}`}>
                  {latest.status}
                </span>
              </div>
              {latest.summary && <p className="text-sm text-gray-700">{latest.summary}</p>}
              {latest.preferred_time_range && (
                <p className="text-xs text-gray-500">Preferred: {latest.preferred_time_range}</p>
              )}
            </div>
          )}
        </section>

        {/* Request history */}
        {!loading && requests.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Your requests</h2>
            {requests.map(req => (
              <div key={req.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-800 flex-1">{req.prompt_text}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${STATUS_STYLES[req.status]}`}>
                    {req.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {req.detected_priority && <PriorityBadge priority={req.detected_priority} />}
                  <span className="text-xs text-gray-400">{formatTime(req.created_at)}</span>
                </div>
                {req.status === 'SCHEDULED' && (
                  <MeetingLinkRow requestId={req.id} />
                )}
              </div>
            ))}
          </section>
        )}

        {!loading && requests.length === 0 && (
          <p className="text-center text-gray-400 text-sm">No requests yet. Send one above.</p>
        )}
      </main>
    </div>
  )
}

function MeetingLinkRow({ requestId: _requestId }: { requestId: number }) {

  return (
    <div className="text-xs text-green-700 font-medium">
      Your meeting is confirmed. Check your Google Calendar for the Meet link.
    </div>
  )
}
