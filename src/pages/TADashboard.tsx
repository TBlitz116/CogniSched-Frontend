import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../lib/api'
import { clearAuth } from '../lib/auth'
import PriorityBadge from '../components/PriorityBadge'
import BurnoutBadge from '../components/BurnoutBadge'
import InviteReminderModal from '../components/InviteReminderModal'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Student { id: number; name: string; email: string }

interface ActionItem {
  title: string
  description: string
  shared_with_professor: boolean  // pre-filled by Gemini scope classification, TA can toggle
}

interface Ticket {
  id: number
  title: string
  description: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  shared_with_professor: boolean
  resolution_note: string | null
  created_at: string
  resolved_at: string | null
  student: Student | null
}

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
  professor_cognitive_score: number | null
  professor_load_label: string | null
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

interface StudentHistory {
  student: { id: number; name: string }
  booked_meeting_count: number
  past_requests: { priority: number; topic: string; status: string; created_at: string }[]
  past_tickets: { title: string; shared_with_professor: boolean; status: string }[]
  past_decisions: { question: string; outcome: string | null }[]
  recommendation: string
  reasoning: string
}

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

type Tab = 'requests' | 'calendar' | 'analytics' | 'tickets'

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
  const [slotTab, setSlotTab] = useState<'recommended' | 'soonest' | 'history'>('recommended')
  const [soonestSuggestions, setSoonestSuggestions] = useState<Suggestion[]>([])
  const [loadingSoonest, setLoadingSoonest] = useState(false)
  const [rejectedBookings, setRejectedBookings] = useState<any[]>([])
  const [historyRec, setHistoryRec] = useState<{ recommendation: string; reasoning: string } | null>(null)
  const [historyData, setHistoryData] = useState<StudentHistory | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [useSimple, setUseSimple] = useState(false)

  const [calendar, setCalendar] = useState<{ meetings: CalendarMeeting[]; professor_blocks: ProfessorBlock[] } | null>(null)
  const [cogScores, setCogScores] = useState<CognitiveDay[]>([])
  const [burnout, setBurnout] = useState<{ current_risk: string; trend: CognitiveDay[] } | null>(null)
  const [density, setDensity] = useState<DensityPoint[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Decision-card state — the Decision Inbox flow lets a TA convert a request
  // into an async yes/no for the professor instead of booking a meeting.
  const [decisionFor, setDecisionFor] = useState<Notification | null>(null)
  const [decisionDraft, setDecisionDraft] = useState<{
    question_summary: string
    context: string
    ta_recommendation: string
    options: string[]
  } | null>(null)
  const [decisionDrafting, setDecisionDrafting] = useState(false)
  const [decisionSubmitting, setDecisionSubmitting] = useState(false)
  const [decisionTaNote, setDecisionTaNote] = useState('')
  const [decisionError, setDecisionError] = useState<string | null>(null)

  // Tickets tab state
  const [myStudents, setMyStudents] = useState<Student[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketStudentId, setTicketStudentId] = useState<number | null>(null)
  const [transcript, setTranscript] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractedItems, setExtractedItems] = useState<ActionItem[] | null>(null)
  const [submittingTickets, setSubmittingTickets] = useState(false)
  const [ticketMsg, setTicketMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sharingId, setSharingId] = useState<number | null>(null)
  const [taResolvingId, setTaResolvingId] = useState<number | null>(null)

  const [showInviteReminder, setShowInviteReminder] = useState(false)
  const inviteInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get('/users/me').then(r => setUser(r.data))
    api.get('/ta/notifications').then(r => setNotifications(r.data))
    api.get('/ta/rejected-bookings').then(r => setRejectedBookings(r.data)).catch(() => {})
    // Check student list on mount so we can nudge the TA to invite a student if empty
    api.get('/mappings/my-students').then(r => {
      setMyStudents(r.data)
      if (r.data.length === 0 && !sessionStorage.getItem('inviteReminderDismissed:ta')) {
        setShowInviteReminder(true)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'calendar') {
      api.get('/ta/calendar').then(r => setCalendar(r.data))
    } else if (tab === 'tickets') {
      api.get('/mappings/my-students').then(r => setMyStudents(r.data)).catch(() => {})
      api.get('/tickets/mine').then(r => setTickets(r.data)).catch(() => {})
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
    setHistoryRec(null)
    setHistoryData(null)
    setUseSimple(false)
    setLoadingSuggestions(true)
    setLoadingSoonest(true)
    setLoadingHistory(true)
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
    // Fetch history independently so slot cards appear first
    try {
      const histRes = await api.get(`/ta/student-history/${n.student.id}`)
      setHistoryRec({ recommendation: histRes.data.recommendation, reasoning: histRes.data.reasoning })
      setHistoryData(histRes.data)
      setUseSimple(histRes.data.recommendation === 'SIMPLE_MEETING')
    } catch {
      // History is best-effort — don't block booking if it fails
    } finally {
      setLoadingHistory(false)
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

  async function book(suggestion: Suggestion, simple: boolean) {
    if (!selected) return
    setBookingId(suggestion.slot)
    try {
      await api.post('/ta/book', {
        request_id: selected.id,
        start_time: suggestion.slot.replace('Z', ''),
        end_time: new Date(new Date(suggestion.slot).getTime() + suggestion.duration_minutes * 60000).toISOString().replace('Z', ''),
        simple,
      })
      setNotifications(prev => prev.filter(n => n.id !== selected.id))
      setSelected(null)
      setSuggestions([])
      setSoonestSuggestions([])
      setHistoryRec(null)
      setHistoryData(null)
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

  async function openDecisionModal(n: Notification) {
    setDecisionFor(n)
    setDecisionDraft(null)
    setDecisionTaNote('')
    setDecisionError(null)
    setDecisionDrafting(true)
    try {
      const res = await api.post('/decisions/draft', { request_id: n.id })
      setDecisionDraft({
        question_summary: res.data.question_summary ?? '',
        context: res.data.context ?? '',
        ta_recommendation: res.data.ta_recommendation ?? '',
        options: res.data.options ?? ['Approve', 'Deny', 'Escalate to meeting'],
      })
    } catch (e: any) {
      setDecisionError(e.response?.data?.detail ?? 'Failed to draft decision')
    } finally {
      setDecisionDrafting(false)
    }
  }

  async function redraftDecision() {
    if (!decisionFor) return
    setDecisionDrafting(true)
    setDecisionError(null)
    try {
      const res = await api.post('/decisions/draft', {
        request_id: decisionFor.id,
        ta_note: decisionTaNote || null,
      })
      setDecisionDraft({
        question_summary: res.data.question_summary ?? '',
        context: res.data.context ?? '',
        ta_recommendation: res.data.ta_recommendation ?? '',
        options: res.data.options ?? ['Approve', 'Deny', 'Escalate to meeting'],
      })
    } catch (e: any) {
      setDecisionError(e.response?.data?.detail ?? 'Failed to redraft')
    } finally {
      setDecisionDrafting(false)
    }
  }

  async function submitDecision() {
    if (!decisionFor || !decisionDraft) return
    if (!decisionDraft.question_summary.trim()) {
      setDecisionError('Summary is required')
      return
    }
    if (decisionDraft.options.filter(o => o.trim()).length === 0) {
      setDecisionError('At least one option is required')
      return
    }
    setDecisionSubmitting(true)
    setDecisionError(null)
    try {
      await api.post('/decisions/create', {
        request_id: decisionFor.id,
        question_summary: decisionDraft.question_summary.trim(),
        context: decisionDraft.context.trim(),
        ta_recommendation: decisionDraft.ta_recommendation.trim(),
        options: decisionDraft.options.map(o => o.trim()).filter(Boolean),
      })
      const closedId = decisionFor.id
      setNotifications(prev => prev.filter(n => n.id !== closedId))
      if (selected?.id === closedId) { setSelected(null); setSuggestions([]) }
      setDecisionFor(null)
      setDecisionDraft(null)
    } catch (e: any) {
      setDecisionError(e.response?.data?.detail ?? 'Failed to send decision')
    } finally {
      setDecisionSubmitting(false)
    }
  }

  function closeDecisionModal() {
    setDecisionFor(null)
    setDecisionDraft(null)
    setDecisionError(null)
    setDecisionTaNote('')
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

  async function extractItems() {
    if (!ticketStudentId || !transcript.trim()) return
    setExtracting(true)
    setExtractedItems(null)
    setTicketMsg(null)
    try {
      const res = await api.post('/tickets/extract', {
        transcript,
        student_id: ticketStudentId,
      })
      setExtractedItems(res.data.items)
      if (res.data.items.length === 0) {
        setTicketMsg({ type: 'error', text: 'No professor-actionable items found in this transcript.' })
      }
    } catch (e: any) {
      setTicketMsg({ type: 'error', text: e.response?.data?.detail ?? 'Extraction failed' })
    } finally {
      setExtracting(false)
    }
  }

  async function submitTickets() {
    if (!ticketStudentId || !extractedItems?.length) return
    setSubmittingTickets(true)
    const sharedCount = extractedItems.filter(i => i.shared_with_professor).length
    try {
      await api.post('/tickets/create', {
        student_id: ticketStudentId,
        items: extractedItems,
      })
      const msg = sharedCount > 0
        ? `${extractedItems.length} ticket${extractedItems.length !== 1 ? 's' : ''} created. ${sharedCount} sent to professor.`
        : `${extractedItems.length} ticket${extractedItems.length !== 1 ? 's' : ''} created.`
      setTicketMsg({ type: 'success', text: msg })
      setTranscript('')
      setExtractedItems(null)
      setTicketStudentId(null)
      const r = await api.get('/tickets/mine')
      setTickets(r.data)
    } catch (e: any) {
      setTicketMsg({ type: 'error', text: e.response?.data?.detail ?? 'Failed to create tickets' })
    } finally {
      setSubmittingTickets(false)
    }
  }

  async function shareTicket(id: number) {
    setSharingId(id)
    try {
      await api.post(`/tickets/${id}/share`)
      setTickets(prev => prev.map(t => t.id === id ? { ...t, shared_with_professor: true } : t))
      setTicketMsg({ type: 'success', text: 'Ticket shared with professor.' })
    } catch (e: any) {
      setTicketMsg({ type: 'error', text: e.response?.data?.detail ?? 'Failed to share ticket' })
    } finally {
      setSharingId(null)
    }
  }

  async function taResolveTicket(id: number) {
    setTaResolvingId(id)
    try {
      await api.patch(`/tickets/${id}/ta-status`, { status: 'RESOLVED' })
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'RESOLVED' } : t))
    } catch (e: any) {
      setTicketMsg({ type: 'error', text: e.response?.data?.detail ?? 'Failed to resolve ticket' })
    } finally {
      setTaResolvingId(null)
    }
  }

  function logout() { clearAuth(); navigate('/login') }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'requests', label: 'Requests' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'tickets', label: 'Tickets' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <InviteReminderModal
        open={showInviteReminder}
        role="ta"
        onClose={() => {
          sessionStorage.setItem('inviteReminderDismissed:ta', '1')
          setShowInviteReminder(false)
        }}
        onInvite={() => {
          sessionStorage.setItem('inviteReminderDismissed:ta', '1')
          setShowInviteReminder(false)
          inviteInputRef.current?.focus()
        }}
      />
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Scheduler</h1>
          {user && <p className="text-xs text-gray-500">{user.name} · TA</p>}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inviteInputRef}
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
            onConvertToDecision={openDecisionModal}
            slotPrompt={slotPrompt}
            onSlotPromptChange={setSlotPrompt}
            onSuggestByPrompt={suggestByPrompt}
            promptLoading={promptLoading}
            promptReasoning={promptReasoning}
            rejectedBookings={rejectedBookings}
            historyRec={historyRec}
            historyData={historyData}
            loadingHistory={loadingHistory}
            useSimple={useSimple}
            onToggleSimple={setUseSimple}
          />
        )}
        {tab === 'calendar' && <CalendarTab data={calendar} />}
        {tab === 'analytics' && (
          <AnalyticsTab scores={cogScores} burnout={burnout} density={density} />
        )}
        {decisionFor && (
          <DecisionDraftModal
            notification={decisionFor}
            draft={decisionDraft}
            drafting={decisionDrafting}
            submitting={decisionSubmitting}
            taNote={decisionTaNote}
            error={decisionError}
            onTaNoteChange={setDecisionTaNote}
            onRedraft={redraftDecision}
            onDraftChange={setDecisionDraft}
            onSubmit={submitDecision}
            onClose={closeDecisionModal}
          />
        )}
        {tab === 'tickets' && (
          <TicketsTab
            students={myStudents}
            tickets={tickets}
            studentId={ticketStudentId}
            onStudentChange={setTicketStudentId}
            transcript={transcript}
            onTranscriptChange={setTranscript}
            onExtract={extractItems}
            extracting={extracting}
            extractedItems={extractedItems}
            onItemChange={(idx, field, val) => setExtractedItems(prev =>
              prev ? prev.map((it, i) => i === idx ? { ...it, [field]: val } : it) : prev
            )}
            onItemToggleScope={(idx) => setExtractedItems(prev =>
              prev ? prev.map((it, i) => i === idx ? { ...it, shared_with_professor: !it.shared_with_professor } : it) : prev
            )}
            onItemRemove={(idx) => setExtractedItems(prev => prev ? prev.filter((_, i) => i !== idx) : prev)}
            onSubmit={submitTickets}
            submitting={submittingTickets}
            onShare={shareTicket}
            sharingId={sharingId}
            onTaResolve={taResolveTicket}
            taResolvingId={taResolvingId}
            msg={ticketMsg}
            onClearMsg={() => setTicketMsg(null)}
          />
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
  onSelect, onBook, onBookSoonest, onDecline, onConvertToDecision,
  slotPrompt, onSlotPromptChange, onSuggestByPrompt, promptLoading, promptReasoning,
  rejectedBookings, historyRec, historyData, loadingHistory, useSimple, onToggleSimple,
}: {
  notifications: Notification[]
  selected: Notification | null
  suggestions: Suggestion[]
  soonestSuggestions: Suggestion[]
  loadingSuggestions: boolean
  loadingSoonest: boolean
  bookingId: string | null
  slotTab: 'recommended' | 'soonest' | 'history'
  onSlotTabChange: (t: 'recommended' | 'soonest' | 'history') => void
  onSelect: (n: Notification) => void
  onBook: (s: Suggestion, simple: boolean) => void
  onBookSoonest: (s: Suggestion) => void
  onDecline: (id: number) => void
  onConvertToDecision: (n: Notification) => void
  slotPrompt: string
  onSlotPromptChange: (v: string) => void
  onSuggestByPrompt: () => void
  promptLoading: boolean
  promptReasoning: string | null
  rejectedBookings: any[]
  historyRec: { recommendation: string; reasoning: string } | null
  historyData: StudentHistory | null
  loadingHistory: boolean
  useSimple: boolean
  onToggleSimple: (v: boolean) => void
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a request to see AI-suggested slots
          </div>
        )}
        {selected && <SelectedPanel
          selected={selected}
          suggestions={suggestions}
          soonestSuggestions={soonestSuggestions}
          loadingSuggestions={loadingSuggestions}
          loadingSoonest={loadingSoonest}
          bookingId={bookingId}
          slotTab={slotTab}
          onSlotTabChange={onSlotTabChange}
          onBook={onBook}
          onBookSoonest={onBookSoonest}
          onDecline={onDecline}
          onConvertToDecision={onConvertToDecision}
          slotPrompt={slotPrompt}
          onSlotPromptChange={onSlotPromptChange}
          onSuggestByPrompt={onSuggestByPrompt}
          promptLoading={promptLoading}
          promptReasoning={promptReasoning}
          rejectedBookings={rejectedBookings}
          historyRec={historyRec}
          historyData={historyData}
          loadingHistory={loadingHistory}
          useSimple={useSimple}
          onToggleSimple={onToggleSimple}
        />}
      </div>
    </div>
  )
}

// ── Selected panel (chat-style layout) ────────────────────────────────────────

function SelectedPanel({
  selected, suggestions, soonestSuggestions,
  loadingSuggestions, loadingSoonest, bookingId,
  slotTab, onSlotTabChange, onBook, onBookSoonest, onDecline, onConvertToDecision,
  slotPrompt, onSlotPromptChange, onSuggestByPrompt, promptLoading, promptReasoning,
  rejectedBookings, historyRec, historyData, loadingHistory, useSimple, onToggleSimple,
}: {
  selected: Notification
  suggestions: Suggestion[]
  soonestSuggestions: Suggestion[]
  loadingSuggestions: boolean
  loadingSoonest: boolean
  bookingId: string | null
  slotTab: 'recommended' | 'soonest' | 'history'
  onSlotTabChange: (t: 'recommended' | 'soonest' | 'history') => void
  onBook: (s: Suggestion, simple: boolean) => void
  onBookSoonest: (s: Suggestion) => void
  onDecline: (id: number) => void
  onConvertToDecision: (n: Notification) => void
  slotPrompt: string
  onSlotPromptChange: (v: string) => void
  onSuggestByPrompt: () => void
  promptLoading: boolean
  promptReasoning: string | null
  rejectedBookings: any[]
  historyRec: { recommendation: string; reasoning: string } | null
  historyData: StudentHistory | null
  loadingHistory: boolean
  useSimple: boolean
  onToggleSimple: (v: boolean) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when slots or reasoning update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [suggestions, soonestSuggestions, promptReasoning, promptLoading])

  return (
    <>
      {/* Request detail — fixed top strip */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            {selected.detected_priority && <PriorityBadge priority={selected.detected_priority} />}
            <span className="text-xs text-gray-500">{selected.student.email}</span>
            <button
              onClick={() => onConvertToDecision(selected)}
              className="ml-auto text-xs font-medium text-indigo-600 hover:text-indigo-800 transition inline-flex items-center gap-1"
              title="Send to professor as an async decision instead of booking a meeting"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Convert to Decision
            </button>
            <button
              onClick={() => onDecline(selected.id)}
              className="text-xs text-red-400 hover:text-red-600 transition"
            >
              Decline
            </button>
          </div>
          <p className="text-sm text-gray-800">{selected.prompt_text}</p>
          {selected.preferred_time_range && (
            <p className="text-xs text-gray-400 mt-0.5">Preferred: {selected.preferred_time_range}</p>
          )}
        </div>
      </div>

      {/* Chat area — scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">

          {/* Slot tab switcher */}
          <div className="flex gap-1">
            {(['recommended', 'soonest', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => onSlotTabChange(t)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition capitalize ${
                  slotTab === t
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'history' ? (
                  <span className="flex items-center gap-1">
                    History
                    {loadingHistory && <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-pulse" />}
                  </span>
                ) : t}
              </button>
            ))}
          </div>

          {/* AI meeting type recommendation */}
          {loadingHistory && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
              <span className="ml-1">Analyzing student history…</span>
            </div>
          )}
          {!loadingHistory && historyRec && (
            <div className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 border ${
              historyRec.recommendation === 'SIMPLE_MEETING'
                ? 'bg-teal-50 border-teal-200'
                : 'bg-indigo-50 border-indigo-200'
            }`}>
              <div className="flex flex-col gap-0.5">
                <p className={`text-xs font-semibold ${historyRec.recommendation === 'SIMPLE_MEETING' ? 'text-teal-700' : 'text-indigo-700'}`}>
                  AI Recommendation: {historyRec.recommendation === 'SIMPLE_MEETING' ? 'Simple Meeting (TA only)' : 'Full Meeting (with professor)'}
                </p>
                <p className="text-xs text-gray-500">{historyRec.reasoning}</p>
              </div>
              {/* Toggle override */}
              <button
                onClick={() => onToggleSimple(!useSimple)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  useSimple
                    ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                    : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {useSimple ? 'TA only' : 'With professor'}
              </button>
            </div>
          )}

          {slotTab === 'soonest' && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Soonest slots require professor approval before the meeting is confirmed.
            </div>
          )}

          {/* Rejected bookings */}
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

          {/* Slot cards */}
          {slotTab === 'recommended' && (
            <>
              {loadingSuggestions && <TypingIndicator />}
              {!loadingSuggestions && suggestions.length === 0 && (
                <p className="text-sm text-gray-400">No available slots found in the priority window.</p>
              )}
              {suggestions.map(s => (
                <SlotCard
                  key={s.slot}
                  suggestion={s}
                  isBooking={bookingId === s.slot}
                  onBook={() => onBook(s, useSimple)}
                  buttonLabel={useSimple ? 'Book (TA only)' : 'Confirm'}
                />
              ))}
            </>
          )}

          {slotTab === 'soonest' && (
            <>
              {loadingSoonest && <TypingIndicator />}
              {!loadingSoonest && soonestSuggestions.length === 0 && (
                <p className="text-sm text-gray-400">No available slots found.</p>
              )}
              {soonestSuggestions.map(s => (
                <SlotCard key={s.slot} suggestion={s} isBooking={bookingId === s.slot} onBook={() => onBookSoonest(s)} buttonLabel="Request Approval" />
              ))}
            </>
          )}

          {slotTab === 'history' && (
            <StudentHistoryPanel historyData={historyData} loading={loadingHistory} />
          )}

          {/* AI reasoning bubble — appears after prompt results */}
          {promptReasoning && (
            <div className="flex items-start gap-3 mt-2">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-indigo-800 max-w-md">
                {promptReasoning}
              </div>
            </div>
          )}

          {/* Prompt loading indicator */}
          {promptLoading && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              </div>
              <TypingIndicator />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Chat prompt bar — hidden on history tab */}
      <div className={`shrink-0 border-t border-gray-200 bg-white px-6 py-4 ${slotTab === 'history' ? 'hidden' : ''}`}>
        <div className="max-w-2xl mx-auto">
          <ChatPromptBar
            value={slotPrompt}
            onChange={onSlotPromptChange}
            onSubmit={onSuggestByPrompt}
            loading={promptLoading}
          />
        </div>
      </div>
    </>
  )
}

// ── Chat UI components ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 bg-gray-100 rounded-2xl px-4 py-3 w-fit">
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
    </div>
  )
}

function ChatPromptBar({
  value, onChange, onSubmit, loading,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function adjustHeight() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && value.trim()) onSubmit()
    }
  }

  return (
    <div>
      <div className="flex items-end gap-3 bg-gray-50 border border-gray-300 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-indigo-400 transition">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={e => { onChange(e.target.value); adjustHeight() }}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder='Ask AI — e.g. "tomorrow afternoon" or "avoid Mondays this week"'
          className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-800 placeholder-gray-400 leading-relaxed"
          style={{ minHeight: '24px', maxHeight: '160px' }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          className="shrink-0 bg-indigo-600 text-white rounded-xl p-2 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Send"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-gray-400 text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}

// ── Slot card ──────────────────────────────────────────────────────────────────

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
        {ex.professor_load_label != null && (
          <div className="col-span-2 mt-1 flex items-center gap-2 border-t border-gray-100 pt-2">
            <span className="text-gray-500">Professor load this day:</span>
            <span className={`font-semibold ${
              ex.professor_load_label === 'Light'
                ? 'text-green-600'
                : ex.professor_load_label === 'Moderate'
                ? 'text-amber-500'
                : 'text-red-500'
            }`}>
              {ex.professor_load_label}
            </span>
            <span className="text-gray-400">({ex.professor_cognitive_score}/100)</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Student History Panel ──────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-gray-100 text-gray-600',
}

const OUTCOME_COLORS: Record<string, string> = {
  APPROVED: 'text-green-600',
  DENIED: 'text-red-500',
  ESCALATED_TO_MEETING: 'text-indigo-600',
  NEEDS_MORE_INFO: 'text-amber-600',
}

function StudentHistoryPanel({ historyData, loading }: { historyData: StudentHistory | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-8 flex items-center justify-center gap-3 text-sm text-gray-400">
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce [animation-delay:300ms]" />
          <span className="ml-1">Analyzing history…</span>
        </div>
      </div>
    )
  }

  if (!historyData) {
    return <p className="text-sm text-gray-400">No history available.</p>
  }

  const totalRequests = historyData.past_requests.length
  const escalatedTickets = historyData.past_tickets.filter(t => t.shared_with_professor).length
  const resolvedTickets = historyData.past_tickets.filter(t => t.status === 'RESOLVED').length

  return (
    <div className="flex flex-col gap-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Meetings booked', value: historyData.booked_meeting_count },
          { label: 'Requests made', value: totalRequests },
          { label: 'Tickets escalated', value: escalatedTickets },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Past requests */}
      {historyData.past_requests.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past Requests</p>
          {historyData.past_requests.map((r, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_COLORS[r.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                  P{r.priority}
                </span>
                <span className="text-xs text-gray-700 truncate">{r.topic.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-medium ${
                  r.status === 'SCHEDULED' ? 'text-green-600' :
                  r.status === 'DECLINED' ? 'text-red-500' : 'text-yellow-600'
                }`}>{r.status}</span>
                <span className="text-xs text-gray-400">{r.created_at}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tickets */}
      {historyData.past_tickets.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Action Tickets ({resolvedTickets}/{historyData.past_tickets.length} resolved)
          </p>
          {historyData.past_tickets.map((t, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-700 flex-1 truncate">{t.title}</p>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  t.shared_with_professor ? 'bg-orange-100 text-orange-700' : 'bg-indigo-50 text-indigo-600'
                }`}>
                  {t.shared_with_professor ? 'Professor' : 'TA'}
                </span>
                <span className={`text-xs font-medium ${
                  t.status === 'RESOLVED' ? 'text-green-600' :
                  t.status === 'IN_PROGRESS' ? 'text-blue-500' : 'text-yellow-600'
                }`}>{t.status.replace('_', ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decisions */}
      {historyData.past_decisions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Decision Cards</p>
          {historyData.past_decisions.map((d, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-xs text-gray-700 flex-1">{d.question}</p>
              {d.outcome && (
                <span className={`text-xs font-semibold shrink-0 ${OUTCOME_COLORS[d.outcome] ?? 'text-gray-500'}`}>
                  {d.outcome.replace(/_/g, ' ')}
                </span>
              )}
              {!d.outcome && (
                <span className="text-xs text-gray-400 shrink-0">Pending</span>
              )}
            </div>
          ))}
        </div>
      )}

      {totalRequests === 0 && historyData.past_tickets.length === 0 && historyData.past_decisions.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No prior interactions with this student.</p>
      )}
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

// ── Tickets Tab ────────────────────────────────────────────────────────────────

const TICKET_STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-yellow-100 text-yellow-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  RESOLVED: 'bg-green-100 text-green-700',
}

function TicketsTab({
  students, tickets,
  studentId, onStudentChange,
  transcript, onTranscriptChange,
  onExtract, extracting,
  extractedItems, onItemChange, onItemToggleScope, onItemRemove,
  onSubmit, submitting,
  onShare, sharingId,
  onTaResolve, taResolvingId,
  msg, onClearMsg,
}: {
  students: Student[]
  tickets: Ticket[]
  studentId: number | null
  onStudentChange: (id: number | null) => void
  transcript: string
  onTranscriptChange: (v: string) => void
  onExtract: () => void
  extracting: boolean
  extractedItems: ActionItem[] | null
  onItemChange: (idx: number, field: 'title' | 'description', val: string) => void
  onItemToggleScope: (idx: number) => void
  onItemRemove: (idx: number) => void
  onSubmit: () => void
  submitting: boolean
  onShare: (id: number) => void
  sharingId: number | null
  onTaResolve: (id: number) => void
  taResolvingId: number | null
  msg: { type: 'success' | 'error'; text: string } | null
  onClearMsg: () => void
}) {
  const taOnly    = tickets.filter(t => !t.shared_with_professor)
  const shared    = tickets.filter(t =>  t.shared_with_professor)

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-6">

      {/* Toast */}
      {msg && (
        <div className={`rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-medium ${
          msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {msg.text}
          <button onClick={onClearMsg} className="ml-auto text-lg leading-none opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Create ticket from transcript */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">New Ticket from Transcript</h2>

        {/* Student selector */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Student</label>
          <select
            value={studentId ?? ''}
            onChange={e => onStudentChange(e.target.value ? Number(e.target.value) : null)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Select a student…</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
            ))}
          </select>
        </div>

        {/* Transcript input */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Paste meeting transcript</label>
          <textarea
            rows={7}
            value={transcript}
            onChange={e => onTranscriptChange(e.target.value)}
            placeholder="Paste the meeting transcript here…"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
          />
        </div>

        <button
          onClick={onExtract}
          disabled={extracting || !studentId || !transcript.trim()}
          className="self-start bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {extracting ? 'Extracting…' : 'Extract Action Items'}
        </button>

        {/* Extracted items — editable + scope-toggleable before submit */}
        {extractedItems !== null && extractedItems.length > 0 && (
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 font-medium">
                {extractedItems.length} item{extractedItems.length !== 1 ? 's' : ''} extracted — review and set who handles each:
              </p>
              <p className="text-xs text-gray-400">
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-1" />TA &nbsp;
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />Professor
              </p>
            </div>
            {extractedItems.map((item, idx) => (
              <div
                key={idx}
                className={`border rounded-lg p-3 flex flex-col gap-2 ${
                  item.shared_with_professor
                    ? 'border-orange-200 bg-orange-50'
                    : 'border-indigo-100 bg-indigo-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Scope toggle pill */}
                  <button
                    onClick={() => onItemToggleScope(idx)}
                    title="Click to toggle who handles this"
                    className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border transition ${
                      item.shared_with_professor
                        ? 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200'
                        : 'bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200'
                    }`}
                  >
                    {item.shared_with_professor ? 'Professor' : 'TA'}
                  </button>
                  <input
                    value={item.title}
                    onChange={e => onItemChange(idx, 'title', e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                    placeholder="Action title"
                  />
                  <button
                    onClick={() => onItemRemove(idx)}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none mt-0.5 transition"
                    title="Remove"
                  >×</button>
                </div>
                <textarea
                  rows={2}
                  value={item.description}
                  onChange={e => onItemChange(idx, 'description', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none bg-white"
                  placeholder="Description (optional)"
                />
              </div>
            ))}
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="self-start bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Creating…' : `Create ${extractedItems.length} Ticket${extractedItems.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>

      {/* ── Yours to Handle ── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Yours to Handle ({taOnly.length})
        </h2>
        {taOnly.length === 0 && (
          <p className="text-sm text-gray-400">No TA-only tickets.</p>
        )}
        {taOnly.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-indigo-100 shadow-sm px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{t.title}</p>
                {t.student && <p className="text-xs text-gray-500 mt-0.5">For: {t.student.name}</p>}
                {t.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>}
                {t.resolution_note && (
                  <p className="text-xs text-green-700 mt-1 italic">Note: {t.resolution_note}</p>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${TICKET_STATUS_STYLE[t.status]}`}>
                {t.status.replace('_', ' ')}
              </span>
            </div>
            {t.status !== 'RESOLVED' && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => onTaResolve(t.id)}
                  disabled={taResolvingId === t.id}
                  className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition"
                >
                  {taResolvingId === t.id ? 'Resolving…' : 'Mark Resolved'}
                </button>
                <button
                  onClick={() => onShare(t.id)}
                  disabled={sharingId === t.id}
                  className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 transition"
                >
                  {sharingId === t.id ? 'Sharing…' : 'Share to Professor'}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">{fmt(t.created_at)}</p>
          </div>
        ))}
      </div>

      {/* ── Shared with Professor ── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Shared with Professor ({shared.length})
        </h2>
        {shared.length === 0 && (
          <p className="text-sm text-gray-400">No tickets shared with the professor yet.</p>
        )}
        {shared.map(t => (
          <div key={t.id} className="bg-white rounded-xl border border-orange-100 shadow-sm px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{t.title}</p>
                {t.student && <p className="text-xs text-gray-500 mt-0.5">For: {t.student.name}</p>}
                {t.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>}
                {t.resolution_note && (
                  <div className="mt-1 bg-green-50 border border-green-100 rounded px-2 py-1">
                    <p className="text-xs text-green-700 italic">{t.resolution_note}</p>
                  </div>
                )}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${TICKET_STATUS_STYLE[t.status]}`}>
                {t.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">{fmt(t.created_at)}</p>
          </div>
        ))}
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

// ── Decision Draft Modal ──────────────────────────────────────────────────────

type DecisionDraft = {
  question_summary: string
  context: string
  ta_recommendation: string
  options: string[]
}

function DecisionDraftModal({
  notification, draft, drafting, submitting, taNote, error,
  onTaNoteChange, onRedraft, onDraftChange, onSubmit, onClose,
}: {
  notification: Notification
  draft: DecisionDraft | null
  drafting: boolean
  submitting: boolean
  taNote: string
  error: string | null
  onTaNoteChange: (v: string) => void
  onRedraft: () => void
  onDraftChange: (d: DecisionDraft | null) => void
  onSubmit: () => void
  onClose: () => void
}) {
  function updateField<K extends keyof DecisionDraft>(key: K, value: DecisionDraft[K]) {
    if (!draft) return
    onDraftChange({ ...draft, [key]: value })
  }
  function updateOption(idx: number, value: string) {
    if (!draft) return
    onDraftChange({ ...draft, options: draft.options.map((o, i) => i === idx ? value : o) })
  }
  function removeOption(idx: number) {
    if (!draft) return
    onDraftChange({ ...draft, options: draft.options.filter((_, i) => i !== idx) })
  }
  function addOption() {
    if (!draft) return
    onDraftChange({ ...draft, options: [...draft.options, ''] })
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Convert to Decision</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Send this to the professor as an async yes/no instead of booking a meeting.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Original request */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Original request from {notification.student.name}
            </p>
            <p className="text-sm text-gray-800">{notification.prompt_text}</p>
          </div>

          {/* Drafting state */}
          {drafting && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" />
              <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.15s' }} />
              <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
              <span className="text-sm text-gray-500 ml-2">Gemini drafting decision card…</span>
            </div>
          )}

          {/* Draft form */}
          {!drafting && draft && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Question for professor
                </label>
                <input
                  type="text"
                  value={draft.question_summary}
                  onChange={e => updateField('question_summary', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="One-sentence summary of the ask"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Context
                </label>
                <textarea
                  value={draft.context}
                  onChange={e => updateField('context', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Background the professor needs to decide"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Your recommendation
                </label>
                <textarea
                  value={draft.ta_recommendation}
                  onChange={e => updateField('ta_recommendation', e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="What you think they should do + why"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Options the professor will see
                  </label>
                  <button
                    type="button"
                    onClick={addOption}
                    disabled={draft.options.length >= 4}
                    className="text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                  >
                    + Add option
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={e => updateOption(idx, e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="e.g. Approve 2-day extension"
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(idx)}
                        disabled={draft.options.length <= 1}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-30 text-lg leading-none px-2"
                        aria-label="Remove option"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* TA note + redraft — secondary affordance */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Not quite right? Add context and redraft
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taNote}
                    onChange={e => onTaNoteChange(e.target.value)}
                    placeholder="e.g. Student has a documented accommodation"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={onRedraft}
                    disabled={drafting}
                    className="px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                  >
                    Redraft
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>
          )}

          {!drafting && !draft && error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || drafting || !draft}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send to Professor'}
          </button>
        </div>
      </div>
    </div>
  )
}

