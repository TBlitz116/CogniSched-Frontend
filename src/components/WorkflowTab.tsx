import { useEffect, useRef, useState } from 'react'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatRole = 'user' | 'assistant'
interface ChatMsg { role: ChatRole; content: string }

interface RequestsCanvas {
  type: 'requests'
  data: { items: Array<{
    request_id: number; student_id: number; student_name: string;
    student_email: string | null; priority: number | null; topic: string | null;
    prompt_text: string; preferred_time_range: string | null; created_at: string;
  }> }
}

interface HistoryCanvas {
  type: 'history'
  data: {
    student: { id: number; name: string }
    booked_meeting_count: number
    past_requests: Array<{ priority: number; topic: string; status: string; created_at: string }>
    past_tickets: Array<{ title: string; shared_with_professor: boolean; status: string }>
    past_decisions: Array<{ question: string; outcome: string | null }>
    recommendation: string | null
    reasoning: string | null
  }
}

interface SlotsCanvas {
  type: 'slots'
  data: {
    request_id: number
    student: { id: number; name: string } | null
    prompt_text: string
    priority: number | null
    suggestions: Array<{
      slot: string; duration_minutes: number; score: number; rank: number;
      explanation?: { daily_cognitive_impact?: string; burnout_risk_after?: string; back_to_back?: boolean }
    }>
  }
}

type Canvas = RequestsCanvas | HistoryCanvas | SlotsCanvas | { type: 'action'; data: any } | null

interface ProposedAction {
  kind: 'book' | 'decline'
  request_id: number
  student_name: string
  start_time?: string
  end_time?: string
  simple?: boolean
  summary: string
}

interface ChatResponse {
  assistant_message: string
  canvas: Canvas
  proposed_action: ProposedAction | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const PRIORITY_LABEL: Record<number, string> = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' }

// ── Main ──────────────────────────────────────────────────────────────────────

export default function WorkflowTab() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: "Hi — ask me to pull up a student's history, find optimal slots, or surface the request queue. I'll work it out on the right." },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [canvas, setCanvas] = useState<Canvas>(null)
  const [pendingAction, setPendingAction] = useState<ProposedAction | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    setActionMsg(null)
    try {
      const { data } = await api.post<ChatResponse>('/ta/workflow/chat', { messages: next })
      setMessages(prev => [...prev, { role: 'assistant', content: data.assistant_message || '(no reply)' }])
      if (data.canvas) setCanvas(data.canvas)
      setPendingAction(data.proposed_action ?? null)
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.response?.data?.detail ?? e.message}` }])
    } finally {
      setSending(false)
    }
  }

  async function confirmAction() {
    if (!pendingAction || actionBusy) return
    setActionBusy(true)
    setActionMsg(null)
    try {
      if (pendingAction.kind === 'book') {
        if (!pendingAction.start_time || !pendingAction.end_time) {
          throw new Error('Action missing times')
        }
        await api.post('/ta/book', {
          request_id: pendingAction.request_id,
          start_time: pendingAction.start_time,
          end_time: pendingAction.end_time,
          simple: pendingAction.simple ?? false,
        })
        setActionMsg(`Booked ${pendingAction.student_name} for ${fmt(pendingAction.start_time)}.`)
      } else {
        await api.post(`/ta/decline/${pendingAction.request_id}`)
        setActionMsg(`Declined request from ${pendingAction.student_name}.`)
      }
      setPendingAction(null)
      setCanvas(null)
    } catch (e: any) {
      setActionMsg(`Failed: ${e?.response?.data?.detail ?? e.message}`)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] divide-x divide-gray-200 bg-white">
      {/* ── Left: Chat ────────────────────────────────────────────── */}
      <div className="flex flex-col w-[420px] shrink-0">
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'ml-auto bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-800'
              }`}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-sm text-gray-400">
              Thinking…
            </div>
          )}
        </div>
        <div className="border-t border-gray-200 p-3 bg-white">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              placeholder="Ask: 'show pending requests', 'pull up Alex's history', 'find optimal slots for request 12'…"
              className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 self-end"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Canvas ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 bg-white">
        {!canvas && !pendingAction && !actionMsg && (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            The right panel updates as the AI works.
          </div>
        )}
        {actionMsg && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            {actionMsg}
          </div>
        )}
        {canvas?.type === 'requests' && <RequestsCanvasView c={canvas as RequestsCanvas} />}
        {canvas?.type === 'history' && <HistoryCanvasView c={canvas as HistoryCanvas} />}
        {canvas?.type === 'slots' && <SlotsCanvasView c={canvas as SlotsCanvas} />}
        {pendingAction && (
          <ActionCard
            action={pendingAction}
            onConfirm={confirmAction}
            onCancel={() => setPendingAction(null)}
            busy={actionBusy}
          />
        )}
      </div>
    </div>
  )
}

// ── Canvas views ──────────────────────────────────────────────────────────────

function RequestsCanvasView({ c }: { c: RequestsCanvas }) {
  const items = c.data.items
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Pending requests ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No pending requests.</p>
      ) : (
        <div className="space-y-2">
          {items.map(r => (
            <div key={r.request_id} className="border border-gray-200 rounded-lg p-3 hover:border-indigo-300 transition">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">#{r.request_id}</span>
                {r.priority != null && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    {PRIORITY_LABEL[r.priority] ?? `P${r.priority}`}
                  </span>
                )}
                <span className="text-sm font-medium text-gray-900">{r.student_name}</span>
                {r.topic && <span className="text-xs text-gray-500">· {r.topic}</span>}
              </div>
              <p className="text-sm text-gray-700">{r.prompt_text}</p>
              <p className="text-xs text-gray-400 mt-1">{fmt(r.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryCanvasView({ c }: { c: HistoryCanvas }) {
  const d = c.data
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{d.student.name}</h2>
      <p className="text-xs text-gray-500 mb-4">{d.booked_meeting_count} meetings booked · {d.past_requests.length} past requests</p>

      {d.recommendation && (
        <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-3 mb-4">
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">AI recommendation</p>
          <p className="text-sm font-medium text-gray-900">{d.recommendation}</p>
          {d.reasoning && <p className="text-xs text-gray-700 mt-1">{d.reasoning}</p>}
        </div>
      )}

      <Section title="Past requests">
        {d.past_requests.length === 0 ? <Empty /> : d.past_requests.map((r, i) => (
          <div key={i} className="text-sm text-gray-700 py-1.5 border-b border-gray-100 flex justify-between">
            <span>{PRIORITY_LABEL[r.priority] ?? `P${r.priority}`} · {r.topic} <span className="text-gray-400">· {r.status}</span></span>
            <span className="text-xs text-gray-400">{r.created_at}</span>
          </div>
        ))}
      </Section>

      <Section title="Past tickets">
        {d.past_tickets.length === 0 ? <Empty /> : d.past_tickets.map((t, i) => (
          <div key={i} className="text-sm text-gray-700 py-1.5 border-b border-gray-100">
            {t.title} <span className="text-xs text-gray-400">· {t.status}</span>
          </div>
        ))}
      </Section>

      <Section title="Past decisions">
        {d.past_decisions.length === 0 ? <Empty /> : d.past_decisions.map((p, i) => (
          <div key={i} className="text-sm text-gray-700 py-1.5 border-b border-gray-100">
            {p.question} <span className="text-xs text-gray-400">· {p.outcome ?? 'pending'}</span>
          </div>
        ))}
      </Section>
    </div>
  )
}

function SlotsCanvasView({ c }: { c: SlotsCanvas }) {
  const d = c.data
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        Optimal slots {d.student && `for ${d.student.name}`}
      </h2>
      <p className="text-sm text-gray-600 mb-4">{d.prompt_text}</p>

      {d.suggestions.length === 0 ? (
        <p className="text-sm text-gray-500">No viable slots — the AI couldn't find a good window.</p>
      ) : (
        <div className="space-y-2">
          {d.suggestions.map(s => (
            <div key={s.rank} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">#{s.rank}</span>
                <span className="text-sm font-medium text-gray-900">{fmt(s.slot)}</span>
                <span className="text-xs text-gray-500">· {s.duration_minutes}m</span>
                <span className="ml-auto text-xs font-semibold text-indigo-700">score {s.score.toFixed(2)}</span>
              </div>
              {s.explanation && (
                <p className="text-xs text-gray-600">
                  Daily impact: {s.explanation.daily_cognitive_impact ?? '—'} · Burnout risk after: {s.explanation.burnout_risk_after ?? '—'}
                  {s.explanation.back_to_back ? ' · back-to-back' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-gray-500">
        Ask in chat: "book #1" or "decline this request" — I'll surface a confirmation here.
      </p>
    </div>
  )
}

function ActionCard({ action, onConfirm, onCancel, busy }: {
  action: ProposedAction; onConfirm: () => void; onCancel: () => void; busy: boolean
}) {
  return (
    <div className="border-2 border-amber-300 bg-amber-50 rounded-lg p-4 mt-4">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
        Confirm {action.kind}
      </p>
      <p className="text-sm text-gray-900 mb-1">
        <strong>{action.kind === 'book' ? 'Book' : 'Decline'}</strong> request from <strong>{action.student_name}</strong>
      </p>
      {action.kind === 'book' && action.start_time && action.end_time && (
        <p className="text-sm text-gray-700">{fmt(action.start_time)} → {fmt(action.end_time)}</p>
      )}
      <p className="text-xs text-gray-600 mt-1">{action.summary}</p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? 'Working…' : `Confirm ${action.kind}`}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="border border-gray-300 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</h3>
      {children}
    </div>
  )
}

function Empty() {
  return <p className="text-sm text-gray-400 italic py-1">None.</p>
}
