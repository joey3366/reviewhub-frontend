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
    firstAired: string | null
    lastAired: string | null
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
  durationSeconds: number          // duración TOTAL planificada del título
  durationFormatted: string        // ej. "2h 30m" (lo arma el backend)
  episodesWatched: number | null   // episodios TOTALES de la serie
  durationProgressSeconds: number  // cuánto llevás visto (in-flight)
  episodesProgress: number | null  // cuántos episodios llevás vistos
  paceMinutes: number | null       // override de ritmo en min/día para ESTA serie
  paceEpisodes: number | null      // override de ritmo en eps/día para ESTA serie
  startedAt: string | null         // yyyy-MM-dd
  finishedAt: string | null        // yyyy-MM-dd
  daysElapsed: number | null       // calculado por el backend
  avgDaysPerEpisode: number | null
  createdAt: string
  updatedAt: string | null
  content?: WatchlistItemContent   // viene en el detalle (show), no en otros lados
  // Si el item es HEREDADO de una lista incluida, vienen estos campos:
  viaWatchlistId?: string
  viaWatchlistName?: string
}

/** Resumen de una lista incluida (hija directa) dentro del detalle del padre. */
export interface IncludedListSummary {
  id: string
  name: string
  itemsCount: number
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
  moviesCount?: number            // solo en listMine (subquery por tipo)
  seriesCount?: number            // solo en listMine (subquery por tipo)
  // Los siguientes solo vienen en el detalle (show), donde se precargan los items:
  items?: WatchlistItem[]
  totalDurationSeconds?: number
  totalDurationFormatted?: string
  includedLists?: IncludedListSummary[]  // listas hijas (solo visible al dueño)
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
  customForItem?: boolean         // true si vino del override del item (no del global)
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

/**
 * Cómo voy: chequeo in-flight (serie empezada pero NO terminada). Compara
 * cuántos días válidos pasaron desde startedAt hasta hoy contra cuánto progreso
 * llevás cargado. mismo veredicto verde/ámbar/celeste que la retrospectiva.
 */
export interface Progress {
  mode: ForecastMode
  startedAt: string                 // yyyy-MM-dd
  asOf: string                      // yyyy-MM-dd (hoy)
  validDaysElapsed: number          // días útiles desde startedAt hasta hoy
  skippedDaysElapsed: number
  calendarDaysElapsed: number
  expectedUnits: number             // mode=time: seg esperados; mode=ep: ep esperados
  actualUnits: number               // lo que cargaste (durationProgressSeconds o episodesProgress)
  equivalentDaysOfActual: number    // cuántos días "vale" tu progreso real
  deviationDays: number             // validDaysElapsed - equivalentDaysOfActual (+ = atrasada)
  toleranceDays: number
  onPace: boolean
  progressLogged: boolean           // false = no cargaste progreso aún
  pace: ForecastPace
}

/**
 * Stats agregadas de una lista entera (incluye items heredados de listas
 * incluidas). Solo dueño. `status: 'empty'` cuando no hay ningún item con
 * `startedAt` cargado — en ese caso todos los campos `*` opcionales vienen
 * null y la UI debe mostrar el empty state.
 */
export interface ListStats {
  status: 'ok' | 'empty'
  itemsCount: number           // cuántos items contribuyen (con startedAt)
  finishedCount: number        // de esos, cuántos terminaron
  inFlightCount: number        // cuántos arrancaron pero no terminaron
  inheritedCount: number       // de esos, cuántos vienen de listas incluidas
  window: {
    start: string              // yyyy-MM-dd (min de los startedAt)
    end: string                // yyyy-MM-dd (max finishedAt, o hoy si hay in-flight)
    endIsToday: boolean        // true cuando end = hoy porque hay in-flight
    calendarDays: number       // días de calendario punta a punta
    validDays: number          // descontando skipWeekdays + holidays del usuario
    skippedDays: number
  } | null
  totals: {
    durationSeconds: number    // suma de durationSeconds (finished) + durationProgress (in-flight)
    durationFormatted: string  // "HH:MM:SS"
    episodes: number           // idem para episodios
  } | null
  actualPace: {
    minutesPerValidDay: number    // entero
    episodesPerValidDay: number   // 2 decimales
  } | null
  targetPace: {                // del global "Mi ritmo"; null si nunca configuró
    dailyMinutes: number | null
    dailyEpisodes: number | null
  } | null
  comparison: {                // null si no hay target o no hay actual
    minutesMultiplier: number | null    // actualMin/targetMin (1.0 = igual, 1.3 = 30% más rápido)
    episodesMultiplier: number | null
  } | null
  contributingItems: Array<{
    id: string
    contentId: string
    title: string
    type: 'movie' | 'series'
    startedAt: string          // yyyy-MM-dd
    finishedAt: string | null  // null = in-flight
    viaWatchlistName: string | null  // null si es propio del watchlist
  }>
}

/** Retrospectiva: qué tan bien cumpliste el ritmo en algo ya terminado. */
export interface Retrospective {
  mode: ForecastMode
  startedAt: string               // yyyy-MM-dd (del item)
  finishedAt: string              // yyyy-MM-dd (del item)
  expectedDays: number            // días válidos que "debería" haber tomado
  expectedFinishDate: string      // yyyy-MM-dd — cuándo deberías haber terminado a tu ritmo
  actualValidDays: number         // días válidos reales en el rango
  actualSkippedDays: number       // días salteados reales en el rango
  actualCalendarDays: number      // días de calendario reales
  deviationDays: number           // actualValidDays - expectedDays (+ = más lento)
  toleranceDays: number           // margen tolerado (10% de expectedDays, mín 1)
  onPace: boolean                 // |deviationDays| <= toleranceDays
  pace: ForecastPace
}
