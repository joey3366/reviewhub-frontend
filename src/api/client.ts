import axios, { type AxiosError } from 'axios'

const TOKEN_KEY = 'reviewhub_token'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const wasAuthenticated = !!localStorage.getItem(TOKEN_KEY)
      localStorage.removeItem(TOKEN_KEY)
      const pathname = window.location.pathname
      if (wasAuthenticated && pathname !== '/login' && pathname !== '/signup') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
