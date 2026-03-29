import { Navigate } from 'react-router-dom'
import { getStoredToken, getStoredRole, getRolePath } from '../lib/auth'

interface Props {
  role: string
  children: React.ReactNode
}

export default function ProtectedRoute({ role, children }: Props) {
  const token = getStoredToken()
  const userRole = getStoredRole()

  if (!token) return <Navigate to="/login" replace />
  if (userRole !== role) return <Navigate to={getRolePath(userRole ?? '')} replace />

  return <>{children}</>
}
