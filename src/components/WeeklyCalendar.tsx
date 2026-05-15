// A read-only 7-day calendar view used in the TA/Professor dashboards.
//
// The grid is built with absolute-positioned <div>s on top of a fixed-height column:
//   - Y position of an event is computed from its start time vs. HOUR_START.
//   - Height is computed from (end - start) in minutes.
// This means we don't need a heavy calendar library — pure CSS positioning gives us
// overlap-aware, scrollable week view.
//
// The component takes a list of events and lets the user page back/forward by weeks
// using local state (no URL/router involvement).

import { useState } from 'react'

// Shape of a calendar event passed in by the parent. `type` controls colour scheme.
interface CalEvent {
  id: string
  title: string
  start: string                              // ISO timestamp
  end: string                                // ISO timestamp
  type: 'google' | 'blocked' | 'meeting'     // google = imported from Google Calendar,
                                             // blocked = TA's busy time, meeting = booked student meeting
  meet_link?: string | null                  // Optional Google Meet URL
}

interface Props {
  events: CalEvent[]
}

// Tunable display constants — change these to widen/narrow the visible day window.
const HOUR_START = 7      // First hour shown (7am)
const HOUR_END = 21       // Last hour shown (9pm) — exclusive upper bound
const HOUR_HEIGHT = 64    // Pixels per 1-hour row

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Snap any date down to Monday 00:00 of the same week. Used so the grid always starts
// on a Monday regardless of when the user navigates.
function startOfWeek(d: Date): Date {
  const day = d.getDay()                                 // 0 = Sun … 6 = Sat
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)  // Move back to Mon (Sun rolls back 6 days)
  const mon = new Date(d)
  mon.setDate(diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

// Return a new Date n days after d (n can be negative). Doesn't mutate input.
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// "Mon, Jan 5" — used in the week-range header above the grid.
function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// Format an hour-of-day as "7 AM" / "12 PM" / "3 PM" for the left-side time column.
function fmtHour(h: number) {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

// Convert an ISO start time → pixel offset from the top of the day column.
// Events before HOUR_START get clamped to 0 (they'd render off-screen otherwise).
function topPct(iso: string): number {
  const d = new Date(iso)
  const h = d.getHours() + d.getMinutes() / 60
  return Math.max(0, (h - HOUR_START) * HOUR_HEIGHT)
}

// Convert (start, end) → pixel height for the event block.
// Enforces a 20px minimum so very short events are still tappable/visible.
function heightPx(startIso: string, endIso: string): number {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const mins = (e.getTime() - s.getTime()) / 60000
  return Math.max(20, (mins / 60) * HOUR_HEIGHT)
}

// True if `iso` falls on the same calendar day as `day`. Used to slot events into the
// right day column.
function isSameDay(iso: string, day: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  )
}

// Colour scheme per event type. Centralised so the legend below and the actual event
// blocks stay in sync.
const TYPE_STYLE: Record<string, string> = {
  google:  'bg-blue-100 border-blue-400 text-blue-800',
  blocked: 'bg-orange-100 border-orange-400 text-orange-800',
  meeting: 'bg-green-100 border-green-400 text-green-800',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyCalendar({ events }: Props) {
  // Which Monday the displayed week starts on. Initialised to "this week".
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  // Pre-compute the 7 day Dates and the list of hours to render.
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const totalHeight = hours.length * HOUR_HEIGHT

  // Today (at midnight) — used to highlight the current day column.
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Nav — Prev / week-range label / Next */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setWeekStart(d => addDays(d, -7))}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100 transition"
        >
          ← Prev
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {fmtDay(weekStart)} — {fmtDay(addDays(weekStart, 6))}
        </span>
        <button
          onClick={() => setWeekStart(d => addDays(d, 7))}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100 transition"
        >
          Next →
        </button>
      </div>

      {/* Legend — colour key for the three event types */}
      <div className="flex gap-4 px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-200 border border-blue-400 inline-block" /> Google Calendar</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-200 border border-orange-400 inline-block" /> Blocked</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-200 border border-green-400 inline-block" /> Student Meeting</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[700px]">
          {/* Left-side time column: 7 AM, 8 AM, … */}
          <div className="w-14 shrink-0 border-r border-gray-100">
            <div className="h-10 border-b border-gray-100" /> {/* spacer that lines up with day-header row */}
            <div style={{ height: totalHeight }} className="relative">
              {hours.map(h => (
                <div
                  key={h}
                  style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                  className="absolute w-full pr-2 text-right"
                >
                  <span className="text-xs text-gray-400 leading-none">{fmtHour(h)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* One column per day of the week */}
          {days.map((day, di) => {
            const isToday = day.getTime() === today.getTime()
            // Filter events down to just this day so we don't re-check every event
            // inside the inner map.
            const dayEvents = events.filter(e => isSameDay(e.start, day))

            return (
              <div key={di} className="flex-1 border-r border-gray-100 last:border-r-0 min-w-[90px]">
                {/* Day header — highlights today in indigo */}
                <div className={`h-10 border-b border-gray-100 flex items-center justify-center ${isToday ? 'bg-indigo-50' : ''}`}>
                  <span className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-gray-600'}`}>
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    <span className={`ml-1 ${isToday ? 'bg-indigo-600 text-white rounded-full px-1' : ''}`}>
                      {day.getDate()}
                    </span>
                  </span>
                </div>

                {/* Time-slot column — events are positioned absolutely on top of this */}
                <div style={{ height: totalHeight }} className="relative">
                  {/* Faint horizontal line at the top of each hour */}
                  {hours.map(h => (
                    <div
                      key={h}
                      style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                      className="absolute w-full border-t border-gray-50"
                    />
                  ))}

                  {/* Actual events */}
                  {dayEvents.map(ev => (
                    <div
                      key={ev.id}
                      style={{
                        top: topPct(ev.start),
                        height: heightPx(ev.start, ev.end),
                        left: 2,
                        right: 2,
                      }}
                      className={`absolute rounded border-l-4 px-1 py-0.5 overflow-hidden cursor-default ${TYPE_STYLE[ev.type]}`}
                      title={ev.title}
                    >
                      <p className="text-xs font-medium leading-tight truncate">{ev.title}</p>
                      <p className="text-xs opacity-70 leading-tight">
                        {new Date(ev.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {/* Booked meetings can carry a Meet link — render a small Join button */}
                      {ev.meet_link && (
                        <a
                          href={ev.meet_link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs underline opacity-80"
                        >
                          Join
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
