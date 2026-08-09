import { create } from 'zustand'
import type { CurrentUser } from '@chunkforge/api/client'
import { api } from '../api'

/**
 * Who is signed in, and what they are allowed to do.
 *
 * The capability flags come from the server rather than being re-derived here
 * from the role. The panel and the UI must agree about what "admin" implies —
 * if they disagree the visible failure is a button that exists and then 403s,
 * so there is exactly one place that decides, and it is the side that enforces.
 */
interface SessionState {
  user: CurrentUser | null
  loaded: boolean
  refresh: () => Promise<CurrentUser | null>
  clear: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  loaded: false,
  refresh: async () => {
    try {
      const user = await api().auth.me()
      set({ user, loaded: true })
      return user
    } catch {
      set({ user: null, loaded: true })
      return null
    }
  },
  clear: () => set({ user: null, loaded: true })
}))
