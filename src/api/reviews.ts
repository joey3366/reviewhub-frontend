import client from './client'
import type { Paginated, Review } from './types'

export interface ReviewListParams {
  page?: number
  perPage?: number
  sort?: 'recent' | 'top'
}

export interface CreateReviewInput {
  rating: number     // 1-10
  title?: string     // 3-200 chars (opcional: se puede puntuar sin reseña)
  body?: string      // 10-10000 chars (opcional)
}

export type UpdateReviewInput = Partial<CreateReviewInput>

export const reviewsApi = {
  listByContent: async (slug: string, params: ReviewListParams = {}) => {
    const { data } = await client.get<Paginated<Review>>(
      `/contents/${slug}/reviews`,
      { params }
    )
    return data
  },

  create: async (slug: string, input: CreateReviewInput) => {
    const { data } = await client.post<{ data: Review }>(
      `/contents/${slug}/reviews`,
      input
    )
    return data.data
  },

  update: async (reviewId: string, input: UpdateReviewInput) => {
    const { data } = await client.patch<{ data: Review }>(
      `/reviews/${reviewId}`,
      input
    )
    return data.data
  },

  destroy: async (reviewId: string) => {
    await client.delete(`/reviews/${reviewId}`)
  },
}
