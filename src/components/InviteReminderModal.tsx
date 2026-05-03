interface Props {
  open: boolean
  role: 'professor' | 'ta'
  onClose: () => void
  onInvite: () => void
}

export default function InviteReminderModal({ open, role, onClose, onInvite }: Props) {
  if (!open) return null

  const isProfessor = role === 'professor'
  const title = isProfessor ? 'Invite a TA to get started' : 'Invite a student to get started'
  const body = isProfessor
    ? "You don't have any TAs yet. Invite one so they can start handling student meeting requests for you."
    : "You don't have any students yet. Invite one so they can start sending you meeting requests."
  const cta = isProfessor ? 'Invite TA' : 'Invite Student'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-md w-full p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="bg-indigo-50 text-indigo-600 rounded-full p-2 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">{body}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 px-4 py-2 transition"
          >
            Later
          </button>
          <button
            onClick={onInvite}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  )
}
