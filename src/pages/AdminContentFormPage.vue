<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Content, Genre } from '@/api/types'
import { contentApi } from '@/api/content'
import {
  adminApi,
  type CreateMovieInput,
  type CreateSeriesInput,
  type UpdateMovieInput,
  type UpdateSeriesInput,
} from '@/api/admin'
import ImageUploadInput from '@/components/ui/ImageUploadInput.vue'

const route = useRoute()
const router = useRouter()

const editingSlug = computed(() => (route.params.slug as string | undefined) ?? null)
const isEdit = computed(() => editingSlug.value !== null)

// El id viene del fetch en edit; lo necesitamos para el PATCH (que va por id).
const editingId = ref<string | null>(null)

const type = ref<'movie' | 'series'>('movie')

// Campos comunes
const title = ref('')
const originalTitle = ref('')
const synopsis = ref('')
const releaseYear = ref<number | null>(null)
const posterUrl = ref('')
const backdropUrl = ref('')
const selectedGenreIds = ref<string[]>([])

// Solo movie
const runtimeMinutes = ref<number | null>(null)
const director = ref('')
const country = ref('')

// Solo series
const seasonsCount = ref<number | null>(null)
const episodesCount = ref<number | null>(null)
const broadcastStatus = ref<'announced' | 'airing' | 'ended'>('announced')
const firstAired = ref('')
const lastAired = ref('')

const allGenres = ref<Genre[]>([])
const loadingInitial = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})

function fieldValue(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Normaliza un string vacío a null. En update, mandamos null para limpiar; en
// create, undefined (omitido) tampoco lo manda, pero en este form siempre
// preferimos mandar null porque la usuaria pudo haber tipado y borrado.
function nullableString(s: string): string | null {
  const trimmed = s.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function loadGenres() {
  try {
    allGenres.value = await contentApi.genres()
  } catch (e) {
    console.error(e)
  }
}

async function loadForEdit(slug: string) {
  try {
    const c = await contentApi.show(slug)
    editingId.value = c.id
    type.value = c.type
    title.value = c.title
    originalTitle.value = c.originalTitle ?? ''
    synopsis.value = c.synopsis ?? ''
    releaseYear.value = c.releaseYear
    posterUrl.value = c.posterUrl ?? ''
    backdropUrl.value = c.backdropUrl ?? ''
    selectedGenreIds.value = c.genres.map((g) => g.id)
    if (c.type === 'movie' && c.movie) {
      runtimeMinutes.value = c.movie.runtimeMinutes
      director.value = c.movie.director ?? ''
      country.value = c.movie.country ?? ''
    }
    if (c.type === 'series' && c.series) {
      seasonsCount.value = c.series.seasonsCount
      episodesCount.value = c.series.episodesCount
      broadcastStatus.value = (c.series.broadcastStatus as typeof broadcastStatus.value) ?? 'announced'
      // firstAired/lastAired no vienen en el subset embebido — quedan vacíos a
      // menos que el backend los exponga; si los mandás en blanco quedan igual.
    }
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      error.value = 'No encontramos ese contenido.'
    } else {
      error.value = 'No pudimos cargar el contenido a editar.'
    }
    console.error(e)
  }
}

onMounted(async () => {
  await loadGenres()
  if (editingSlug.value) await loadForEdit(editingSlug.value)
  loadingInitial.value = false
})

function toggleGenre(id: string) {
  const i = selectedGenreIds.value.indexOf(id)
  if (i === -1) selectedGenreIds.value.push(id)
  else selectedGenreIds.value.splice(i, 1)
}

async function submit() {
  error.value = null
  fieldErrors.value = {}
  if (title.value.trim().length < 1) {
    fieldErrors.value.title = 'El título es obligatorio.'
    return
  }
  saving.value = true
  try {
    const common = {
      title: title.value.trim(),
      originalTitle: nullableString(originalTitle.value),
      synopsis: nullableString(synopsis.value),
      releaseYear: fieldValue(releaseYear.value),
      posterUrl: nullableString(posterUrl.value),
      backdropUrl: nullableString(backdropUrl.value),
      genres: selectedGenreIds.value,
    }
    let saved: Content
    if (type.value === 'movie') {
      const movieFields = {
        runtimeMinutes: fieldValue(runtimeMinutes.value),
        director: nullableString(director.value),
        country: nullableString(country.value),
      }
      if (isEdit.value && editingId.value) {
        const payload: UpdateMovieInput = { ...common, ...movieFields }
        saved = await adminApi.updateMovie(editingId.value, payload)
      } else {
        // Create rechaza nulls explícitos; convertimos a undefined.
        const create = buildCreateMoviePayload({ ...common, ...movieFields })
        saved = await adminApi.createMovie(create)
      }
    } else {
      const seriesFields = {
        seasonsCount: fieldValue(seasonsCount.value),
        episodesCount: fieldValue(episodesCount.value),
        broadcastStatus: broadcastStatus.value,
        firstAired: nullableString(firstAired.value),
        lastAired: nullableString(lastAired.value),
      }
      if (isEdit.value && editingId.value) {
        const payload: UpdateSeriesInput = { ...common, ...seriesFields }
        saved = await adminApi.updateSeries(editingId.value, payload)
      } else {
        const create = buildCreateSeriesPayload({ ...common, ...seriesFields })
        saved = await adminApi.createSeries(create)
      }
    }
    // Redirigimos al listado para ver el cambio en contexto.
    router.push({ name: 'admin-contents' })
    void saved
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const body = e.response?.data as
        | { message?: string; errors?: Array<{ field: string; message: string }> }
        | undefined
      if (status === 422 && body?.errors) {
        for (const err of body.errors) fieldErrors.value[err.field] = err.message
      }
      error.value = body?.message ?? `Error HTTP ${status ?? '—'}`
    } else {
      error.value = 'No se pudo guardar.'
    }
    console.error(e)
  } finally {
    saving.value = false
  }
}

// El validator de create rechaza nulls explícitos (los campos opcionales
// no son `.nullable()` allá). Eliminamos las keys cuyos valores son null
// antes de mandar.
function buildCreateMoviePayload(base: {
  title: string
  originalTitle: string | null
  synopsis: string | null
  releaseYear: number | null
  posterUrl: string | null
  backdropUrl: string | null
  runtimeMinutes: number | null
  director: string | null
  country: string | null
  genres: string[]
}): CreateMovieInput {
  const out: CreateMovieInput = { title: base.title }
  if (base.originalTitle !== null) out.originalTitle = base.originalTitle
  if (base.synopsis !== null) out.synopsis = base.synopsis
  if (base.releaseYear !== null) out.releaseYear = base.releaseYear
  if (base.posterUrl !== null) out.posterUrl = base.posterUrl
  if (base.backdropUrl !== null) out.backdropUrl = base.backdropUrl
  if (base.runtimeMinutes !== null) out.runtimeMinutes = base.runtimeMinutes
  if (base.director !== null) out.director = base.director
  if (base.country !== null) out.country = base.country
  if (base.genres.length > 0) out.genres = base.genres
  return out
}

function buildCreateSeriesPayload(base: {
  title: string
  originalTitle: string | null
  synopsis: string | null
  releaseYear: number | null
  posterUrl: string | null
  backdropUrl: string | null
  seasonsCount: number | null
  episodesCount: number | null
  broadcastStatus: 'announced' | 'airing' | 'ended'
  firstAired: string | null
  lastAired: string | null
  genres: string[]
}): CreateSeriesInput {
  const out: CreateSeriesInput = { title: base.title, broadcastStatus: base.broadcastStatus }
  if (base.originalTitle !== null) out.originalTitle = base.originalTitle
  if (base.synopsis !== null) out.synopsis = base.synopsis
  if (base.releaseYear !== null) out.releaseYear = base.releaseYear
  if (base.posterUrl !== null) out.posterUrl = base.posterUrl
  if (base.backdropUrl !== null) out.backdropUrl = base.backdropUrl
  if (base.seasonsCount !== null) out.seasonsCount = base.seasonsCount
  if (base.episodesCount !== null) out.episodesCount = base.episodesCount
  if (base.firstAired !== null) out.firstAired = base.firstAired
  if (base.lastAired !== null) out.lastAired = base.lastAired
  if (base.genres.length > 0) out.genres = base.genres
  return out
}

function cancel() {
  router.push({ name: 'admin-contents' })
}

// Reseteamos campos type-específicos cuando cambia el tipo (solo en create).
watch(type, (next, prev) => {
  if (isEdit.value || next === prev) return
  if (next === 'movie') {
    seasonsCount.value = null
    episodesCount.value = null
    broadcastStatus.value = 'announced'
    firstAired.value = ''
    lastAired.value = ''
  } else {
    runtimeMinutes.value = null
    director.value = ''
    country.value = ''
  }
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-6 py-8">
    <button
      type="button"
      class="mb-6 inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      @click="cancel"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Volver al catálogo
    </button>

    <header class="mb-6">
      <p class="text-xs font-medium uppercase tracking-wide text-ink-subtle">Admin</p>
      <h1 class="mt-0.5 text-2xl font-bold text-ink">
        {{ isEdit ? 'Editar contenido' : 'Crear contenido' }}
      </h1>
    </header>

    <div v-if="loadingInitial" class="rounded-lg border border-outline bg-surface p-12 text-center">
      <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-ink-subtle border-t-transparent" />
    </div>

    <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
      <!-- Tipo (solo create) -->
      <div v-if="!isEdit" class="rounded-lg border border-outline bg-surface p-4">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Tipo</p>
        <div class="flex gap-3">
          <label class="flex items-center gap-2 text-sm">
            <input v-model="type" type="radio" value="movie" /> Película
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="type" type="radio" value="series" /> Serie
          </label>
        </div>
      </div>
      <div v-else class="rounded-lg border border-outline bg-surface-subtle p-3 text-xs text-ink-muted">
        Tipo: <span class="font-medium text-ink">{{ type === 'movie' ? 'Película' : 'Serie' }}</span>
        <span class="ml-2 text-ink-subtle">(no se puede cambiar)</span>
      </div>

      <!-- Comunes -->
      <div class="grid grid-cols-1 gap-4 rounded-lg border border-outline bg-surface p-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 sm:col-span-2">
          <span class="text-sm font-medium text-ink">Título <span class="text-red-600">*</span></span>
          <input
            v-model="title"
            type="text"
            required
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <span v-if="fieldErrors.title" class="text-xs text-red-600">{{ fieldErrors.title }}</span>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Título original</span>
          <input
            v-model="originalTitle"
            type="text"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Año</span>
          <input
            v-model.number="releaseYear"
            type="number"
            min="1888"
            max="2099"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex flex-col gap-1.5 sm:col-span-2">
          <span class="text-sm font-medium text-ink">Sinopsis</span>
          <textarea
            v-model="synopsis"
            rows="4"
            class="rounded-md border border-outline bg-white px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>

      <!-- Carátulas: upload directo a Cloudinary o pegar URL externa -->
      <div class="rounded-lg border border-outline bg-surface p-4">
        <p class="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">Carátulas</p>
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ImageUploadInput
            v-model="posterUrl"
            label="Poster (vertical, 2:3)"
            folder="reviewhub/covers/posters"
            aspect-class="aspect-[2/3]"
          />
          <ImageUploadInput
            v-model="backdropUrl"
            label="Backdrop (horizontal, 16:9)"
            folder="reviewhub/covers/backdrops"
            aspect-class="aspect-video"
          />
        </div>
        <p class="mt-3 text-xs text-ink-subtle">
          Tip: si la URL externa no permite carga cross-origin podés envolverla con weserv:
          <code class="rounded bg-surface-subtle px-1 text-ink">https://wsrv.nl/?url=…</code>
        </p>
      </div>

      <!-- Solo película -->
      <div v-if="type === 'movie'" class="grid grid-cols-1 gap-4 rounded-lg border border-outline bg-surface p-4 sm:grid-cols-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Duración (min)</span>
          <input
            v-model.number="runtimeMinutes"
            type="number"
            min="1"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Director</span>
          <input
            v-model="director"
            type="text"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">País (ISO 2)</span>
          <input
            v-model="country"
            type="text"
            maxlength="2"
            placeholder="AR"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm uppercase text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>

      <!-- Solo serie -->
      <div v-else class="grid grid-cols-1 gap-4 rounded-lg border border-outline bg-surface p-4 sm:grid-cols-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Temporadas</span>
          <input
            v-model.number="seasonsCount"
            type="number"
            min="1"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Episodios (total)</span>
          <input
            v-model.number="episodesCount"
            type="number"
            min="1"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Estado</span>
          <select
            v-model="broadcastStatus"
            class="h-10 rounded-md border border-outline bg-white px-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="announced">Anunciada</option>
            <option value="airing">En emisión</option>
            <option value="ended">Finalizada</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Primer aire</span>
          <input
            v-model="firstAired"
            type="date"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-ink">Último aire</span>
          <input
            v-model="lastAired"
            type="date"
            class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>

      <!-- Géneros (multi-select tipo pills) -->
      <div class="rounded-lg border border-outline bg-surface p-4">
        <p class="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Géneros</p>
        <div v-if="allGenres.length === 0" class="text-xs text-ink-subtle">
          No hay géneros configurados.
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <button
            v-for="g in allGenres"
            :key="g.id"
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            :class="
              selectedGenreIds.includes(g.id)
                ? 'border-accent bg-accent text-white'
                : 'border-outline bg-white text-ink-muted hover:border-accent hover:text-accent'
            "
            @click="toggleGenre(g.id)"
          >
            {{ g.name }}
          </button>
        </div>
        <p v-if="selectedGenreIds.length > 10" class="mt-2 text-xs text-red-600">
          Máximo 10 géneros.
        </p>
      </div>

      <!-- Error general -->
      <p v-if="error" class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {{ error }}
      </p>

      <!-- Acciones -->
      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="h-10 rounded-md border border-outline px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle"
          :disabled="saving"
          @click="cancel"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="saving || selectedGenreIds.length > 10"
        >
          <span v-if="saving" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {{ isEdit ? 'Guardar cambios' : 'Crear' }}
        </button>
      </div>
    </form>
  </div>
</template>
