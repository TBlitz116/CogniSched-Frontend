import { useState } from 'react'

interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  type: 'google' | 'blocked' | 'meeting'
  meet_link?: string | null
}

interface Props {
  events: CalEvent[]
}

const HOUR_START = 7   // 7am
const HOUR_END = 21    // 9pm
const HOUR_HEIGHT = 64 // px per hour

function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Mon
  const mon = new Date(d)
  mon.setDate(diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtDay(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtHour(h: number) {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function topPct(iso: string): number {
  const d = new Date(iso)
  const h = d.getHours() + d.getMinutes() / 60
  return Math.max(0, (h - HOUR_START) * HOUR_HEIGHT)
}

function heightPx(startIso: string, endIso: string): number {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const mins = (e.getTime() - s.getTime()) / 60000
  return Math.max(20, (mins / 60) * HOUR_HEIGHT)
}

function isSameDay(iso: string, day: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  )
}

const TYPE_STYLE: Record<string, string> = {
  google:  'bg-blue-100 border-blue-400 text-blue-800',
  blocked: 'bg-orange-100 border-orange-400 text-orange-800',
  meeting: 'bg-green-100 border-green-400 text-green-800',
}

export default function WeeklyCalendar({ events }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)
  const totalHeight = hours.length * HOUR_HEIGHT

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Nav */}
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

      {/* Legend */}
      <div className="flex gap-4 px-4 py-2 border-b border-gray-100 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-200 border border-blue-400 inline-block" /> Google Calendar</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-200 border border-orange-400 inline-block" /> Blocked</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-200 border border-green-400 inline-block" /> Student Meeting</span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="flex min-w-[700px]">
          {/* Time column */}
          <div className="w-14 shrink-0 border-r border-gray-100">
            <div className="h-10 border-b border-gray-100" /> {/* day header spacer */}
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

          {/* Day columns */}
          {days.map((day, di) => {
            const isToday = day.getTime() === today.getTime()
            const dayEvents = events.filter(e => isSameDay(e.start, day))

            return (
              <div key={di} className="flex-1 border-r border-gray-100 last:border-r-0 min-w-[90px]">
                {/* Day header */}
                <div className={`h-10 border-b border-gray-100 flex items-center justify-center ${isToday ? 'bg-indigo-50' : ''}`}>
                  <span className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-gray-600'}`}>
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    <span className={`ml-1 ${isToday ? 'bg-indigo-600 text-white rounded-full px-1' : ''}`}>
                      {day.getDate()}
                    </span>
                  </span>
                </div>

                {/* Time slots */}
                <div style={{ height: totalHeight }} className="relative">
                  {/* Hour lines */}
                  {hours.map(h => (
                    <div
                      key={h}
                      style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                      className="absolute w-full border-t border-gray-50"
                    />
                  ))}

                  {/* Events */}
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
