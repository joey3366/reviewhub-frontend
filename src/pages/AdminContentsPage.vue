<script setup lang="ts">
import axios from 'axios'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Content, Paginated } from '@/api/types'
import { contentApi } from '@/api/content'
import { adminApi } from '@/api/admin'

const router = useRouter()

const page = ref(1)
const perPage = 20
const q = ref('')
const typeFilter = ref<'all' | 'movie' | 'series'>('all')

const loading = ref(false)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const data = ref<Paginated<Content> | null>(null)

const items = computed(() => data.value?.data ?? [])
const meta = computed(() => data.value?.metadata ?? null)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await contentApi.list({
      page: page.value,
      perPage,
      ...(typeFilter.value !== 'all' && { type: typeFilter.value }),
      ...(q.value.trim().length > 0 && { q: q.value.trim() }),
    })
  } catch (e) {
    error.value = 'No pudimos cargar el catálogo.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

// El input de búsqueda no dispara fetch hasta Enter/blur; los selects sí.
function onSearch() {
  page.value = 1
  load()
}
function onTypeChange() {
  page.value = 1
  load()
}

function goNew() {
  router.push({ name: 'admin-content-new' })
}
function goEdit(c: Content) {
  router.push({ name: 'admin-content-edit', params: { slug: c.slug } })
}

async function removeContent(c: Content) {
  const label = c.type === 'movie' ? 'esta película' : 'esta serie'
  const sure = window.confirm(
    `¿Eliminar "${c.title}"? Esto borra ${label}, sus reseñas y la quita de las listas. No se puede deshacer.`
  )
  if (!sure) return
  deletingId.value = c.id
  try {
    if (c.type === 'movie') await adminApi.deleteMovie(c.id)
    else await adminApi.deleteSeries(c.id)
    await load()
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const msg = (e.response?.data as { message?: string } | undefined)?.message
      error.value = `No se pudo eliminar (HTTP ${status ?? '—'}${msg ? `: ${msg}` : ''}).`
    } else {
      error.value = 'No se pudo eliminar.'
    }
    console.error(e)
  } finally {
    deletingId.value = null
  }
}

watch(page, load)
load()
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-8">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-ink-subtle">Admin</p>
        <h1 class="mt-0.5 text-2xl font-bold text-ink">Catálogo</h1>
        <p class="mt-1 text-sm text-ink-muted">
          Crear, editar y eliminar películas y series del catálogo.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
        @click="goNew"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Crear contenido
      </button>
    </header>

    <!-- Filtros -->
    <div class="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-outline bg-surface p-4">
      <label class="flex flex-1 min-w-[14rem] items-center gap-2">
        <span class="text-xs font-medium text-ink-muted">Buscar</span>
        <input
          v-model="q"
          type="search"
          placeholder="Título, sinopsis…"
          class="h-9 flex-1 rounded-md border border-outline bg-white px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          @keydown.enter="onSearch"
          @blur="onSearch"
        />
      </label>
      <label class="flex items-center gap-2">
        <span class="text-xs font-medium text-ink-muted">Tipo</span>
        <select
          v-model="typeFilter"
          class="h-9 rounded-md border border-outline bg-white px-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          @change="onTypeChange"
        >
          <option value="all">Todos</option>
          <option value="movie">Películas</option>
          <option value="series">Series</option>
        </select>
      </label>
    </div>

    <!-- Error -->
    <p v-if="error" class="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {{ error }}
    </p>

    <!-- Loading -->
    <div v-if="loading" class="rounded-lg border border-outline bg-surface p-12 text-center">
      <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-ink-subtle border-t-transparent" />
    </div>

    <!-- Vacía -->
    <div v-else-if="items.length === 0" class="rounded-lg border border-outline bg-surface p-12 text-center text-sm text-ink-muted">
      <p>No hay contenidos para esos filtros.</p>
      <button
        v-if="q || typeFilter !== 'all'"
        type="button"
        class="mt-3 text-sm font-medium text-accent hover:text-accent-hover"
        @click="q = ''; typeFilter = 'all'; onSearch()"
      >
        Limpiar filtros
      </button>
    </div>

    <!-- Tabla -->
    <div v-else class="overflow-hidden rounded-lg border border-outline bg-surface">
      <table class="min-w-full text-sm">
        <thead class="border-b border-outline bg-surface-subtle text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th class="px-4 py-3">Título</th>
            <th class="px-4 py-3">Tipo</th>
            <th class="px-4 py-3">Año</th>
            <th class="px-4 py-3">Géneros</th>
            <th class="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline">
          <tr v-for="c in items" :key="c.id" class="hover:bg-surface-subtle">
            <td class="px-4 py-3">
              <div class="flex items-center gap-3">
                <div class="h-12 w-8 shrink-0 overflow-hidden rounded bg-surface-subtle">
                  <img
                    v-if="c.posterUrl"
                    :src="c.posterUrl"
                    :alt="c.title"
                    loading="lazy"
                    class="h-full w-full object-cover"
                  />
                </div>
                <div class="min-w-0">
                  <p class="truncate font-medium text-ink">{{ c.title }}</p>
                  <p v-if="c.originalTitle && c.originalTitle !== c.title" class="truncate text-xs text-ink-subtle">
                    {{ c.originalTitle }}
                  </p>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                :class="
                  c.type === 'movie'
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-violet-100 text-violet-700'
                "
              >
                {{ c.type === 'movie' ? 'Película' : 'Serie' }}
              </span>
            </td>
            <td class="px-4 py-3 text-ink-muted">{{ c.releaseYear ?? '—' }}</td>
            <td class="px-4 py-3 text-ink-muted">
              <span v-if="c.genres.length === 0" class="text-ink-subtle">—</span>
              <span v-else class="line-clamp-1">{{ c.genres.map(g => g.name).join(', ') }}</span>
            </td>
            <td class="px-4 py-3 text-right">
              <div class="inline-flex items-center gap-1">
                <button
                  type="button"
                  class="rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                  @click="goEdit(c)"
                >
                  Editar
                </button>
                <button
                  type="button"
                  class="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  :disabled="deletingId === c.id"
                  @click="removeContent(c)"
                >
                  <span v-if="deletingId === c.id">Borrando…</span>
                  <span v-else>Eliminar</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Paginación -->
    <div v-if="meta && meta.lastPage > 1" class="mt-4 flex items-center justify-between text-sm text-ink-muted">
      <span>
        Página {{ meta.currentPage }} de {{ meta.lastPage }} · {{ meta.total }} total
      </span>
      <div class="flex gap-1">
        <button
          type="button"
          class="rounded-md border border-outline px-3 py-1.5 text-sm transition-colors hover:bg-surface-subtle disabled:opacity-50"
          :disabled="meta.currentPage <= 1"
          @click="page = page - 1"
        >
          Anterior
        </button>
        <button
          type="button"
          class="rounded-md border border-outline px-3 py-1.5 text-sm transition-colors hover:bg-surface-subtle disabled:opacity-50"
          :disabled="meta.currentPage >= meta.lastPage"
          @click="page = page + 1"
        >
          Siguiente
        </button>
      </div>
    </div>
  </div>
</template>
