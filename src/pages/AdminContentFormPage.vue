<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Content, ContentType, GamePlatform, Genre } from '@/api/types'
import { contentApi } from '@/api/content'
import {
  adminApi,
  GAME_PLATFORMS,
  GAME_PLATFORM_LABELS,
  type CreateGameInput,
  type CreateMovieInput,
  type CreateSeriesInput,
  type UpdateGameInput,
  type UpdateMovieInput,
  type UpdateSeriesInput,
} from '@/api/admin'
import ImageUploadInput from '@/components/ui/ImageUploadInput.vue'
import DateField from '@/components/ui/DateField.vue'
import GenreManagerModal from '@/components/admin/GenreManagerModal.vue'
import FormBackdrop from '@/components/ui/FormBackdrop.vue'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const route = useRoute()
const router = useRouter()

const editingSlug = computed(() => (route.params.slug as string | undefined) ?? null)
const isEdit = computed(() => editingSlug.value !== null)

// El id viene del fetch en edit; lo necesitamos para el PATCH (que va por id).
const editingId = ref<string | null>(null)

const type = ref<ContentType>('movie')

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

// Solo juego
const hltbHours = ref<number | null>(null)
const developer = ref('')
const publisher = ref('')
const platforms = ref<GamePlatform[]>([])

const TYPE_LABEL: Record<ContentType, string> = {
  movie: 'Película',
  series: 'Serie',
  game: 'Juego',
}

const allGenres = ref<Genre[]>([])

// Géneros aplicables al tipo activo. Un género se muestra si su appliesTo
// es 'all' o coincide con el type seleccionado. Cuando el admin cambia de
// tipo en create, desmarcamos los géneros que ya no aplican.
const availableGenres = computed(() =>
  allGenres.value.filter((g) => g.appliesTo === 'all' || g.appliesTo === type.value)
)
const loadingInitial = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const fieldErrors = ref<Record<string, string>>({})

// Estado del mini-form "Nuevo género". Cuando addingGenre = true, se muestra
// el input inline en lugar del botón "+ Nuevo género".
const addingGenre = ref(false)
const newGenreName = ref('')
const creatingGenre = ref(false)
const newGenreError = ref<string | null>(null)

// Modal "Gestionar géneros": rename + delete. Se sincroniza con allGenres y
// limpia selectedGenreIds cuando se elimina uno que estaba marcado.
const genreManagerOpen = ref(false)
function onGenreUpdated(updated: Genre) {
  allGenres.value = allGenres.value
    .map((g) => (g.id === updated.id ? updated : g))
    .sort((a, b) => a.name.localeCompare(b.name))
}
function onGenreDeleted(id: string) {
  allGenres.value = allGenres.value.filter((g) => g.id !== id)
  selectedGenreIds.value = selectedGenreIds.value.filter((gid) => gid !== id)
}

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

// Carga el Content a TODOS los refs del form. Usada tanto al entrar a editar
// (con el resultado de GET /contents/:slug) como al guardar (con el Content
// que devuelve el PATCH, para mantener la vista en sync sin recargar).
function applyContentToForm(c: Content) {
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
    firstAired.value = c.series.firstAired ?? ''
    lastAired.value = c.series.lastAired ?? ''
  }
  if (c.type === 'game' && c.game) {
    hltbHours.value = c.game.hltbHours
    developer.value = c.game.developer ?? ''
    publisher.value = c.game.publisher ?? ''
    platforms.value = [...c.game.platforms]
  }
}

function togglePlatform(p: GamePlatform) {
  const i = platforms.value.indexOf(p)
  if (i === -1) platforms.value.push(p)
  else platforms.value.splice(i, 1)
}

async function loadForEdit(slug: string) {
  try {
    const c = await contentApi.show(slug)
    applyContentToForm(c)
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

function startAddGenre() {
  addingGenre.value = true
  newGenreName.value = ''
  newGenreError.value = null
}

function cancelAddGenre() {
  addingGenre.value = false
  newGenreName.value = ''
  newGenreError.value = null
}

async function submitNewGenre() {
  const name = newGenreName.value.trim()
  if (name.length === 0) {
    newGenreError.value = 'Escribí un nombre.'
    return
  }
  // Si ya existe uno con el mismo nombre (insensible a caso), solo lo seleccionamos
  // — evita crear duplicados a propósito desde el form.
  const existing = allGenres.value.find((g) => g.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    if (!selectedGenreIds.value.includes(existing.id)) selectedGenreIds.value.push(existing.id)
    cancelAddGenre()
    return
  }
  creatingGenre.value = true
  newGenreError.value = null
  try {
    // Quick-create desde el form: el género se asocia al tipo actual. Si la
    // admin quiere uno universal, lo edita después desde "Gestionar".
    const created = await adminApi.createGenre({ name, appliesTo: type.value })
    // Insertamos manteniendo el orden alfabético del listado original.
    allGenres.value = [...allGenres.value, created].sort((a, b) => a.name.localeCompare(b.name))
    selectedGenreIds.value.push(created.id)
    cancelAddGenre()
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const body = e.response?.data as { message?: string } | undefined
      newGenreError.value = body?.message ?? `Error HTTP ${e.response?.status ?? '—'}`
    } else {
      newGenreError.value = 'No se pudo crear el género.'
    }
    console.error(e)
  } finally {
    creatingGenre.value = false
  }
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
    } else if (type.value === 'series') {
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
    } else {
      const gameFields = {
        hltbHours: fieldValue(hltbHours.value),
        developer: nullableString(developer.value),
        publisher: nullableString(publisher.value),
        // Lista vacía la mandamos como null en update para limpiar; en create
        // omitimos la key.
        platforms: platforms.value.length > 0 ? [...platforms.value] : null,
      }
      if (isEdit.value && editingId.value) {
        const payload: UpdateGameInput = { ...common, ...gameFields }
        saved = await adminApi.updateGame(editingId.value, payload)
      } else {
        const create = buildCreateGamePayload({ ...common, ...gameFields })
        saved = await adminApi.createGame(create)
      }
    }
    if (isEdit.value) {
      // En edit nos quedamos en la página: aplicamos lo que devolvió el
      // backend al form (importa cuando el backend normaliza algo, ej. el
      // country en mayúsculas) y avisamos con un toast.
      applyContentToForm(saved)
      toast.success('Cambios guardados')
    } else {
      // En create sí redirigimos al listado: ahí se ve el nuevo contenido en
      // su contexto y la admin puede seguir agregando o editando otros.
      toast.success('Contenido creado')
      router.push({ name: 'admin-contents' })
    }
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

function buildCreateGamePayload(base: {
  title: string
  originalTitle: string | null
  synopsis: string | null
  releaseYear: number | null
  posterUrl: string | null
  backdropUrl: string | null
  hltbHours: number | null
  developer: string | null
  publisher: string | null
  platforms: GamePlatform[] | null
  genres: string[]
}): CreateGameInput {
  const out: CreateGameInput = { title: base.title }
  if (base.originalTitle !== null) out.originalTitle = base.originalTitle
  if (base.synopsis !== null) out.synopsis = base.synopsis
  if (base.releaseYear !== null) out.releaseYear = base.releaseYear
  if (base.posterUrl !== null) out.posterUrl = base.posterUrl
  if (base.backdropUrl !== null) out.backdropUrl = base.backdropUrl
  if (base.hltbHours !== null) out.hltbHours = base.hltbHours
  if (base.developer !== null) out.developer = base.developer
  if (base.publisher !== null) out.publisher = base.publisher
  if (base.platforms !== null && base.platforms.length > 0) out.platforms = base.platforms
  if (base.genres.length > 0) out.genres = base.genres
  return out
}

function cancel() {
  router.push({ name: 'admin-contents' })
}

// Si la serie no está "finalizada", no tiene sentido tener fecha de último aire:
// si la usuaria cambia el estado a 'announced'/'airing', limpiamos el campo para
// que al guardar se mande null y el backend deje de exponerlo.
watch(broadcastStatus, (next) => {
  if (next !== 'ended') lastAired.value = ''
})

// Reseteamos campos type-específicos cuando cambia el tipo (solo en create).
// También desmarcamos géneros que no aplican al nuevo tipo.
watch(type, (next, prev) => {
  if (isEdit.value || next === prev) return
  // Limpia los géneros del tipo anterior que NO sean universales.
  selectedGenreIds.value = selectedGenreIds.value.filter((id) => {
    const g = allGenres.value.find((x) => x.id === id)
    return g && (g.appliesTo === 'all' || g.appliesTo === next)
  })
  if (next === 'movie') {
    seasonsCount.value = null
    episodesCount.value = null
    broadcastStatus.value = 'announced'
    firstAired.value = ''
    lastAired.value = ''
    hltbHours.value = null
    developer.value = ''
    publisher.value = ''
    platforms.value = []
  } else if (next === 'series') {
    runtimeMinutes.value = null
    director.value = ''
    country.value = ''
    hltbHours.value = null
    developer.value = ''
    publisher.value = ''
    platforms.value = []
  } else {
    runtimeMinutes.value = null
    director.value = ''
    country.value = ''
    seasonsCount.value = null
    episodesCount.value = null
    broadcastStatus.value = 'announced'
    firstAired.value = ''
    lastAired.value = ''
  }
})
</script>

<template>
  <FormBackdrop>
    <div class="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <button
        type="button"
        class="mb-6 inline-flex items-center gap-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
        @click="cancel"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Volver al catálogo
      </button>

      <div class="card-glow rounded-2xl border border-amber-400/30 bg-neutral-950/85 p-6 backdrop-blur-xl sm:p-8">
        <header class="mb-6">
          <p class="text-xs font-medium uppercase tracking-widest text-amber-300/70">Admin</p>
          <h1 class="mt-0.5 text-2xl font-bold text-white">
            {{ isEdit ? 'Editar contenido' : 'Crear contenido' }}
          </h1>
        </header>

        <div v-if="loadingInitial" class="rounded-lg border border-white/10 bg-white/[0.04] p-12 text-center">
          <span class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
        </div>

        <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
          <!-- Tipo (solo create) -->
          <div v-if="!isEdit" class="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-amber-300/70">Tipo</p>
            <div class="flex flex-wrap gap-3">
              <label class="flex items-center gap-2 text-sm text-white/80">
                <input v-model="type" type="radio" value="movie" class="accent-amber-400" /> Película
              </label>
              <label class="flex items-center gap-2 text-sm text-white/80">
                <input v-model="type" type="radio" value="series" class="accent-amber-400" /> Serie
              </label>
              <label class="flex items-center gap-2 text-sm text-white/80">
                <input v-model="type" type="radio" value="game" class="accent-amber-400" /> Juego
              </label>
            </div>
          </div>
          <div v-else class="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/60">
            Tipo: <span class="font-medium text-white">{{ TYPE_LABEL[type] }}</span>
            <span class="ml-2 text-white/40">(no se puede cambiar)</span>
          </div>

          <!-- Comunes -->
          <div class="grid grid-cols-1 gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5 sm:col-span-2">
              <span class="text-sm font-medium text-white">Título <span class="text-red-400">*</span></span>
              <input
                v-model="title"
                type="text"
                required
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <span v-if="fieldErrors.title" class="text-xs text-red-300">{{ fieldErrors.title }}</span>
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Título original</span>
              <input
                v-model="originalTitle"
                type="text"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Año</span>
              <input
                v-model.number="releaseYear"
                type="number"
                min="1888"
                max="2099"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 [color-scheme:dark]"
              />
            </label>
            <label class="flex flex-col gap-1.5 sm:col-span-2">
              <span class="text-sm font-medium text-white">Sinopsis</span>
              <textarea
                v-model="synopsis"
                rows="4"
                class="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
          </div>

          <!-- Carátulas: upload directo a Cloudinary o pegar URL externa -->
          <div class="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-amber-300/70">Carátulas</p>
            <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <ImageUploadInput
                v-model="posterUrl"
                label="Poster (vertical, 2:3)"
                folder="reviewhub/covers/posters"
                aspect-class="aspect-[2/3]"
                variant="dark"
              />
              <ImageUploadInput
                v-model="backdropUrl"
                label="Backdrop (horizontal, 16:9)"
                folder="reviewhub/covers/backdrops"
                aspect-class="aspect-video"
                variant="dark"
              />
            </div>
          </div>

          <!-- Solo película -->
          <div v-if="type === 'movie'" class="grid grid-cols-1 gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Duración (min)</span>
              <input
                v-model.number="runtimeMinutes"
                type="number"
                min="1"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 [color-scheme:dark]"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Director</span>
              <input
                v-model="director"
                type="text"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">País (ISO 2)</span>
              <input
                v-model="country"
                type="text"
                maxlength="2"
                placeholder="AR"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm uppercase text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
          </div>

          <!-- Solo serie -->
          <div v-else-if="type === 'series'" class="grid grid-cols-1 gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-3">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Temporadas</span>
              <input
                v-model.number="seasonsCount"
                type="number"
                min="1"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 [color-scheme:dark]"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Episodios (total)</span>
              <input
                v-model.number="episodesCount"
                type="number"
                min="1"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 [color-scheme:dark]"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Estado</span>
              <select
                v-model="broadcastStatus"
                class="h-10 rounded-md border border-white/15 bg-black/30 px-2 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="announced" class="bg-neutral-900">Anunciada</option>
                <option value="airing" class="bg-neutral-900">En emisión</option>
                <option value="ended" class="bg-neutral-900">Finalizada</option>
              </select>
            </label>
            <div class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Primer aire</span>
              <DateField v-model="firstAired" variant="dark" placeholder="Elegir fecha" aria-label="Primer aire" />
            </div>
            <div v-if="broadcastStatus === 'ended'" class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Último aire</span>
              <DateField v-model="lastAired" variant="dark" placeholder="Elegir fecha" aria-label="Último aire" />
            </div>
          </div>

          <!-- Solo juego -->
          <div v-else class="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-white">Horas (HLTB)</span>
                <input
                  v-model.number="hltbHours"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="ej. 35.5"
                  class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 [color-scheme:dark]"
                />
                <span class="text-[11px] text-white/40">Main Story (HowLongToBeat)</span>
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-white">Developer</span>
                <input
                  v-model="developer"
                  type="text"
                  class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-white">Publisher</span>
                <input
                  v-model="publisher"
                  type="text"
                  class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </label>
            </div>
            <div>
              <p class="mb-2 text-sm font-medium text-white">Plataformas</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="p in GAME_PLATFORMS"
                  :key="p"
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                  :class="
                    platforms.includes(p)
                      ? 'border-amber-400 bg-amber-400 text-black shadow-md shadow-amber-500/20'
                      : 'border-white/15 bg-white/[0.04] text-white/70 hover:border-amber-400/60 hover:text-amber-300'
                  "
                  @click="togglePlatform(p)"
                >
                  {{ GAME_PLATFORM_LABELS[p] }}
                </button>
              </div>
            </div>
          </div>

          <!-- Géneros (multi-select tipo pills) -->
          <div class="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-medium uppercase tracking-wide text-amber-300/70">Géneros</p>
              <button
                v-if="allGenres.length > 0"
                type="button"
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
                @click="genreManagerOpen = true"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Gestionar
              </button>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="g in availableGenres"
                :key="g.id"
                type="button"
                class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                :class="
                  selectedGenreIds.includes(g.id)
                    ? 'border-amber-400 bg-amber-400 text-black shadow-md shadow-amber-500/20'
                    : 'border-white/15 bg-white/[0.04] text-white/70 hover:border-amber-400/60 hover:text-amber-300'
                "
                @click="toggleGenre(g.id)"
              >
                {{ g.name }}
              </button>
              <button
                v-if="!addingGenre"
                type="button"
                class="rounded-full border border-dashed border-white/20 px-3 py-1 text-xs font-medium text-white/60 transition-colors hover:border-amber-400/60 hover:bg-amber-400/[0.06] hover:text-amber-300"
                @click="startAddGenre"
              >
                + Nuevo género
              </button>
            </div>
            <p v-if="availableGenres.length === 0" class="mt-1 text-xs text-white/40">
              No hay géneros para "{{ TYPE_LABEL[type] }}". Crealos con el botón "+ Nuevo género"
              o desde "Gestionar".
            </p>

            <!-- Form inline de creación -->
            <div
              v-if="addingGenre"
              class="mt-3 flex flex-col gap-2 rounded-md border border-amber-400/30 bg-amber-400/[0.06] p-3 sm:flex-row sm:items-center"
            >
              <input
                v-model="newGenreName"
                type="text"
                placeholder="Ej. Documental"
                maxlength="80"
                class="h-9 flex-1 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                :disabled="creatingGenre"
                @keydown.enter.prevent="submitNewGenre"
                @keydown.esc.prevent="cancelAddGenre"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  class="h-9 rounded-md border border-white/15 bg-white/[0.04] px-3 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="creatingGenre"
                  @click="cancelAddGenre"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  class="inline-flex h-9 items-center gap-2 rounded-md bg-amber-400 px-3 text-xs font-semibold text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="creatingGenre || newGenreName.trim().length === 0"
                  @click="submitNewGenre"
                >
                  <span v-if="creatingGenre" class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Crear
                </button>
              </div>
            </div>
            <p v-if="newGenreError" class="mt-2 text-xs text-red-300">{{ newGenreError }}</p>

            <p v-if="selectedGenreIds.length > 10" class="mt-2 text-xs text-red-300">
              Máximo 10 géneros.
            </p>
          </div>

          <!-- Error general -->
          <p v-if="error" class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
            {{ error }}
          </p>

          <!-- Modal de gestión de géneros (rename + delete) -->
          <GenreManagerModal
            :open="genreManagerOpen"
            :genres="allGenres"
            @close="genreManagerOpen = false"
            @updated="onGenreUpdated"
            @deleted="onGenreDeleted"
          />

          <!-- Acciones -->
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              class="h-10 rounded-md border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving"
              @click="cancel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-6 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="saving || selectedGenreIds.length > 10"
            >
              <span v-if="saving" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {{ isEdit ? 'Guardar cambios' : 'Crear' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </FormBackdrop>
</template>

<style scoped>
@keyframes goldGlow {
  0%, 100% {
    box-shadow:
      0 0 32px -8px rgba(251, 191, 36, 0.35),
      inset 0 0 0 1px rgba(251, 191, 36, 0.06),
      0 25px 50px -12px rgba(0, 0, 0, 0.8);
  }
  50% {
    box-shadow:
      0 0 56px -4px rgba(251, 191, 36, 0.55),
      inset 0 0 0 1px rgba(251, 191, 36, 0.18),
      0 25px 50px -12px rgba(0, 0, 0, 0.8);
  }
}
.card-glow {
  animation: goldGlow 5.5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .card-glow { animation: none; }
}
</style>
