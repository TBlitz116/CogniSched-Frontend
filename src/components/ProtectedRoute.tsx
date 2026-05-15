// Wrapper that guards a route based on the signed-in user's role.
//
// Usage (from App.tsx):
//   <ProtectedRoute role="STUDENT"><StudentDashboard /></ProtectedRoute>
//
// Behaviour:
//   - No token in localStorage → send to /login.
//   - Token exists but role doesn't match → send the user to *their* dashboard instead
//     (so a logged-in TA who clicks /student gets bounced to /ta rather than logged out).
//   - Otherwise render the protected children.

import { Navigate } from 'react-router-dom'
import { getStoredToken, getStoredRole, getRolePath } from '../lib/auth'

interface Props {
  role: string                  // The role this route requires (e.g. "STUDENT")
  children: React.ReactNode     // The page to render if the user is allowed in
}

export default function ProtectedRoute({ role, children }: Props) {
  const token = getStoredToken()
  const userRole = getStoredRole()

  // Not signed in at all → login page.
  if (!token) return <Navigate to="/login" replace />

  // Signed in but wrong role → redirect to whatever dashboard matches their actual role.
  if (userRole !== role) return <Navigate to={getRolePath(userRole ?? '')} replace />

  // Allowed — render the page.
  return <>{children}</>
}
