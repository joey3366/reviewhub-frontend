import client from './client'
import type { Content, Genre, Paginated } from './types'

export interface ContentListParams {
  page?: number
  perPage?: number
  genre?: string
  sort?: 'recent' | 'top'
  type?: 'movie' | 'series'
  q?: string                          // búsqueda full-text (title/originalTitle/synopsis)
  year?: number
}

export const contentApi = {
  list: async (params: ContentListParams = {}) => {
    const { data } = await client.get<Paginated<Content>>('/contents', { params })
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
