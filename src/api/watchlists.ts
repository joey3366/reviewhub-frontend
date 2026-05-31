import client from './client'
import type { Watchlist, WatchlistItem } from './types'

export interface CreateWatchlistInput {
  name: string            // 3-120 chars
  isPublic?: boolean      // default false en el backend
}

export type UpdateWatchlistInput = Partial<CreateWatchlistInput>

export interface CreateWatchlistItemInput {
  contentId: string                 // UUID del contenido
  durationSeconds?: number          // duración TOTAL planificada
  episodesWatched?: number | null   // episodios TOTALES (alimenta el pronóstico)
  durationProgressSeconds?: number  // cuánto llevás visto (in-flight)
  episodesProgress?: number | null  // cuántos episodios llevás vistos
  startedAt?: string | null         // yyyy-MM-dd
  finishedAt?: string | null        // yyyy-MM-dd
}

// En el update no se puede cambiar el contenido, solo el progreso.
export type UpdateWatchlistItemInput = Omit<CreateWatchlistItemInput, 'contentId'>

export const watchlistsApi = {
  // --- Listas ---
  listMine: async () => {
    const { data } = await client.get<{ data: Watchlist[] }>('/watchlists')
    return data.data
  },

  show: async (id: string) => {
    const { data } = await client.get<{ data: Watchlist }>(`/watchlists/${id}`)
    return data.data
  },

  create: async (input: CreateWatchlistInput) => {
    const { data } = await client.post<{ data: Watchlist }>('/watchlists', input)
    return data.data
  },

  update: async (id: string, input: UpdateWatchlistInput) => {
    const { data } = await client.patch<{ data: Watchlist }>(`/watchlists/${id}`, input)
    return data.data
  },

  destroy: async (id: string) => {
    await client.delete(`/watchlists/${id}`)
  },

  // Guarda el orden personalizado: ids en el orden deseado.
  reorder: async (ids: string[]) => {
    await client.patch('/watchlists/reorder', { ids })
  },

  // --- Items ---
  addItem: async (watchlistId: string, input: CreateWatchlistItemInput) => {
    const { data } = await client.post<{ data: WatchlistItem }>(
      `/watchlists/${watchlistId}/items`,
      input
    )
    return data.data
  },

  updateItem: async (
    watchlistId: string,
    itemId: string,
    input: UpdateWatchlistItemInput
  ) => {
    const { data } = await client.patch<{ data: WatchlistItem }>(
      `/watchlists/${watchlistId}/items/${itemId}`,
      input
    )
    return data.data
  },

  removeItem: async (watchlistId: string, itemId: string) => {
    await client.delete(`/watchlists/${watchlistId}/items/${itemId}`)
  },

  // Guarda el orden de los items: itemIds en el orden deseado.
  reorderItems: async (watchlistId: string, itemIds: string[]) => {
    await client.patch(`/watchlists/${watchlistId}/items/reorder`, { itemIds })
  },

  // --- Inclusión de listas (anidadas) ---

  /** Incluye `childId` como hija de `parentId`. Errores: 409 dup, 422 ciclo/self, 403 ajena. */
  addInclude: async (parentId: string, childId: string) => {
    const { data } = await client.post<{ data: { childId: string; name: string } }>(
      `/watchlists/${parentId}/includes`,
      { childId }
    )
    return data.data
  },

  removeInclude: async (parentId: string, childId: string) => {
    await client.delete(`/watchlists/${parentId}/includes/${childId}`)
  },
}
