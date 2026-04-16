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

interface StudentTicket {
  id: number
  title: string
  description: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  shared_with_professor: boolean
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  ta: { id: number; name: string } | null
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
  const [tickets, setTickets] = useState<StudentTicket[]>([])

  useEffect(() => {
    Promise.all([
      api.get('/users/me').then(r => setUser(r.data)),
      api.get('/requests/mine').then(r => setRequests(r.data)),
      api.get('/tickets/for-me').then(r => setTickets(r.data)).catch(() => {}),
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 text-gray-500 hover:text-gray-800 transition"
            title="Account Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 transition">
            Sign out
          </button>
        </div>
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

        {/* Tickets section */}
        {!loading && tickets.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Action Tickets</h2>
            <p className="text-xs text-gray-400 -mt-1">Items your TA escalated to the professor on your behalf.</p>
            {tickets.map(ticket => (
              <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800 flex-1">{ticket.title}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${
                    ticket.status === 'OPEN' ? 'bg-yellow-100 text-yellow-700' :
                    ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>
                {ticket.description && (
                  <p className="text-xs text-gray-500 line-clamp-3">{ticket.description}</p>
                )}
                {ticket.resolution_note && (
                  <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                    <p className="text-xs text-green-700 font-medium">Professor's note</p>
                    <p className="text-xs text-green-700 mt-0.5">{ticket.resolution_note}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                  {ticket.ta && <span>Via {ticket.ta.name}</span>}
                  <span>·</span>
                  <span className={`font-medium ${ticket.shared_with_professor ? 'text-orange-500' : 'text-indigo-500'}`}>
                    {ticket.shared_with_professor ? 'With professor' : 'TA handling'}
                  </span>
                  <span>·</span>
                  <span>{formatTime(ticket.created_at)}</span>
                </div>
              </div>
            ))}
          </section>
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
