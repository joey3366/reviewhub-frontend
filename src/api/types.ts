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

// --- Playback (fase 4): ritmo, días libres, pronóstico, retrospectiva ---

/** Días de la semana en minúsculas, como los espera/devuelve el backend. */
export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

/** El ritmo de visionado del usuario (1:1 con la cuenta). */
export interface PaceSettings {
  dailyMinutes: number | null     // minutos por día (modo "time")
  dailyEpisodes: number | null    // episodios por día (modo "episodes")
  skipWeekdays: Weekday[]         // días que NO se ve nada
  updatedAt: string
}

/** Un día libre/feriado: no cuenta para el plan. */
export interface Holiday {
  date: string                    // yyyy-MM-dd
  name: string | null
}

/** Qué dimensión del ritmo se usó para calcular. */
export type ForecastMode = 'time' | 'episodes'

/** El ritmo efectivo que terminó usando un cálculo (settings + overrides). */
export interface ForecastPace {
  dailyMinutes: number | null
  dailyEpisodes: number | null
  skipWeekdays: Weekday[]
  skipHolidays: boolean
}

/** Pronóstico: "si arrancás tal día, terminás tal día". */
export interface Forecast {
  mode: ForecastMode
  requiredDays: number            // días válidos necesarios para terminar
  startDate: string               // yyyy-MM-dd
  finishDate: string              // yyyy-MM-dd
  skippedDays: number             // días salteados dentro del rango
  totalCalendarDays: number       // días de calendario de punta a punta
  pace: ForecastPace
}

/** Retrospectiva: qué tan bien cumpliste el ritmo en algo ya terminado. */
export interface Retrospective {
  mode: ForecastMode
  startedAt: string               // yyyy-MM-dd (del item)
  finishedAt: string              // yyyy-MM-dd (del item)
  expectedDays: number            // días válidos que "debería" haber tomado
  actualValidDays: number         // días válidos reales en el rango
  actualSkippedDays: number       // días salteados reales en el rango
  actualCalendarDays: number      // días de calendario reales
  deviationDays: number           // actualValidDays - expectedDays (+ = más lento)
  toleranceDays: number           // margen tolerado (10% de expectedDays, mín 1)
  onPace: boolean                 // |deviationDays| <= toleranceDays
  pace: ForecastPace
}
