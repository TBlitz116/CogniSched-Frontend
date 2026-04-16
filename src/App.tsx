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
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join" element={<JoinPage />} />
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
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
