import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import api from '../lib/api'
import { storeAuth, getRolePath } from '../lib/auth'

export default function JoinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const inviteToken = params.get('token')

  useEffect(() => {
    if (!inviteToken) navigate('/login')
  }, [inviteToken, navigate])

  const login = useGoogleLogin({
    flow: 'auth-code',
    scope: 'openid email profile https://www.googleapis.com/auth/calendar',
    onSuccess: async ({ code }) => {
      const res = await api.post('/auth/google', {
        code,
        redirect_uri: window.location.origin,
        invite_token: inviteToken,
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
        <h1 className="text-2xl font-semibold text-gray-800">You've been invited</h1>
        <p className="text-gray-500 text-sm text-center">
          Sign in with Google to accept your invitation and join the team.
        </p>
        <button
          onClick={() => login()}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium text-gray.700 hover:bg-gray-50 transition"
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
