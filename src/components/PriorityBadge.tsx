// Small coloured pill that shows a meeting request's priority (P1 highest → P4 lowest).
// Priority is detected by the backend AI when a student submits a request.
//
// Used in: StudentDashboard (request list), TADashboard (request queue + workflow),
// and anywhere else we need a quick visual cue of urgency.

// Lookup table — keeps label + Tailwind classes together so adding/changing a priority
// only means editing this one place.
const CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: 'P1 · Recommendation',    className: 'bg-red-100 text-red-700 border border-red-200' },
  2: { label: 'P2 · Exam Question',     className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  3: { label: 'P3 · Exam Reflection',   className: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  4: { label: 'P4 · General',           className: 'bg-gray-100 text-gray-600 border border-gray-200' },
}

export default function PriorityBadge({ priority }: { priority: number }) {
  // Fall back to P4 styling if we get an unexpected priority value from the API.
  const cfg = CONFIG[priority] ?? CONFIG[4]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
