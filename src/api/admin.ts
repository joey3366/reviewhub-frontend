import client from './client'
import type { Content } from './types'

/**
 * Endpoints admin-only para el catálogo (movies/series). El backend rechaza
 * con 403 si el usuario no es admin — el frontend asume que llegó acá pasando
 * por el router guard `requiresAdmin` y solo hace la llamada.
 *
 * Todos los métodos devuelven el Content actualizado (excepto destroy, que
 * devuelve 204). Los inputs son "lo que puede mandarse al backend": campos
 * opcionales pueden ser omitidos para no tocar, o `null` para limpiar.
 */

export interface CreateMovieInput {
  title: string                          // requerido
  originalTitle?: string
  synopsis?: string
  releaseYear?: number
  posterUrl?: string
  backdropUrl?: string
  runtimeMinutes?: number
  director?: string
  country?: string                       // ISO-3166 alpha-2 (ej. "AR")
  genres?: string[]                      // UUIDs
}

export type UpdateMovieInput = {
  title?: string                         // no nullable (todo content necesita título)
  originalTitle?: string | null
  synopsis?: string | null
  releaseYear?: number | null
  posterUrl?: string | null
  backdropUrl?: string | null
  runtimeMinutes?: number | null
  director?: string | null
  country?: string | null
  genres?: string[]                      // sync completo: lista vacía desvincula todos
}

export interface CreateSeriesInput {
  title: string                          // requerido
  originalTitle?: string
  synopsis?: string
  releaseYear?: number
  posterUrl?: string
  backdropUrl?: string
  seasonsCount?: number
  episodesCount?: number
  broadcastStatus?: 'announced' | 'airing' | 'ended'
  firstAired?: string                    // yyyy-MM-dd
  lastAired?: string                     // yyyy-MM-dd
  genres?: string[]
}

export type UpdateSeriesInput = {
  title?: string
  originalTitle?: string | null
  synopsis?: string | null
  releaseYear?: number | null
  posterUrl?: string | null
  backdropUrl?: string | null
  seasonsCount?: number | null
  episodesCount?: number | null
  broadcastStatus?: 'announced' | 'airing' | 'ended'
  firstAired?: string | null
  lastAired?: string | null
  genres?: string[]
}

export const adminApi = {
  createMovie: async (input: CreateMovieInput) => {
    const { data } = await client.post<{ data: Content }>('/movies', input)
    return data.data
  },

  updateMovie: async (id: string, input: UpdateMovieInput) => {
    const { data } = await client.patch<{ data: Content }>(`/movies/${id}`, input)
    return data.data
  },

  deleteMovie: async (id: string) => {
    await client.delete(`/movies/${id}`)
  },

  createSeries: async (input: CreateSeriesInput) => {
    const { data } = await client.post<{ data: Content }>('/series', input)
    return data.data
  },

  updateSeries: async (id: string, input: UpdateSeriesInput) => {
    const { data } = await client.patch<{ data: Content }>(`/series/${id}`, input)
    return data.data
  },

  deleteSeries: async (id: string) => {
    await client.delete(`/series/${id}`)
  },
}
