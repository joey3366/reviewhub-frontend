<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Watchlist, WatchlistItem } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'

const route = useRoute()
const router = useRouter()

const id = computed(() => route.params.id as string)

const watchlist = ref<Watchlist | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const actionError = ref<string | null>(null)
const removingId = ref<string | null>(null)

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
          <p class="text-sm text-white/60">
            {{ itemsCountLabel }}
            <template v-if="showDuration"> · {{ watchlist.totalDurationFormatted }}</template>
          </p>
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
            </div>
          </div>
        </div>
      </template>
    </div>
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
