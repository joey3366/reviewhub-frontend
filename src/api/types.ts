export interface AuthUser {
  id: string
  email: string
  fullName: string | null
  role: 'user' | 'admin'
  initials: string
  createdAt: string
  updatedAt: string | null
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export interface PaginationMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage: number
}

export interface Paginated<T> {
  data: T[]
  metadata: PaginationMeta
}

export interface Genre {
  id: string
  slug: string
  name: string
}

export interface Content {
  id: string
  type: 'movie' | 'series'
  slug: string
  title: string
  originalTitle: string | null
  synopsis: string | null
  releaseYear: number | null
  posterUrl: string | null
  backdropUrl: string | null
  avgRating: number | null
  reviewCount: number
  genres: Genre[]
  movie?: {
    id: string
    runtimeMinutes: number | null
    director: string | null
    country: string | null
  }
  series?: {
    id: string
    seasonsCount: number | null
    episodesCount: number | null
    broadcastStatus: string
  }
  createdAt: string
}

export interface ReviewAuthor {
  id: string
  fullName: string | null
  initials: string
}

export interface Review {
  id: string
  contentId: string
  rating: number
  title: string
  body: string
  createdAt: string
  updatedAt: string | null
  user?: ReviewAuthor
}
