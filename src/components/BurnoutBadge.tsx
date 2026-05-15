// Small coloured pill that shows the cognitive-load / burnout risk level the backend
// estimates for a TA or a scheduling slot (LOW / MEDIUM / HIGH).
// Sits alongside PriorityBadge in lists where we want both signals at a glance.

const CONFIG: Record<string, { className: string }> = {
  LOW:    { className: 'bg-green-100 text-green-700 border border-green-200' },
  MEDIUM: { className: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  HIGH:   { className: 'bg-red-100 text-red-700 border border-red-200' },
}

export default function BurnoutBadge({ risk }: { risk: string }) {
  // Default to LOW styling if the API sends an unexpected value.
  const cfg = CONFIG[risk] ?? CONFIG['LOW']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.className}`}>
      {risk} RISK
    </span>
  )
}
