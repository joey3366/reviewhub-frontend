import client from './client'
import type { Paginated, Review } from './types'

export interface ReviewListParams {
  page?: number
  perPage?: number
  sort?: 'recent' | 'top'
}

export const reviewsApi = {
  listByContent: async (slug: string, params: ReviewListParams = {}) => {
    const { data } = await client.get<Paginated<Review>>(
      `/contents/${slug}/reviews`,
      { params }
    )
    return data
  },
}
