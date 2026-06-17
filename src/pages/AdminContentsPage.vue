<script setup lang="ts">
import axios from 'axios'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Content, ContentType, Paginated } from '@/api/types'
import { contentApi } from '@/api/content'
import { adminApi } from '@/api/admin'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import FormBackdrop from '@/components/ui/FormBackdrop.vue'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const router = useRouter()

const page = ref(1)
const perPage = 20
const q = ref('')
const typeFilter = ref<'all' | ContentType>('all')

const TYPE_NOUN_FEM: Record<ContentType, string> = {
  movie: 'esta película',
  series: 'esta serie',
  game: 'este juego',
}
const TYPE_LABEL: Record<ContentType, string> = {
  movie: 'Película',
  series: 'Serie',
  game: 'Juego',
}
const TYPE_PILL_CLASS: Record<ContentType, string> = {
  movie: 'bg-sky-500/15 text-sky-300',
  series: 'bg-violet-500/15 text-violet-300',
  game: 'bg-emerald-500/15 text-emerald-300',
}

const loading = ref(false)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const toDelete = ref<Content | null>(null)
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

function askDelete(c: Content) {
  toDelete.value = c
}
const deleteMessage = computed(() => {
  const c = toDelete.value
  if (!c) return ''
  return `¿Eliminar "${c.title}"? Esto borra ${TYPE_NOUN_FEM[c.type]}, sus reseñas y la quita de las listas. No se puede deshacer.`
})

async function confirmDelete() {
  const c = toDelete.value
  if (!c) return
  deletingId.value = c.id
  const title = c.title
  const label = TYPE_LABEL[c.type]
  try {
    if (c.type === 'movie') await adminApi.deleteMovie(c.id)
    else if (c.type === 'series') await adminApi.deleteSeries(c.id)
    else await adminApi.deleteGame(c.id)
    toDelete.value = null
    await load()
    toast.success(`${label} "${title}" eliminada`)
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const msg = (e.response?.data as { message?: string } | undefined)?.message
      toast.error(`No se pudo eliminar (HTTP ${status ?? '—'}${msg ? `: ${msg}` : ''}).`)
    } else {
      toast.error('No se pudo eliminar.')
    }
    console.error(e)
    toDelete.value = null
  } finally {
    deletingId.value = null
  }
}

watch(page, load)
load()
</script>

<template>
  <FormBackdrop>
    <div class="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-widest text-amber-300/70">Admin</p>
          <h1 class="mt-0.5 text-3xl font-bold text-white">Catálogo</h1>
          <p class="mt-1 text-sm text-white/60">
            Crear, editar y eliminar películas y series del catálogo.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300"
          @click="goNew"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Crear contenido
        </button>
      </header>

      <!-- Filtros -->
      <div class="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-neutral-950/70 p-4 backdrop-blur-xl">
        <label class="flex flex-1 min-w-[14rem] items-center gap-2">
          <span class="text-xs font-medium text-white/60">Buscar</span>
          <input
            v-model="q"
            type="search"
            placeholder="Título, sinopsis…"
            class="h-9 flex-1 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            @keydown.enter="onSearch"
            @blur="onSearch"
          />
        </label>
        <label class="flex items-center gap-2">
          <span class="text-xs font-medium text-white/60">Tipo</span>
          <select
            v-model="typeFilter"
            class="h-9 rounded-md border border-white/15 bg-black/30 px-2 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            @change="onTypeChange"
          >
            <option value="all" class="bg-neutral-900">Todos</option>
            <option value="movie" class="bg-neutral-900">Películas</option>
            <option value="series" class="bg-neutral-900">Series</option>
            <option value="game" class="bg-neutral-900">Juegos</option>
          </select>
        </label>
      </div>

      <!-- Error -->
      <p v-if="error" class="mb-4 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
        {{ error }}
      </p>

      <!-- Loading -->
      <div v-if="loading" class="rounded-xl border border-white/10 bg-neutral-950/70 p-12 text-center backdrop-blur-xl">
        <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
      </div>

      <!-- Vacía -->
      <div v-else-if="items.length === 0" class="rounded-xl border border-white/10 bg-neutral-950/70 p-12 text-center text-sm text-white/60 backdrop-blur-xl">
        <p>No hay contenidos para esos filtros.</p>
        <button
          v-if="q || typeFilter !== 'all'"
          type="button"
          class="mt-3 text-sm font-medium text-amber-300 hover:text-amber-200"
          @click="q = ''; typeFilter = 'all'; onSearch()"
        >
          Limpiar filtros
        </button>
      </div>

      <!-- Tabla -->
      <div v-else class="overflow-hidden rounded-xl border border-amber-400/20 bg-neutral-950/80 backdrop-blur-xl">
        <table class="min-w-full text-sm">
          <thead class="border-b border-white/10 bg-white/[0.04] text-left text-xs uppercase tracking-wide text-amber-300/70">
            <tr>
              <th class="px-4 py-3">Título</th>
              <th class="px-4 py-3">Tipo</th>
              <th class="px-4 py-3">Año</th>
              <th class="px-4 py-3">Géneros</th>
              <th class="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            <tr v-for="c in items" :key="c.id" class="transition-colors hover:bg-white/[0.04]">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="h-12 w-8 shrink-0 overflow-hidden rounded border border-white/10 bg-black/40">
                    <img
                      v-if="c.posterUrl"
                      :src="c.posterUrl"
                      :alt="c.title"
                      loading="lazy"
                      class="h-full w-full object-cover"
                    />
                  </div>
                  <div class="min-w-0">
                    <p class="truncate font-medium text-white">{{ c.title }}</p>
                    <p v-if="c.originalTitle && c.originalTitle !== c.title" class="truncate text-xs text-white/40">
                      {{ c.originalTitle }}
                    </p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="TYPE_PILL_CLASS[c.type]"
                >
                  {{ TYPE_LABEL[c.type] }}
                </span>
              </td>
              <td class="px-4 py-3 tabular-nums text-white/70">{{ c.releaseYear ?? '—' }}</td>
              <td class="px-4 py-3 text-white/60">
                <span v-if="c.genres.length === 0" class="text-white/30">—</span>
                <span v-else class="line-clamp-1">{{ c.genres.map(g => g.name).join(', ') }}</span>
              </td>
              <td class="px-4 py-3 text-right">
                <div class="inline-flex items-center gap-1">
                  <button
                    type="button"
                    class="rounded-md px-2 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    @click="goEdit(c)"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    class="rounded-md px-2 py-1 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                    :disabled="deletingId === c.id"
                    @click="askDelete(c)"
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

      <ConfirmModal
        :open="toDelete !== null"
        title="Eliminar contenido"
        :message="deleteMessage"
        confirm-label="Eliminar"
        variant="destructive"
        :loading="deletingId !== null"
        @close="toDelete = null"
        @confirm="confirmDelete"
      />

      <!-- Paginación -->
      <div v-if="meta && meta.lastPage > 1" class="mt-4 flex items-center justify-between text-sm text-white/60">
        <span>
          Página {{ meta.currentPage }} de {{ meta.lastPage }} · {{ meta.total }} total
        </span>
        <div class="flex gap-1">
          <button
            type="button"
            class="rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="meta.currentPage <= 1"
            @click="page = page - 1"
          >
            Anterior
          </button>
          <button
            type="button"
            class="rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="meta.currentPage >= meta.lastPage"
            @click="page = page + 1"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  </FormBackdrop>
</template>
