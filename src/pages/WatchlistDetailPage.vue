<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Watchlist, WatchlistItem } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'
import ItemTrackingModal from '@/components/watchlists/ItemTrackingModal.vue'
import ForecastModal from '@/components/watchlists/ForecastModal.vue'
import RetrospectiveModal from '@/components/watchlists/RetrospectiveModal.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => route.params.id as string)

const watchlist = ref<Watchlist | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const actionError = ref<string | null>(null)
const removingId = ref<string | null>(null)

// Modal de seguimiento (duración/episodios/fechas). null = cerrado.
const trackingItem = ref<WatchlistItem | null>(null)
// Modal de pronóstico. null = cerrado.
const forecastItem = ref<WatchlistItem | null>(null)
// Modal de retrospectiva. null = cerrado.
const retroItem = ref<WatchlistItem | null>(null)

const items = computed(() => watchlist.value?.items ?? [])

// Fondo = slideshow con los backdrops de TODOS los títulos, ordenados por
// calificación (arranca por el mejor). Cae al poster si no hay backdrop.
const backdrops = computed(() => {
  const ordered = [...items.value].sort(
    (a, b) => Number(b.content?.avgRating ?? -1) - Number(a.content?.avgRating ?? -1)
  )
  const urls = ordered
    .map((it) => it.content?.backdropUrl ?? it.content?.posterUrl ?? null)
    .filter((u): u is string => !!u)
  return [...new Set(urls)]
})

const currentBg = ref(0)
let bgTimer: ReturnType<typeof setInterval> | undefined

function stopBgRotation() {
  if (bgTimer) clearInterval(bgTimer)
  bgTimer = undefined
}
function startBgRotation() {
  stopBgRotation()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion || backdrops.value.length < 2) return
  bgTimer = setInterval(() => {
    currentBg.value = (currentBg.value + 1) % backdrops.value.length
  }, 7000)
}

// Cuando cambian los backdrops (carga / quitar título), reiniciamos el ciclo.
watch(backdrops, () => {
  currentBg.value = 0
  startBgRotation()
})
onBeforeUnmount(stopBgRotation)

const itemsCountLabel = computed(() => {
  const n = items.value.length
  return `${n} ${n === 1 ? 'título' : 'títulos'}`
})

const showDuration = computed(() => (watchlist.value?.totalDurationSeconds ?? 0) > 0)

// Items reordenables por drag. Mantenemos un orden local separado de
// watchlist.items para no reiniciar el slideshow del fondo al arrastrar.
const orderedItems = ref<WatchlistItem[]>([])
watch(
  () => watchlist.value?.items,
  (its) => {
    orderedItems.value = its ? [...its] : []
  },
  { immediate: true }
)

const dragItemIndex = ref<number | null>(null)
function onItemDragStart(index: number) {
  dragItemIndex.value = index
}
function onItemDragEnter(index: number) {
  if (dragItemIndex.value === null || dragItemIndex.value === index) return
  const arr = [...orderedItems.value]
  const [moved] = arr.splice(dragItemIndex.value, 1)
  arr.splice(index, 0, moved)
  orderedItems.value = arr
  dragItemIndex.value = index
}
async function onItemDragEnd() {
  dragItemIndex.value = null
  if (!watchlist.value) return
  try {
    await watchlistsApi.reorderItems(
      watchlist.value.id,
      orderedItems.value.map((it) => it.id)
    )
  } catch (e) {
    actionError.value = 'No se pudo guardar el orden.'
    console.error(e)
  }
}

async function loadWatchlist() {
  loading.value = true
  error.value = null
  watchlist.value = null
  try {
    watchlist.value = await watchlistsApi.show(id.value)
  } catch (e: any) {
    if (e?.response?.status === 404) {
      error.value = 'No encontramos esta lista (o no es tuya).'
    } else {
      error.value = 'No pudimos cargar la lista.'
    }
    console.error(e)
  } finally {
    loading.value = false
  }
}

function typeLabel(item: WatchlistItem) {
  return item.content?.type === 'movie' ? 'Película' : 'Serie'
}
function ratingDisplay(item: WatchlistItem) {
  const r = item.content?.avgRating
  return r === null || r === undefined ? null : Number(r).toFixed(1)
}

function goToContent(item: WatchlistItem) {
  if (item.content?.slug) router.push(`/contents/${item.content.slug}`)
}

async function removeItem(item: WatchlistItem) {
  if (!watchlist.value) return
  const title = item.content?.title ?? 'este título'
  if (!window.confirm(`¿Quitar "${title}" de la lista?`)) return
  removingId.value = item.id
  actionError.value = null
  try {
    await watchlistsApi.removeItem(watchlist.value.id, item.id)
    // Refrescamos para recalcular conteo y duración total del backend.
    watchlist.value = await watchlistsApi.show(watchlist.value.id)
  } catch (e) {
    actionError.value = 'No se pudo quitar el título.'
    console.error(e)
  } finally {
    removingId.value = null
  }
}

// --- Seguimiento ---
function openTracking(item: WatchlistItem) {
  trackingItem.value = item
}
async function onTrackingSaved() {
  trackingItem.value = null
  if (!watchlist.value) return
  try {
    // Refrescamos para recalcular duración total y campos derivados (daysElapsed).
    watchlist.value = await watchlistsApi.show(watchlist.value.id)
  } catch (e) {
    actionError.value = 'Se guardó, pero no pudimos refrescar la lista.'
    console.error(e)
  }
}

// "2h 30m 45s" a partir de segundos (más legible que el HH:MM:SS del backend).
// Omite las partes en cero, pero muestra los segundos cuando los hay.
function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s) parts.push(`${s}s`)
  return parts.length ? parts.join(' ') : '0m'
}

// Total visto de la lista (incluye segundos), formateado lindo.
const totalWatchedLabel = computed(() => fmtDuration(watchlist.value?.totalDurationSeconds ?? 0))
function hasTracking(item: WatchlistItem) {
  return (
    item.durationSeconds > 0 ||
    (item.episodesWatched ?? 0) > 0 ||
    !!item.startedAt ||
    !!item.finishedAt
  )
}
// Pronóstico y retrospectiva son solo para series: una peli se ve de una.
function canForecast(item: WatchlistItem) {
  return (
    item.content?.type === 'series' &&
    (item.durationSeconds > 0 || (item.episodesWatched ?? 0) > 0)
  )
}
function openForecast(item: WatchlistItem) {
  forecastItem.value = item
}
// Hay retrospectiva si es serie y ya marcaste inicio y fin (terminada).
function canRetrospect(item: WatchlistItem) {
  return item.content?.type === 'series' && !!item.startedAt && !!item.finishedAt
}
function openRetro(item: WatchlistItem) {
  retroItem.value = item
}

function goBack() {
  router.push({ name: 'watchlists' })
}

watch(id, loadWatchlist, { immediate: true })
</script>

<template>
  <div class="relative min-h-[calc(100vh-3.5rem)] overflow-hidden text-white">
    <!-- Fondo: slideshow de los backdrops de la lista -->
    <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-b from-zinc-950 via-black to-black" />
      <div
        v-for="(url, i) in backdrops"
        :key="url"
        class="ken-burns absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
        :style="{ backgroundImage: `url(${url})`, opacity: i === currentBg ? 0.6 : 0 }"
      />
      <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/95" />
    </div>

    <!-- Contenido -->
    <div class="relative z-10 mx-auto max-w-7xl px-6 py-10 md:px-12">
      <button
        type="button"
        class="mb-8 inline-flex items-center gap-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
        @click="goBack"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Mis listas
      </button>

      <!-- Loading -->
      <div v-if="loading" class="flex flex-col gap-8">
        <div class="h-10 w-64 animate-pulse rounded bg-white/10" />
        <div class="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <div v-for="i in 5" :key="i" class="aspect-[2/3] animate-pulse rounded-lg bg-white/5" />
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="flex flex-col items-start gap-4 py-16">
        <p class="text-sm text-red-300">{{ error }}</p>
        <button type="button" class="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10" @click="goBack">
          Volver a Mis listas
        </button>
      </div>

      <template v-else-if="watchlist">
        <!-- Encabezado -->
        <header class="flex flex-col gap-3">
          <span
            class="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-400/40 bg-black/40 px-2.5 py-1 text-xs font-medium text-amber-300 backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
              <template v-if="watchlist.isPublic">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20" />
              </template>
              <template v-else>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </template>
            </svg>
            {{ watchlist.isPublic ? 'Pública' : 'Privada' }}
          </span>
          <h1 class="text-4xl font-bold tracking-tight md:text-5xl">{{ watchlist.name }}</h1>
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-sm text-white/60">{{ itemsCountLabel }}</span>
            <span
              v-if="showDuration"
              class="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 shadow-lg shadow-amber-500/10 backdrop-blur-sm"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 text-amber-300">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span class="text-xs font-medium uppercase tracking-wide text-white/50">Total visto</span>
              <span class="text-base font-bold tabular-nums text-amber-300">{{ totalWatchedLabel }}</span>
            </span>
          </div>
        </header>

        <p v-if="actionError" class="mt-6 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {{ actionError }}
        </p>

        <!-- Vacía -->
        <div
          v-if="items.length === 0"
          class="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center backdrop-blur-sm"
        >
          <p class="text-lg font-semibold text-white">Esta lista está vacía</p>
          <p class="text-sm text-white/60">Agregá pelis y series desde el catálogo con el botón “Mi lista”.</p>
          <RouterLink
            to="/"
            class="mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-300"
          >
            Ir al catálogo
          </RouterLink>
        </div>

        <!-- Grilla de títulos (arrastrá para reordenar) -->
        <div v-else class="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <div
            v-for="(item, index) in orderedItems"
            :key="item.id"
            draggable="true"
            class="group flex cursor-grab flex-col gap-2.5 transition-all active:cursor-grabbing"
            :class="dragItemIndex === index ? 'scale-95 opacity-50' : ''"
            @dragstart="onItemDragStart(index)"
            @dragenter.prevent="onItemDragEnter(index)"
            @dragover.prevent
            @dragend="onItemDragEnd"
          >
            <div class="relative aspect-[2/3] overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
              <button type="button" class="block h-full w-full" @click="goToContent(item)">
                <img
                  v-if="item.content?.posterUrl"
                  :src="item.content.posterUrl"
                  :alt="item.content?.title"
                  loading="lazy"
                  draggable="false"
                  class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span v-else class="flex h-full w-full items-center justify-center px-2 text-center text-xs text-white/40">
                  {{ item.content?.title }}
                </span>
              </button>
              <!-- Seguimiento -->
              <button
                type="button"
                class="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 opacity-0 backdrop-blur-sm transition-opacity hover:bg-amber-500/80 hover:text-black group-hover:opacity-100"
                :class="hasTracking(item) ? 'text-amber-300 opacity-100' : 'text-white/90'"
                :aria-label="`Editar seguimiento de ${item.content?.title}`"
                title="Seguimiento: duración, episodios y fechas"
                @click="openTracking(item)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </button>
              <!-- Quitar -->
              <button
                type="button"
                class="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 opacity-0 backdrop-blur-sm transition-opacity hover:bg-red-500/80 group-hover:opacity-100 disabled:opacity-50"
                :disabled="removingId === item.id"
                :aria-label="`Quitar ${item.content?.title} de la lista`"
                title="Quitar de la lista"
                @click="removeItem(item)"
              >
                <svg v-if="removingId !== item.id" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
                <span v-else class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              </button>
            </div>

            <div class="flex flex-col gap-0.5">
              <button type="button" class="line-clamp-2 text-left text-sm font-semibold text-white transition-colors hover:text-amber-300" @click="goToContent(item)">
                {{ item.content?.title }}
              </button>
              <p class="flex items-center gap-1.5 text-xs text-white/50">
                <span>{{ typeLabel(item) }}</span>
                <span v-if="ratingDisplay(item)" class="text-amber-300">★ {{ ratingDisplay(item) }}</span>
              </p>
              <!-- Seguimiento cargado -->
              <p
                v-if="hasTracking(item)"
                class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-amber-200/60"
              >
                <span v-if="item.durationSeconds > 0" class="inline-flex items-center gap-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  {{ fmtDuration(item.durationSeconds) }}
                </span>
                <span v-if="(item.episodesWatched ?? 0) > 0">{{ item.episodesWatched }} ep</span>
                <span v-if="item.daysElapsed != null" class="inline-flex items-center gap-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {{ item.daysElapsed }}d
                </span>
                <span v-else-if="item.startedAt" class="inline-flex items-center gap-1 text-amber-300/70">
                  <svg viewBox="0 0 24 24" fill="currentColor" class="h-3 w-3">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  viendo
                </span>
              </p>
              <!-- Pronóstico / Retrospectiva -->
              <div
                v-if="canForecast(item) || canRetrospect(item)"
                class="mt-1 flex flex-wrap gap-x-3 gap-y-1"
              >
                <button
                  v-if="canForecast(item)"
                  type="button"
                  class="inline-flex items-center gap-1 text-xs font-medium text-amber-300/80 transition-colors hover:text-amber-300"
                  @click="openForecast(item)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
                  </svg>
                  Pronóstico
                </button>
                <button
                  v-if="canRetrospect(item)"
                  type="button"
                  class="inline-flex items-center gap-1 text-xs font-medium text-sky-300/80 transition-colors hover:text-sky-300"
                  @click="openRetro(item)"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                    <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Retrospectiva
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <ItemTrackingModal
      :open="!!trackingItem"
      :watchlist-id="watchlist?.id ?? ''"
      :item="trackingItem"
      @close="trackingItem = null"
      @saved="onTrackingSaved"
    />

    <ForecastModal
      :open="!!forecastItem"
      :watchlist-id="watchlist?.id ?? ''"
      :item="forecastItem"
      @close="forecastItem = null"
    />

    <RetrospectiveModal
      :open="!!retroItem"
      :watchlist-id="watchlist?.id ?? ''"
      :item="retroItem"
      @close="retroItem = null"
    />
  </div>
</template>

<style scoped>
@keyframes kenBurns {
  0% { transform: scale(1.05) translate(0, 0); }
  50% { transform: scale(1.14) translate(-1.5%, -1%); }
  100% { transform: scale(1.05) translate(0, 0); }
}
.ken-burns {
  animation: kenBurns 40s ease-in-out infinite;
  transform-origin: center;
}

@media (prefers-reduced-motion: reduce) {
  .ken-burns {
    animation: none;
  }
}
</style>
