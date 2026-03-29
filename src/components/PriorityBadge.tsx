const CONFIG: Record<number, { label: string; className: string }> = {
  1: { label: 'P1 · Recommendation', className: 'bg-red-100 text-red-700 border border-red-200' },
  2: { label: 'P2 · Exam Question', className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  3: { label: 'P3 · Exam Reflection', className: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  4: { label: 'P4 · General', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
}

export default function PriorityBadge({ priority }: { priority: number }) {
  const cfg = CONFIG[priority] ?? CONFIG[4]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
