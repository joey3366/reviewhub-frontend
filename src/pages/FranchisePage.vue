<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import type { Franchise, FranchiseContent } from '@/api/types'
import { franchisesApi } from '@/api/franchises'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import BackdropLayer from '@/components/content/BackdropLayer.vue'
import AddFranchiseToListModal from '@/components/franchises/AddFranchiseToListModal.vue'

/**
 * Página de una franquicia (ej. /franquicias/scooby-doo): todos sus títulos
 * en orden y, con sesión, tu progreso (visto / en lista / pendiente) y un
 * atajo para agregar los que te faltan a una lista.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const franchise = ref<Franchise | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const addOpen = ref(false)

const slug = computed(() => route.params.slug as string)

async function load() {
  loading.value = true
  error.value = null
  try {
    franchise.value = await franchisesApi.show(slug.value)
  } catch (e: any) {
    error.value = e?.response?.status === 404 ? 'Esta franquicia no existe.' : 'No pudimos cargar la franquicia.'
    console.error(e)
  } finally {
    loading.value = false
  }
}
watch(slug, load, { immediate: true })

const contents = computed(() => franchise.value?.contents ?? [])
const total = computed(() => contents.value.length)
const watched = computed(() => franchise.value?.viewer?.watchedCount ?? 0)
const progressPct = computed(() => (total.value ? Math.round((watched.value / total.value) * 100) : 0))
// "Faltan": ni vistos ni en alguna lista.
const missing = computed(() => contents.value.filter((c) => c.viewerStatus === 'none'))

// Fondo: el de la franquicia o, si no tiene, el póster del primer título.
const heroUrl = computed(() => franchise.value?.backdropUrl ?? contents.value.find((c) => c.posterUrl)?.posterUrl ?? null)

const countsLabel = computed(() => {
  const c = franchise.value?.counts
  if (!c) return ''
  const parts: string[] = []
  if (c.series) parts.push(`${c.series} ${c.series === 1 ? 'serie' : 'series'}`)
  if (c.movie) parts.push(`${c.movie} ${c.movie === 1 ? 'película' : 'películas'}`)
  if (c.game) parts.push(`${c.game} ${c.game === 1 ? 'juego' : 'juegos'}`)
  return parts.join(' · ')
})

const TYPE_LABEL: Record<string, string> = { movie: 'Película', series: 'Serie', game: 'Juego' }
function metaLine(c: FranchiseContent) {
  const parts: string[] = []
  if (c.releaseYear) parts.push(String(c.releaseYear))
  parts.push(TYPE_LABEL[c.type] ?? c.type)
  if (c.type === 'movie' && c.runtimeMinutes) {
    const h = Math.floor(c.runtimeMinutes / 60)
    const m = c.runtimeMinutes % 60
    parts.push(h ? `${h}h ${m}m` : `${m}m`)
  }
  if (c.type === 'series' && c.episodesCount) parts.push(`${c.episodesCount} ep`)
  if (c.type === 'game' && c.hltbHours) parts.push(`~${c.hltbHours} h`)
  return parts.join(' · ')
}

async function onAdded(result: { added: number; skipped: number; grouped: number; listName: string }) {
  addOpen.value = false
  const parts = [`${result.added} agregados a "${result.listName}"`]
  if (result.skipped) parts.push(`${result.skipped} ya estaban`)
  if (result.grouped) parts.push(`${result.grouped} unidos al grupo`)
  toast.success(parts.join(' · '))
  await load()
}
</script>

<template>
  <div class="min-h-screen bg-black text-white">
    <div v-if="loading" class="mx-auto max-w-5xl px-5 py-16">
      <div class="h-10 w-64 animate-pulse rounded bg-white/10" />
      <div class="mt-4 h-4 w-40 animate-pulse rounded bg-white/10" />
    </div>

    <div v-else-if="error" class="mx-auto max-w-5xl px-5 py-16">
      <p class="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">{{ error }}</p>
      <button type="button" class="mt-4 text-sm text-white/70 hover:text-white" @click="router.back()">← Volver</button>
    </div>

    <template v-else-if="franchise">
      <!-- Hero -->
      <section class="relative overflow-hidden">
        <div class="pointer-events-none absolute inset-0">
          <BackdropLayer
            v-if="heroUrl"
            :url="heroUrl"
            :focus-x="franchise.backdropFocusX"
            :focus-y="franchise.backdropFocusY"
            :fit="franchise.backdropUrl ? franchise.backdropFit : 'contain'"
          />
          <div v-else class="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-zinc-950 to-black" />
        </div>

        <div class="relative mx-auto flex min-h-[360px] max-w-5xl flex-col justify-end gap-4 px-5 pb-10 pt-8 md:min-h-[440px] md:px-6">
          <button type="button" class="mb-auto inline-flex w-fit items-center gap-2 text-sm font-medium text-white/70 hover:text-white" @click="router.back()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Volver
          </button>

          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Franquicia</p>
          <h1 class="text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">{{ franchise.name }}</h1>
          <p class="text-sm text-white/70">
            {{ total }} {{ total === 1 ? 'título' : 'títulos' }}<template v-if="countsLabel"> · {{ countsLabel }}</template>
          </p>
          <p v-if="franchise.description" class="max-w-2xl text-sm leading-relaxed text-white/75 md:text-base">
            {{ franchise.description }}
          </p>

          <!-- Progreso -->
          <div v-if="auth.isAuthenticated && franchise.viewer" class="mt-2 flex max-w-xl flex-col gap-2">
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-white/60">Tu progreso</span>
              <span>
                <span class="text-lg font-bold text-amber-300">{{ watched }}</span>
                <span class="text-white/60"> de {{ total }} vistos</span>
                <span v-if="franchise.viewer.inListCount" class="text-sky-300/80"> · {{ franchise.viewer.inListCount }} en tus listas</span>
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700" :style="{ width: `${progressPct}%` }" />
            </div>
            <button
              type="button"
              class="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300"
              @click="addOpen = true"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
              {{ missing.length > 0 ? `Agregar los ${missing.length} que me faltan a una lista` : 'Agregar a una lista' }}
            </button>
          </div>
          <RouterLink v-else-if="!auth.isAuthenticated" to="/login" class="mt-2 w-fit text-sm text-amber-300 hover:text-amber-200">
            Iniciá sesión para ver tu progreso →
          </RouterLink>
        </div>
      </section>

      <!-- Títulos -->
      <section class="mx-auto max-w-5xl px-5 pb-16 pt-6 md:px-6">
        <p v-if="contents.length === 0" class="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/50">
          Esta franquicia todavía no tiene títulos.
        </p>
        <ol v-else class="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          <li v-for="(c, i) in contents" :key="c.id">
            <RouterLink :to="`/contents/${c.slug}`" class="group flex items-center gap-4 p-3 transition-colors hover:bg-white/[0.04] sm:p-4">
              <span class="w-6 flex-none text-right font-mono text-xs text-white/30">{{ i + 1 }}</span>
              <span class="h-20 w-14 flex-none overflow-hidden rounded-md border border-white/10 bg-zinc-900">
                <img v-if="c.posterUrl" :src="c.posterUrl" :alt="c.title" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-white group-hover:text-amber-300 sm:text-base">{{ c.title }}</span>
                <span class="mt-0.5 block text-xs text-white/50">{{ metaLine(c) }}</span>
                <span v-if="c.avgRating !== null" class="mt-0.5 block text-xs text-amber-300">★ {{ c.avgRating.toFixed(1) }}</span>
              </span>
              <span
                v-if="c.viewerStatus === 'watched'"
                class="inline-flex flex-none items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3"><path d="M20 6 9 17l-5-5" /></svg>
                Visto
              </span>
              <span
                v-else-if="c.viewerStatus === 'in_list'"
                class="inline-flex flex-none items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-300"
              >
                En tu lista
              </span>
              <span v-else-if="c.viewerStatus === 'none'" class="flex-none text-xs text-white/30">Pendiente</span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <AddFranchiseToListModal
        :open="addOpen"
        :franchise="franchise"
        default-mode="missing"
        @close="addOpen = false"
        @done="onAdded"
      />
    </template>
  </div>
</template>
