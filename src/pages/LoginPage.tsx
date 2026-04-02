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
    <div className="min-h-screen flex">
      {/* Left — Branding */}
      <div className="hidden md:flex w-1/2 bg-gradient-to-br from-indigo-600 to-blue-700 flex-col justify-center items-center px-12 text-white relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 border border-white/30 rounded-full" />
          <div className="absolute bottom-16 right-16 w-96 h-96 border border-white/20 rounded-full" />
          <div className="absolute top-1/2 left-1/3 w-40 h-40 border border-white/20 rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center gap-6">
          {/* Logo */}
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="16" r="2" />
            </svg>
          </div>

          <h1 className="text-4xl font-bold tracking-tight">CogniSched</h1>
          <p className="text-lg text-blue-100 max-w-sm leading-relaxed">
            AI-powered cognitive load optimized meeting coordination
          </p>

          {/* Feature highlights */}
          <div className="flex flex-col gap-3 mt-4 text-sm text-blue-100">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              Smart scheduling with burnout prevention
            </div>
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              Google Calendar + Meet integration
            </div>
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              Natural language AI scheduling
            </div>
          </div>
        </div>
      </div>

      {/* Right — Login */}
      <div className="w-full md:w-1/2 flex flex-col justify-center items-center px-8 bg-white">
        <div className="w-full max-w-sm flex flex-col gap-8">
          {/* Mobile only branding */}
          <div className="md:hidden text-center">
            <h1 className="text-2xl font-bold text-indigo-600">CogniSched</h1>
            <p className="text-sm text-gray-500 mt-1">AI-powered meeting coordination</p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Welcome</h2>
            <p className="text-gray-500 text-sm mt-2">
              Sign in to manage your meetings and schedule
            </p>
          </div>

          <button
            onClick={() => login()}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-xl px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition shadow-sm"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              className="w-5 h-5"
              alt="Google"
            />
            Sign in with Google
          </button>

          <div className="text-center">
            <p className="text-xs text-gray-400">
              By signing in, you agree to grant calendar access for scheduling.
            </p>
          </div>

          {/* Role info */}
          <div className="border-t border-gray-100 pt-6">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">How it works</p>
            <div className="flex flex-col gap-2 text-sm text-gray-500">
              <div className="flex items-start gap-2">
                <span className="text-indigo-500 font-semibold mt-0.5">P</span>
                <span>Professors sign up directly and invite TAs</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-blue-500 font-semibold mt-0.5">T</span>
                <span>TAs join via invite and manage student meetings</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-500 font-semibold mt-0.5">S</span>
                <span>Students join via invite and request meetings</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
