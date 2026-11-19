import client from './client'
import type { Franchise } from './types'

export interface FranchiseInput {
  name?: string
  description?: string | null
  backdropUrl?: string | null
  backdropFocusX?: number | null
  backdropFocusY?: number | null
  backdropFit?: 'cover' | 'contain' | null
}

/**
 * Franquicias: lectura pública (con progreso del usuario si hay sesión) y
 * CRUD solo admin. Los títulos se reemplazan en bloque con `setContents`
 * (el orden del array es el orden de la franquicia).
 */
export const franchisesApi = {
  list: async () => {
    const { data } = await client.get<{ data: Franchise[] }>('/franchises')
    return data.data
  },
  show: async (slug: string, opts: { drafts?: boolean } = {}) => {
    const { data } = await client.get<{ data: Franchise }>(`/franchises/${slug}`, {
      params: opts.drafts ? { drafts: 1 } : undefined,
    })
    return data.data
  },
  forContent: async (contentSlug: string) => {
    const { data } = await client.get<{ data: Franchise[] }>(`/contents/${contentSlug}/franchises`)
    return data.data
  },
  create: async (input: FranchiseInput & { name: string }) => {
    const { data } = await client.post<{ data: Franchise }>('/franchises', input)
    return data.data
  },
  update: async (id: string, input: FranchiseInput) => {
    const { data } = await client.patch<{ data: Franchise }>(`/franchises/${id}`, input)
    return data.data
  },
  remove: async (id: string) => {
    await client.delete(`/franchises/${id}`)
  },
  setContents: async (id: string, contentIds: string[]) => {
    await client.put(`/franchises/${id}/contents`, { contentIds })
  },
}
