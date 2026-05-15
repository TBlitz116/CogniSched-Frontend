// Centralised Axios HTTP client used by every page/component that talks to the backend.
//
// Why a shared instance?
//   - One place to set the baseURL (so we don't repeat the API host all over the code).
//   - One place to attach the auth token via a request interceptor — every outgoing
//     request automatically gets the "Authorization: Bearer <token>" header if the user
//     is signed in. Components just call `api.get(...)` / `api.post(...)` and don't have
//     to think about auth.

import axios from 'axios'

// Create a pre-configured axios instance. VITE_API_BASE_URL is read from .env at build
// time (e.g. http://localhost:8000 in dev, the prod API URL in production).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

// Request interceptor: runs before every request leaves the browser.
// If we have a JWT in localStorage (saved at login by storeAuth in auth.ts), attach it
// as a Bearer token so the backend can identify the user.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
