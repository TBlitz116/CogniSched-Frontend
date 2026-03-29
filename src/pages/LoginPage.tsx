import { useGoogleLogin } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { storeAuth, getRolePath } from '../lib/auth'

export default function LoginPage() {
  const navigate = useNavigate()

  const login = useGoogleLogin({
    flow: 'auth-code',
    scope: 'openid email profile https://www.googleapis.com/auth/calendar',
    onSuccess: async ({ code }) => {
      const res = await api.post('/auth/google', {
        code,
        redirect_uri: window.location.origin,
      })
      storeAuth(res.data.access_token, res.data.role)
      navigate(getRolePath(res.data.role))
    },
    onError: () => {
      alert('Google sign-in failed. Please try again.')
    },
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-md p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-gray-800">Scheduler</h1>
        <p className="text-gray-500 text-sm text-center">
          AI-powered meeting coordination for your course team
        </p>
        <button
          onClick={() => login()}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <img
            src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
            className="w-5 h-5"
            alt="Google"
          />
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
