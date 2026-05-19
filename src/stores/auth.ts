import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import type { AuthUser } from '@/api/types'

const TOKEN_KEY = 'reviewhub_token'

interface AuthState {
  token: string | null
  user: AuthUser | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
  }),

  getters: {
    isAuthenticated: (state) => state.token !== null,
    isAdmin: (state) => state.user?.role === 'admin',
  },

  actions: {
    async signup(email: string, password: string, fullName?: string) {
      const { token, user } = await authApi.signup({
        email,
        password,
        passwordConfirmation: password,
        fullName,
      })
      this.setSession(token, user)
    },

    async login(email: string, password: string) {
      const { token, user } = await authApi.login({ email, password })
      this.setSession(token, user)
    },

    async logout() {
      try {
        await authApi.logout()
      } catch {
        // ignore; clear local state regardless
      }
      this.clear()
    },

    async refreshProfile() {
      this.user = await authApi.profile()
    },

    setSession(token: string, user: AuthUser) {
      this.token = token
      this.user = user
      localStorage.setItem(TOKEN_KEY, token)
    },

    clear() {
      this.token = null
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
