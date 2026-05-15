// Auth helpers — small wrappers around localStorage so the rest of the code doesn't
// have to remember the exact storage keys ("access_token", "user_role") or repeat the
// same role→route mapping in multiple places.
//
// We persist the JWT in localStorage (rather than memory) so a page refresh keeps the
// user signed in. The token itself is attached to every API request automatically by
// the axios interceptor in api.ts.

// Read the JWT for the currently signed-in user. Returns null if nobody is signed in.
export function getStoredToken(): string | null {
  return localStorage.getItem('access_token')
}

// Read the role (PROFESSOR / TA / STUDENT) for the signed-in user. Used by
// ProtectedRoute to enforce role-specific pages.
export function getStoredRole(): string | null {
  return localStorage.getItem('user_role')
}

// Save the JWT + role after a successful login (called from LoginPage / JoinPage).
export function storeAuth(token: string, role: string) {
  localStorage.setItem('access_token', token)
  localStorage.setItem('user_role', role)
}

// Wipe credentials on sign-out or account deletion.
export function clearAuth() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('user_role')
}

// Map a role string to the dashboard URL that role should land on after login.
// Falls back to /login if the role is unknown (defensive — shouldn't normally happen).
export function getRolePath(role: string): string {
  const paths: Record<string, string> = {
    PROFESSOR: '/professor',
    TA: '/ta',
    STUDENT: '/student',
  }
  return paths[role] ?? '/login'
}
