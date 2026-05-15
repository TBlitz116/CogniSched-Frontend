// Top-level router for the whole app.
//
// Each <Route> maps a URL path to a page component. Role-specific dashboards are
// wrapped in <ProtectedRoute> which redirects:
//   - to /login if the user has no token
//   - to the user's own dashboard if they're signed in but trying to view a dashboard
//     that doesn't match their role (e.g. a STUDENT visiting /professor).
//
// Public pages (Login, Join via invite, Settings) are NOT wrapped — Login/Join are
// where unauthenticated users land, and SettingsPage handles its own auth check.

import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import JoinPage from './pages/JoinPage'
import StudentDashboard from './pages/StudentDashboard'
import TADashboard from './pages/TADashboard'
import ProfessorDashboard from './pages/ProfessorDashboard'
import SettingsPage from './pages/SettingsPage'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      {/* Public — Google sign-in entry point */}
      <Route path="/login" element={<LoginPage />} />

      {/* Public — invite acceptance flow. /join?token=... is the link sent via email. */}
      <Route path="/join" element={<JoinPage />} />

      {/* Role-gated dashboards */}
      <Route
        path="/student"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ta"
        element={
          <ProtectedRoute role="TA">
            <TADashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/professor"
        element={
          <ProtectedRoute role="PROFESSOR">
            <ProfessorDashboard />
          </ProtectedRoute>
        }
      />

      {/* Shared account page — used by every role */}
      <Route path="/settings" element={<SettingsPage />} />

      {/* Anything unmatched (incl. "/") sends users to login;
          ProtectedRoute will bounce signed-in users from there to their dashboard. */}
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
