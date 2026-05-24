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
  title: string | null
  body: string | null
  createdAt: string
  updatedAt: string | null
  user?: ReviewAuthor
}

/** El contenido embebido dentro de un item de watchlist (subset liviano). */
export interface WatchlistItemContent {
  id: string
  slug: string
  title: string
  type: 'movie' | 'series'
  posterUrl: string | null
  backdropUrl: string | null
  avgRating: number | null
}

export interface WatchlistItem {
  id: string
  watchlistId: string
  contentId: string
  position: number
  durationSeconds: number
  durationFormatted: string       // ej. "2h 30m" (lo arma el backend)
  episodesWatched: number | null
  startedAt: string | null        // yyyy-MM-dd
  finishedAt: string | null       // yyyy-MM-dd
  daysElapsed: number | null      // calculado por el backend
  avgDaysPerEpisode: number | null
  createdAt: string
  updatedAt: string | null
  content?: WatchlistItemContent  // viene en el detalle (show), no en otros lados
}

export interface Watchlist {
  id: string
  name: string
  isPublic: boolean
  position: number                // orden personalizado (asc)
  userId: string
  createdAt: string
  updatedAt: string | null
  itemsCount?: number             // en list (withCount) y en show
  // Los siguientes solo vienen en el detalle (show), donde se precargan los items:
  items?: WatchlistItem[]
  totalDurationSeconds?: number
  totalDurationFormatted?: string
}
