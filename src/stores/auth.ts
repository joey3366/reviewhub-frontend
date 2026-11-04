import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import type { AuthUser } from '@/api/types'

const TOKEN_KEY = 'reviewhub_token'

// Request de perfil en vuelo, compartida entre main.ts y el guard del router
// para no pedir /profile dos veces al cargar la app.
let profilePromise: Promise<void> | null = null

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
      await this.refreshProfile()
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

    /**
     * Garantiza que `user` esté cargado si hay token. Al recargar la página
     * el token sale de localStorage pero el perfil (y con él el rol) llega
     * después; sin esperar esto, el guard de admin veía isAdmin=false y
     * redirigía al catálogo.
     */
    async ensureProfile() {
      if (!this.token || this.user) return
      profilePromise ??= this.refreshProfile()
        .catch(() => this.clear())
        .finally(() => {
          profilePromise = null
        })
      await profilePromise
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
