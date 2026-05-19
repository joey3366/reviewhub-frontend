import axios from 'axios'

interface FieldError {
  field?: string
  message: string
  rule?: string
}

export function extractFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error)) return {}
  const errs = error.response?.data?.errors as FieldError[] | undefined
  if (!Array.isArray(errs)) return {}
  return Object.fromEntries(
    errs.filter((e) => e.field).map((e) => [e.field as string, e.message])
  )
}

export function extractErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Algo salió mal.'
  if (error.response?.status === 429) {
    return 'Demasiados intentos. Esperá un minuto y volvé a probar.'
  }
  const data = error.response?.data
  if (typeof data?.message === 'string') return data.message
  if (Array.isArray(data?.errors) && typeof data.errors[0]?.message === 'string') {
    return data.errors[0].message
  }
  return 'Algo salió mal. Intentá de nuevo.'
}
