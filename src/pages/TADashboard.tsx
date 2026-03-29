import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../lib/api'
import { clearAuth } from '../lib/auth'
import PriorityBadge from '../components/PriorityBadge'
import BurnoutBadge from '../components/BurnoutBadge'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Student { id: number; name: string; email: string }

interface Notification {
  id: number
  student: Student
  prompt_text: string
  detected_priority: number | null
  detected_topic: string | null
  preferred_time_range: string | null
  created_at: string
}

interface SlotExplanation {
  buffer_before_minutes: number | null
  buffer_after_minutes: number | null
  deep_work_safe: boolean
  daily_cognitive_impact: string
  back_to_back: boolean
  burnout_risk_after: string
  urgency_respected: boolean
}

interface Suggestion {
  slot: string
  duration_minutes: number
  score: number
  rank: number
  explanation: SlotExplanation
  prompt_reasoning?: string
}

interface CalendarMeeting {
  id: number
  type: 'student_meeting'
  start_time: string
  end_time: string
  google_meet_link: string | null
  student: Student
  cognitive_score_impact: number | null
}

interface ProfessorBlock {
  id: number
  type: 'professor_block'
  title: string
  start_time: string
  end_time: string
}

interface CognitiveDay {
  date: string
  score: number
  burnout_risk: string
  meeting_count: number
}

interface DensityPoint { hour: number; count: number }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Main Component ─────────────────────────────────────────────────────────────

type Tab = 'requests' | 'calendar' | 'analytics'

export default function TADashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('requests')
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [selected, setSelected] = useState<Notification | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [slotPrompt, setSlotPrompt] = useState('')
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptReasoning, setPromptReasoning] = useState<string | null>(null)
  const [slotTab, setSlotTab] = useState<'recommended' | 'soonest'>('recommended')
  const [soonestSuggestions, setSoonestSuggestions] = useState<Suggestion[]>([])
  const [loadingSoonest, setLoadingSoonest] = useState(false)
  const [rejectedBookings, setRejectedBookings] = useState<any[]>([])

  const [calendar, setCalendar] = useState<{ meetings: CalendarMeeting[]; professor_blocks: ProfessorBlock[] } | null>(null)
  const [cogScores, setCogScores] = useState<CognitiveDay[]>([])
  const [burnout, setBurnout] = useState<{ current_risk: string; trend: CognitiveDay[] } | null>(null)
  const [density, setDensity] = useState<DensityPoint[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data))
    api.get('/ta/notifications').then(r => setNotifications(r.data))
    api.get('/ta/rejected-bookings').then(r => setRejectedBookings(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'calendar') {
      api.get('/ta/calendar').then(r => setCalendar(r.data))
    } else if (tab === 'analytics') {
      Promise.all([
        api.get('/analytics/cognitive').then(r => setCogScores(r.data)),
        api.get('/analytics/burnout').then(r => setBurnout(r.data)),
        api.get('/analytics/density').then(r => setDensity(r.data)),
      ])
    }
  }, [tab])

  async function selectRequest(n: Notification) {
    setSelected(n)
    setSuggestions([])
    setSoonestSuggestions([])
    setSlotTab('recommended')
    setLoadingSuggestions(true)
    setLoadingSoonest(true)
    try {
      const [recRes, soonRes] = await Promise.all([
        api.get(`/ta/suggestions/${n.id}`),
        api.get(`/ta/soonest/${n.id}`),
      ])
      setSuggestions(recRes.data)
      setSoonestSuggestions(soonRes.data)
    } finally {
      setLoadingSuggestions(false)
      setLoadingSoonest(false)
    }
  }

  async function suggestByPrompt() {
    if (!selected || !slotPrompt.trim()) return
    setPromptLoading(true)
    setPromptReasoning(null)
    try {
      const res = await api.post('/ta/suggest-by-prompt', {
        request_id: selected.id,
        prompt: slotPrompt,
      })
      setSuggestions(res.data)
      if (res.data.length > 0 && res.data[0].prompt_reasoning) {
        setPromptReasoning(res.data[0].prompt_reasoning)
      }
    } finally {
      setPromptLoading(false)
    }
  }

  async function book(suggestion: Suggestion) {
    if (!selected) return
    setBookingId(suggestion.slot)
    try {
      await api.post('/ta/book', {
        request_id: selected.id,
        start_time: suggestion.slot.replace('Z', ''),
        end_time: new Date(new Date(suggestion.slot).getTime() + suggestion.duration_minutes * 60000).toISOString().replace('Z', ''),
      })
      setNotifications(prev => prev.filter(n => n.id !== selected.id))
      setSelected(null)
      setSuggestions([])
      setSoonestSuggestions([])
    } finally {
      setBookingId(null)
    }
  }

  async function bookSoonest(suggestion: Suggestion) {
    if (!selected) return
    setBookingId(suggestion.slot)
    try {
      await api.post('/ta/book-soonest', {
        request_id: selected.id,
        start_time: suggestion.slot.replace('Z', ''),
        end_time: new Date(new Date(suggestion.slot).getTime() + suggestion.duration_minutes * 60000).toISOString().replace('Z', ''),
      })
      setNotifications(prev => prev.filter(n => n.id !== selected.id))
      setSelected(null)
      setSuggestions([])
      setSoonestSuggestions([])
    } finally {
      setBookingId(null)
    }
  }

  async function decline(id: number) {
    await api.post(`/ta/decline/${id}`)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (selected?.id === id) { setSelected(null); setSuggestions([]) }
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

  function logout() { clearAuth(); navigate('/login') }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'requests', label: 'Requests' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'analytics', label: 'Analytics' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Scheduler</h1>
          {user && <p className="text-xs text-gray-500">{user.name} · TA</p>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="email"
            placeholder="Student's email"
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
            {inviteSending ? 'Sending…' : 'Invite Student'}
          </button>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800 transition ml-2">
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

      {/* Tab bar */}
      <nav className="bg-white border-b border-gray-200 px-6 flex gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
            {t.key === 'requests' && notifications.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {notifications.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'requests' && (
          <RequestsTab
            notifications={notifications}
            selected={selected}
            suggestions={suggestions}
            soonestSuggestions={soonestSuggestions}
            loadingSuggestions={loadingSuggestions}
            loadingSoonest={loadingSoonest}
            bookingId={bookingId}
            slotTab={slotTab}
            onSlotTabChange={setSlotTab}
            onSelect={selectRequest}
            onBook={book}
            onBookSoonest={bookSoonest}
            onDecline={decline}
            slotPrompt={slotPrompt}
            onSlotPromptChange={setSlotPrompt}
            onSuggestByPrompt={suggestByPrompt}
            promptLoading={promptLoading}
            promptReasoning={promptReasoning}
            rejectedBookings={rejectedBookings}
          />
        )}
        {tab === 'calendar' && <CalendarTab data={calendar} />}
        {tab === 'analytics' && (
          <AnalyticsTab scores={cogScores} burnout={burnout} density={density} />
        )}
      </div>
    </div>
  )
}

// ── Requests Tab ───────────────────────────────────────────────────────────────

function RequestsTab({
  notifications, selected, suggestions, soonestSuggestions,
  loadingSuggestions, loadingSoonest, bookingId,
  slotTab, onSlotTabChange,
  onSelect, onBook, onBookSoonest, onDecline,
  slotPrompt, onSlotPromptChange, onSuggestByPrompt, promptLoading, promptReasoning,
  rejectedBookings,
}: {
  notifications: Notification[]
  selected: Notification | null
  suggestions: Suggestion[]
  soonestSuggestions: Suggestion[]
  loadingSuggestions: boolean
  loadingSoonest: boolean
  bookingId: string | null
  slotTab: 'recommended' | 'soonest'
  onSlotTabChange: (t: 'recommended' | 'soonest') => void
  onSelect: (n: Notification) => void
  onBook: (s: Suggestion) => void
  onBookSoonest: (s: Suggestion) => void
  onDecline: (id: number) => void
  slotPrompt: string
  onSlotPromptChange: (v: string) => void
  onSuggestByPrompt: () => void
  promptLoading: boolean
  promptReasoning: string | null
  rejectedBookings: any[]
}) {
  return (
    <div className="flex h-full">
      {/* Left: notification list */}
      <div className="w-80 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Pending Requests ({notifications.length})
          </p>
        </div>
        {notifications.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">No pending requests</p>
        )}
        {notifications.map(n => (
          <button
            key={n.id}
            onClick={() => onSelect(n)}
            className={`w-full text-left px-4 py-4 border-b border-gray-100 hover:bg-gray-50 transition ${
              selected?.id === n.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-gray-800 truncate">{n.student.name}</span>
              {n.detected_priority && <PriorityBadge priority={n.detected_priority} />}
            </div>
            <p className="text-xs text-gray-500 line-clamp-2">{n.prompt_text}</p>
            <p className="text-xs text-gray-400 mt-1">{fmt(n.created_at)}</p>
          </button>
        ))}
      </div>

      {/* Right: slot suggestions */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selected && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a request to see AI-suggested slots
          </div>
        )}
        {selected && (
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            {/* Request detail */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                {selected.detected_priority && <PriorityBadge priority={selected.detected_priority} />}
                <span className="text-xs text-gray-500">{selected.student.email}</span>
              </div>
              <p className="text-sm text-gray-800">{selected.prompt_text}</p>
              {selected.preferred_time_range && (
                <p className="text-xs text-gray-500 mt-1">Preferred: {selected.preferred_time_range}</p>
              )}
              <button
                onClick={() => onDecline(selected.id)}
                className="mt-3 text-xs text-red-500 hover:text-red-700 transition"
              >
                Decline request
              </button>
            </div>

            {/* Prompt-based scheduling */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Schedule with AI</h3>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
                  placeholder='e.g. "tomorrow afternoon" or "find a light slot this week"'
                  value={slotPrompt}
                  onChange={e => onSlotPromptChange(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && onSuggestByPrompt()}
                  disabled={promptLoading}
                />
                <button
                  onClick={onSuggestByPrompt}
                  disabled={promptLoading || !slotPrompt.trim()}
                  className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition shrink-0"
                >
                  {promptLoading ? 'Finding slots…' : 'Find Slots'}
                </button>
              </div>
              {promptReasoning && (
                <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                  AI: {promptReasoning}
                </p>
              )}
            </div>

            {/* Rejected booking alerts */}
            {rejectedBookings.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-red-700 mb-2">Rejected Bookings</p>
                {rejectedBookings.map((r: any) => (
                  <div key={r.id} className="text-xs text-red-600 mb-1">
                    {r.student.name} — {fmt(r.start_time)} was rejected by professor. Please rebook.
                  </div>
                ))}
              </div>
            )}

            {/* Slot suggestions with tabs */}
            <div>
              <div className="flex gap-1 mb-3">
                {(['recommended', 'soonest'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => onSlotTabChange(t)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition capitalize ${
                      slotTab === t
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {slotTab === 'soonest' && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  Soonest slots require professor approval before the meeting is confirmed.
                </p>
              )}

              {slotTab === 'recommended' && (
                <>
                  {loadingSuggestions && <p className="text-sm text-gray-400">Generating suggestions…</p>}
                  {!loadingSuggestions && suggestions.length === 0 && (
                    <p className="text-sm text-gray-400">No available slots found in the priority window.</p>
                  )}
                  <div className="flex flex-col gap-4">
                    {suggestions.map(s => (
                      <SlotCard key={s.slot} suggestion={s} isBooking={bookingId === s.slot} onBook={() => onBook(s)} />
                    ))}
                  </div>
                </>
              )}

              {slotTab === 'soonest' && (
                <>
                  {loadingSoonest && <p className="text-sm text-gray-400">Finding soonest slots…</p>}
                  {!loadingSoonest && soonestSuggestions.length === 0 && (
                    <p className="text-sm text-gray-400">No available slots found.</p>
                  )}
                  <div className="flex flex-col gap-4">
                    {soonestSuggestions.map(s => (
                      <SlotCard key={s.slot} suggestion={s} isBooking={bookingId === s.slot} onBook={() => onBookSoonest(s)} buttonLabel="Request Approval" />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SlotCard({
  suggestion, isBooking, onBook, buttonLabel,
}: {
  suggestion: Suggestion
  isBooking: boolean
  onBook: () => void
  buttonLabel?: string
}) {
  const { slot, duration_minutes, rank, score, explanation: ex } = suggestion
  const date = new Date(slot)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              #{rank} Best
            </span>
            <span className="text-xs text-gray-400">Score: {score.toFixed(1)}</span>
          </div>
          <p className="text-base font-semibold text-gray-900">
            {date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <p className="text-sm text-gray-700">
            {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {duration_minutes} min
          </p>
        </div>
        <button
          onClick={onBook}
          disabled={isBooking}
          className="shrink-0 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {isBooking ? 'Booking…' : (buttonLabel || 'Confirm')}
        </button>
      </div>

      {/* Explanation grid */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <span className={ex.deep_work_safe ? 'text-green-500' : 'text-red-400'}>●</span>
          {ex.deep_work_safe ? 'Deep work safe' : 'Deep work conflict'}
        </div>
        <div className="flex items-center gap-1">
          <span className={!ex.back_to_back ? 'text-green-500' : 'text-orange-400'}>●</span>
          {ex.back_to_back ? 'Back-to-back' : 'Good buffer'}
        </div>
        {ex.buffer_before_minutes != null && (
          <div className="text-gray-500">Buffer before: {ex.buffer_before_minutes}m</div>
        )}
        {ex.buffer_after_minutes != null && (
          <div className="text-gray-500">Buffer after: {ex.buffer_after_minutes}m</div>
        )}
        <div className="text-gray-500">Cognitive impact: {ex.daily_cognitive_impact}</div>
        <div className="flex items-center gap-1">
          Burnout after: <BurnoutBadge risk={ex.burnout_risk_after} />
        </div>
        {ex.urgency_respected && (
          <div className="text-indigo-500 col-span-2">Urgency priority respected</div>
        )}
      </div>
    </div>
  )
}

// ── Calendar Tab ───────────────────────────────────────────────────────────────

function CalendarTab({ data }: { data: { meetings: CalendarMeeting[]; professor_blocks: ProfessorBlock[] } | null }) {
  if (!data) return <div className="p-8 text-gray-400 text-sm text-center">Loading…</div>

  const allEvents = [
    ...data.meetings.map(m => ({
      id: `m-${m.id}`,
      start: m.start_time,
      end: m.end_time,
      label: `Meeting with ${m.student.name}`,
      sub: m.google_meet_link ? 'Has Meet link' : '',
      color: 'bg-indigo-100 border-indigo-300 text-indigo-800',
      link: m.google_meet_link,
    })),
    ...data.professor_blocks.map(b => ({
      id: `b-${b.id}`,
      start: b.start_time,
      end: b.end_time,
      label: b.title,
      sub: 'Professor block',
      color: 'bg-gray-100 border-gray-300 text-gray-600',
      link: null,
    })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  if (allEvents.length === 0) {
    return <div className="p-8 text-gray-400 text-sm text-center">No upcoming events</div>
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Upcoming Events</h2>
      <div className="flex flex-col gap-2">
        {allEvents.map(ev => (
          <div key={ev.id} className={`rounded-xl border px-4 py-3 flex items-center justify-between ${ev.color}`}>
            <div>
              <p className="text-sm font-medium">{ev.label}</p>
              <p className="text-xs opacity-70">{fmt(ev.start)} → {fmt(ev.end)}</p>
              {ev.sub && <p className="text-xs opacity-60">{ev.sub}</p>}
            </div>
            {ev.link && (
              <a
                href={ev.link}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition shrink-0"
              >
                Join Meet
              </a>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-200 border border-indigo-300 inline-block"></span> Student meeting</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-200 border border-gray-300 inline-block"></span> Professor block</span>
      </div>
    </div>
  )
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────

function AnalyticsTab({
  scores, burnout, density,
}: {
  scores: CognitiveDay[]
  burnout: { current_risk: string; trend: CognitiveDay[] } | null
  density: DensityPoint[]
}) {
  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-8">
      {/* Burnout summary */}
      {burnout && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Current Burnout Risk</p>
            <BurnoutBadge risk={burnout.current_risk} />
          </div>
          <div className="text-xs text-gray-400">Based on your 7-day rolling average cognitive score</div>
        </div>
      )}

      {/* Cognitive score line chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">7-Day Cognitive Load Score</h3>
        {scores.length === 0 ? (
          <p className="text-sm text-gray-400">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={scores.map(s => ({ ...s, date: fmtDate(s.date) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Meeting density bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Meeting Density by Hour (last 7 days)</h3>
        {density.length === 0 ? (
          <p className="text-sm text-gray-400">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={density.map(d => ({ hour: `${d.hour}:00`, count: d.count }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#818cf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

