import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { clearAuth } from '../lib/auth'
import BurnoutBadge from '../components/BurnoutBadge'
import WeeklyCalendar from '../components/WeeklyCalendar'

interface BlockPreview { title: string; start: string; end: string; google_event_id?: string }

interface CalendarBlock {
  id: number
  title: string
  start_time: string
  end_time: string
  source_prompt: string
  google_event_id: string | null
}

interface GoogleEvent {
  id: string
  title: string
  start: string
  end: string
  meet_link: string | null
}

interface TAOverview {
  id: number
  name: string
  email: string
  burnout_risk: string
  cognitive_score: number
  student_count: number
}

interface PendingApprovalItem {
  id: number
  student: { id: number; name: string; email: string }
  ta: { id: number; name: string; email: string }
  start_time: string
  end_time: string
  reason: string
  created_at: string
}

type Tab = 'calendar' | 'team' | 'tickets'

interface IncomingTicket {
  id: number
  title: string
  description: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  student: { id: number; name: string; email: string } | null
  ta: { id: number; name: string; email: string } | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ProfessorDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('calendar')
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [prompt, setPrompt] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [previews, setPreviews] = useState<BlockPreview[] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<CalendarBlock[]>([])
  const [bookedMeetings, setBookedMeetings] = useState<{ id: number; type: string; title: string; start_time: string; end_time: string; google_meet_link: string | null }[]>([])
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([])
  const [team, setTeam] = useState<TAOverview[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [approvals, setApprovals] = useState<PendingApprovalItem[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [incomingTickets, setIncomingTickets] = useState<IncomingTicket[]>([])
  const [ticketStatusMap, setTicketStatusMap] = useState<Record<number, 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>>({})
  const [ticketNoteMap, setTicketNoteMap] = useState<Record<number, string>>({})
  const [updatingTicket, setUpdatingTicket] = useState<number | null>(null)

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data))
    api.get('/professor/calendar').then(r => {
      setBlocks(r.data.blocks)
      setBookedMeetings(r.data.meetings)
    })
    api.get('/professor/google-calendar').then(r => setGoogleEvents(r.data)).catch(() => {})
    api.get('/professor/pending-approvals').then(r => setApprovals(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'team') {
      api.get('/professor/team').then(r => setTeam(r.data))
    } else if (tab === 'tickets') {
      api.get('/tickets/incoming').then(r => {
        setIncomingTickets(r.data)
        const statusInit: Record<number, 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'> = {}
        const noteInit: Record<number, string> = {}
        r.data.forEach((t: IncomingTicket) => {
          statusInit[t.id] = t.status
          noteInit[t.id] = t.resolution_note ?? ''
        })
        setTicketStatusMap(statusInit)
        setTicketNoteMap(noteInit)
      }).catch(() => {})
    }
  }, [tab])

  async function preview() {
    if (!prompt.trim()) return
    setPreviewing(true)
    setPreviewError(null)
    setPreviews(null)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    try {
      const res = await api.post('/professor/block/preview', { prompt, timezone })
      setPreviews(res.data)
    } catch (e: any) {
      setPreviewError(e.response?.data?.detail ?? 'Could not parse prompt')
    } finally {
      setPreviewing(false)
    }
  }

  async function confirm() {
    if (!previews) return
    setConfirming(true)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    try {
      const res = await api.post('/professor/block/confirm', { prompt, timezone })
      const newBlocks: BlockPreview[] = res.data.created
      setBlocks(prev => [
        ...prev,
        ...newBlocks.map((b, i) => ({
          id: Date.now() + i,
          title: b.title,
          start_time: b.start,
          end_time: b.end,
          source_prompt: prompt,
          google_event_id: b.google_event_id ?? null,
        })),
      ])
      setPrompt('')
      setPreviews(null)
    } finally {
      setConfirming(false)
    }
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviteSending(true)
    setInviteMsg(null)
    try {
      await api.post('/auth/invite', { email: inviteEmail })
      setInviteMsg({ type: 'success', text: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
    } catch (e: any) {
      setInviteMsg({ type: 'error', text: e.response?.data?.detail ?? 'Failed to send invite' })
    } finally {
      setInviteSending(false)
    }
  }

  async function handleApproval(id: number, action: 'approve' | 'reject') {
    try {
      await api.post(`/professor/${action}/${id}`)
      setApprovals(prev => prev.filter(a => a.id !== id))
    } catch {
      alert(`Failed to ${action} booking`)
    }
  }

  async function updateTicket(ticketId: number) {
    setUpdatingTicket(ticketId)
    try {
      const res = await api.patch(`/tickets/${ticketId}/status`, {
        status: ticketStatusMap[ticketId],
        resolution_note: ticketNoteMap[ticketId] || null,
      })
      setIncomingTickets(prev =>
        prev.map(t => t.id === ticketId ? { ...t, ...res.data } : t)
      )
    } catch {
      alert('Failed to update ticket')
    } finally {
      setUpdatingTicket(null)
    }
  }

  function logout() { clearAuth(); navigate('/login') }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Scheduler</h1>
          {user && <p className="text-xs text-gray-500">{user.name} · Professor</p>}
        </div>
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setBellOpen(!bellOpen)}
              className="relative p-2 text-gray-500 hover:text-gray-800 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg>
              {approvals.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {approvals.length}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {bellOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50 max-h-96 overflow-y-auto">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Pending Approvals ({approvals.length})
                  </p>
                </div>
                {approvals.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No pending approvals</p>
                )}
                {approvals.map(a => (
                  <div key={a.id} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                    <p className="text-sm font-medium text-gray-800">{a.student.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmt(a.start_time)} — {fmt(a.end_time)}</p>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.reason}</p>
                    <p className="text-xs text-gray-400 mt-0.5">TA: {a.ta.name}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleApproval(a.id, 'approve')}
                        className="bg-green-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-green-700 transition"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleApproval(a.id, 'reject')}
                        className="bg-red-500 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-red-600 transition"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
            type="email"
            placeholder="TA's email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendInvite()}
            disabled={inviteSending}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
          />
          <button
            onClick={sendInvite}
            disabled={inviteSending || !inviteEmail.trim()}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {inviteSending ? 'Sending…' : 'Invite TA'}
          </button>
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

      {/* Invite feedback toast */}
      {inviteMsg && (
        <div className={`border-b px-6 py-3 flex items-center gap-3 ${
          inviteMsg.type === 'success' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
        }`}>
          <span className={`text-sm font-medium ${inviteMsg.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {inviteMsg.text}
          </span>
          <button onClick={() => setInviteMsg(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-auto">×</button>
        </div>
      )}

      {/* Prompt bar — always visible */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
              placeholder='e.g. "Block Tuesday 2–4pm for grading. Hold Thursday morning open."'
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && preview()}
              disabled={previewing || confirming}
            />
            <button
              onClick={preview}
              disabled={previewing || !prompt.trim()}
              className="bg-indigo-600 text-white px-5 py-3 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {previewing ? 'Parsing…' : 'Preview'}
            </button>
          </div>

          {previewError && (
            <p className="text-sm text-red-500">{previewError}</p>
          )}

          {/* Preview cards */}
          {previews && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500 font-medium">Parsed blocks — confirm to save:</p>
              {previews.map((b, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{b.title}</p>
                    <p className="text-xs text-gray-500">{fmt(b.start)} → {fmt(b.end)}</p>
                  </div>
                  <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-0.5">Blocked</span>
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={confirm}
                  disabled={confirming}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                >
                  {confirming ? 'Saving…' : 'Confirm & Block'}
                </button>
                <button
                  onClick={() => setPreviews(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <nav className="bg-white border-b border-gray-200 px-6 flex gap-1">
        {(['calendar', 'team', 'tickets'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition capitalize ${
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'calendar' ? 'My Calendar' : t === 'team' ? 'Team Overview' : (
              <span className="flex items-center gap-1.5">
                Tickets
                {incomingTickets.filter(tk => tk.status === 'OPEN').length > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                    {incomingTickets.filter(tk => tk.status === 'OPEN').length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {tab === 'calendar' && (
            <WeeklyCalendar
              events={[
                ...googleEvents.map(e => ({
                  id: `g-${e.id}`,
                  title: e.title,
                  start: e.start,
                  end: e.end,
                  type: 'google' as const,
                  meet_link: e.meet_link,
                })),
                ...blocks.map(b => ({
                  id: `b-${b.id}`,
                  title: b.title,
                  start: b.start_time,
                  end: b.end_time,
                  type: 'blocked' as const,
                })),
                ...bookedMeetings.map(m => ({
                  id: `m-${m.id}`,
                  title: m.title,
                  start: m.start_time,
                  end: m.end_time,
                  type: 'meeting' as const,
                  meet_link: m.google_meet_link,
                })),
              ]}
            />
          )}

          {tab === 'tickets' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Action Tickets ({incomingTickets.length})
              </h2>
              {incomingTickets.length === 0 && (
                <p className="text-sm text-gray-400">No tickets yet. They appear here when a TA uploads a meeting transcript.</p>
              )}
              {incomingTickets.map(ticket => (
                <div key={ticket.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{ticket.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Student: {ticket.student?.name} · TA: {ticket.ta?.name}
                      </p>
                      {ticket.description && (
                        <p className="text-sm text-gray-600 mt-2">{ticket.description}</p>
                      )}
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${
                      ticket.status === 'OPEN' ? 'bg-yellow-100 text-yellow-700' :
                      ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Status update controls */}
                  <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
                    <div className="flex items-center gap-3">
                      <select
                        value={ticketStatusMap[ticket.id] ?? ticket.status}
                        onChange={e => setTicketStatusMap(prev => ({ ...prev, [ticket.id]: e.target.value as any }))}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESOLVED">Resolved</option>
                      </select>
                      <button
                        onClick={() => updateTicket(ticket.id)}
                        disabled={updatingTicket === ticket.id}
                        className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                      >
                        {updatingTicket === ticket.id ? 'Updating…' : 'Update'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={ticketNoteMap[ticket.id] ?? ''}
                      onChange={e => setTicketNoteMap(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                      placeholder="Resolution note (optional — sent to student and TA)"
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                    />
                  </div>
                  <p className="text-xs text-gray-400">{fmt(ticket.created_at)}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'team' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Your TAs</h2>
              {team.length === 0 && (
                <p className="text-sm text-gray-400">No TAs yet. Use "Invite TA" to add one.</p>
              )}
              {team.map(ta => (
                <div key={ta.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{ta.name}</p>
                    <p className="text-xs text-gray-500">{ta.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{ta.student_count} student{ta.student_count !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Cognitive score</p>
                      <p className="text-lg font-bold text-gray-800">{ta.cognitive_score.toFixed(0)}</p>
                    </div>
                    <BurnoutBadge risk={ta.burnout_risk} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
