// Entry point for the React app.
// Mounts <App /> into #root and wraps it with the providers the whole app needs:
//   - GoogleOAuthProvider: enables Google Sign-In hooks (used on the Login/Join pages)
//   - BrowserRouter: enables react-router routing throughout the app
//   - React.StrictMode: dev-time checks (renders components twice in dev to catch bugs)
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import './index.css'

// Google OAuth client ID, loaded from the Vite env file (.env / .env.example)
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

// Find the <div id="root"> in index.html and render the app into it
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  </React.StrictMode>,
)
