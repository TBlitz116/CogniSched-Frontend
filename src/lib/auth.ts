export function getStoredToken(): string | null {
  return localStorage.getItem('access_token')
}

export function getStoredRole(): string | null {
  return localStorage.getItem('user_role')
}

export function storeAuth(token: string, role: string) {
  localStorage.setItem('access_token', token)
  localStorage.setItem('user_role', role)
}

export function clearAuth() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('user_role')
}

export function getRolePath(role: string): string {
  const paths: Record<string, string> = {
    PROFESSOR: '/professor',
    TA: '/ta',
    STUDENT: '/student',
  }
  return paths[role] ?? '/login'
}
