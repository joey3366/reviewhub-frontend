import client from './client'
import type { AuthResponse, AuthUser } from './types'

export const authApi = {
  signup: async (input: {
    email: string
    password: string
    passwordConfirmation: string
    fullName?: string
  }) => {
    const { data } = await client.post<{ data: AuthResponse }>('/auth/signup', input)
    return data.data
  },
  login: async (input: { email: string; password: string }) => {
    const { data } = await client.post<{ data: AuthResponse }>('/auth/login', input)
    return data.data
  },
  logout: async () => {
    await client.post('/account/logout')
  },
  profile: async () => {
    const { data } = await client.get<{ data: AuthUser }>('/account/profile')
    return data.data
  },
}
