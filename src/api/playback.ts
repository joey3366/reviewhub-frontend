import axios from 'axios'
import client from './client'
import type {
  Forecast,
  Holiday,
  ListStats,
  PaceSettings,
  Progress,
  Retrospective,
  Weekday,
} from './types'

export interface UpdatePaceSettingsInput {
  dailyMinutes?: number | null    // 1-1440 (o null para desactivar el modo tiempo)
  dailyEpisodes?: number | null   // 1-100  (o null para desactivar el modo episodios)
  skipWeekdays?: Weekday[]        // no puede tener los 7 días
}

export interface CreateHolidayInput {
  date: string                    // yyyy-MM-dd
  name?: string | null            // 1-120 chars, opcional
}

/**
 * Overrides opcionales del pronóstico. Si no los mandás, el backend usa tu
 * ritmo guardado. `skipWeekdays` va como CSV ("monday,sunday"); mandá "" para
 * forzar que no saltee ningún día.
 */
export interface ForecastParams {
  startDate: string               // yyyy-MM-dd (REQUERIDO)
  dailyMinutes?: number
  dailyEpisodes?: number
  skipWeekdays?: string           // CSV; "" = no saltear ninguno
  skipHolidays?: boolean          // default true
}

export type RetrospectiveParams = Omit<ForecastParams, 'startDate'>

export interface ProgressParams {
  asOf?: string                   // yyyy-MM-dd (default = hoy)
  dailyMinutes?: number
  dailyEpisodes?: number
  skipWeekdays?: string           // CSV
  skipHolidays?: boolean
}

export const playbackApi = {
  // --- Ritmo (pace settings) ---

  /** Devuelve el ritmo, o `null` si el usuario todavía no configuró uno (404). */
  getPaceSettings: async (): Promise<PaceSettings | null> => {
    try {
      const { data } = await client.get<{ data: PaceSettings }>('/account/pace-settings')
      return data.data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null
      }
      throw error
    }
  },

  updatePaceSettings: async (input: UpdatePaceSettingsInput) => {
    const { data } = await client.patch<{ data: PaceSettings }>(
      '/account/pace-settings',
      input
    )
    return data.data
  },

  // --- Días libres (holidays) ---

  listHolidays: async () => {
    const { data } = await client.get<{ data: Holiday[] }>('/account/holidays')
    return data.data
  },

  addHoliday: async (input: CreateHolidayInput) => {
    const { data } = await client.post<{ data: Holiday }>('/account/holidays', input)
    return data.data
  },

  removeHoliday: async (date: string) => {
    await client.delete(`/account/holidays/${date}`)
  },

  // --- Pronóstico / retrospectiva (por item de una lista) ---

  forecast: async (watchlistId: string, itemId: string, params: ForecastParams) => {
    const { data } = await client.get<{ data: Forecast }>(
      `/watchlists/${watchlistId}/items/${itemId}/forecast`,
      { params }
    )
    return data.data
  },

  retrospective: async (
    watchlistId: string,
    itemId: string,
    params: RetrospectiveParams = {}
  ) => {
    const { data } = await client.get<{ data: Retrospective }>(
      `/watchlists/${watchlistId}/items/${itemId}/retrospective`,
      { params }
    )
    return data.data
  },

  progress: async (watchlistId: string, itemId: string, params: ProgressParams = {}) => {
    const { data } = await client.get<{ data: Progress }>(
      `/watchlists/${watchlistId}/items/${itemId}/progress`,
      { params }
    )
    return data.data
  },

  /**
   * Stats agregadas de la lista (propios + heredados). Solo el dueño.
   * Reusa el ritmo y los feriados del usuario; no acepta overrides porque
   * aquí agregamos sobre toda la lista, no proyectamos.
   */
  listStats: async (watchlistId: string) => {
    const { data } = await client.get<{ data: ListStats }>(`/watchlists/${watchlistId}/stats`)
    return data.data
  },
}
