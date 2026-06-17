import client from './client'
import type { Content, Genre, Paginated } from './types'

export interface ContentListParams {
  page?: number
  perPage?: number
  genres?: string[]                   // slugs; semántica OR (al menos uno)
  sort?: 'recent' | 'top'
  type?: 'movie' | 'series' | 'game'
  q?: string                          // búsqueda full-text (title/originalTitle/synopsis)
  year?: number
}

export const contentApi = {
  list: async (params: ContentListParams = {}) => {
    // Serializamos `genres` como CSV ("action,anime") porque el backend lo
    // espera así. Si no hay nada seleccionado, omitimos el param.
    const { genres, ...rest } = params
    const query: Record<string, unknown> = { ...rest }
    if (genres && genres.length > 0) query.genres = genres.join(',')
    const { data } = await client.get<Paginated<Content>>('/contents', { params: query })
    return data
  },
  show: async (slug: string) => {
    const { data } = await client.get<{ data: Content }>(`/contents/${slug}`)
    return data.data
  },
  genres: async () => {
    const { data } = await client.get<{ data: Genre[] }>('/genres')
    return data.data
  },
}
