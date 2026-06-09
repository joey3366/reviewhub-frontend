<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ListStats } from '@/api/types'
import { playbackApi } from '@/api/playback'

const props = defineProps<{
  open: boolean
  watchlistId: string
  watchlistName: string
}>()

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const dialogRef = ref<HTMLDivElement | null>(null)

const stats = ref<ListStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
// Lista de items contribuyentes colapsable porque puede ser larga.
const itemsOpen = ref(false)

const MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
function formatMedium(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MES[m - 1]} de ${y}`
}

// "27h 30min" a partir de segundos (más lindo que el HH:MM:SS del backend).
function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const parts: string[] = []
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}min`)
  if (!parts.length) parts.push(`${sec}s`)
  return parts.join(' ')
}

// Veredicto de la comparación: usa el multiplicador del modo con dato real.
// Convención: 1.0 ± 0.1 = igual, >1.1 = más rápido, <0.9 = más lento.
type Comparison = NonNullable<ListStats['comparison']>
function pickMultiplier(c: Comparison | null): number | null {
  if (!c) return null
  return c.minutesMultiplier ?? c.episodesMultiplier
}
const verdict = computed(() => {
  const mult = pickMultiplier(stats.value?.comparison ?? null)
  if (mult === null) return null
  if (mult >= 0.9 && mult <= 1.1) {
    return { kind: 'onpace' as const, label: 'Fuiste fiel a tu ritmo', detail: `(${mult.toFixed(2)}× lo apuntado)` }
  }
  if (mult > 1.1) {
    const pct = Math.round((mult - 1) * 100)
    return { kind: 'fast' as const, label: `${pct}% más rápido`, detail: `que tu ritmo apuntado` }
  }
  const pct = Math.round((1 - mult) * 100)
  return { kind: 'slow' as const, label: `${pct}% más lento`, detail: `que tu ritmo apuntado` }
})

const noTargetMsg = computed(() => {
  const s = stats.value
  if (!s) return null
  if (s.status !== 'ok') return null
  if (!s.comparison) {
    if (!s.targetPace || (s.targetPace.dailyMinutes === null && s.targetPace.dailyEpisodes === null)) {
      return 'No tenés un ritmo apuntado en "Mi ritmo", así que no hay con qué comparar.'
    }
    return 'Tu ritmo apuntado y el de esta lista no comparten dimensión (uno en minutos, otro en episodios).'
  }
  return null
})

async function fetchStats() {
  loading.value = true
  error.value = null
  stats.value = null
  try {
    stats.value = await playbackApi.listStats(props.watchlistId)
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const msg = (e.response?.data as { message?: string } | undefined)?.message
      error.value = `No se pudo cargar (HTTP ${status ?? '—'}${msg ? `: ${msg}` : ''}).`
    } else {
      error.value = 'No se pudo cargar las estadísticas.'
    }
    console.error(e)
  } finally {
    loading.value = false
  }
}

function goToPace() {
  emit('close')
  router.push('/ritmo')
}
function close() {
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close()
}
function lockScroll(lock: boolean) {
  document.body.style.overflow = lock ? 'hidden' : ''
}

watch(
  () => props.open,
  (open) => {
    lockScroll(open)
    if (open) {
      itemsOpen.value = false
      fetchStats()
      setTimeout(() => dialogRef.value?.focus(), 0)
    }
  },
  { immediate: true }
)

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  lockScroll(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="list-stats-title"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-amber-400/20 bg-neutral-950/95 p-6 shadow-2xl focus:outline-none"
        >
          <header class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-amber-300/80">Estadísticas</p>
              <h2 id="list-stats-title" class="mt-0.5 text-lg font-semibold text-white">{{ watchlistName }}</h2>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
              @click="close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="mt-5 min-h-[12rem]">
            <!-- Cargando -->
            <div v-if="loading" class="flex h-32 items-center justify-center">
              <span class="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            </div>

            <!-- Error -->
            <p v-else-if="error" class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-3 text-sm text-red-300" role="alert">
              {{ error }}
            </p>

            <!-- Vacía -->
            <div v-else-if="stats?.status === 'empty'" class="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/60">
              <p>Esta lista no tiene títulos con fecha de inicio cargada.</p>
              <p class="mt-2 text-xs text-white/40">Marcá la <span class="text-amber-300">fecha en que empezaste</span> (con el reloj de cada título) para que aparezcan acá.</p>
            </div>

            <!-- OK -->
            <div v-else-if="stats?.status === 'ok' && stats.window && stats.totals && stats.actualPace">
              <!-- Ventana -->
              <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p class="text-xs uppercase tracking-wide text-white/50">Ventana</p>
                <p class="mt-1 text-sm text-white">
                  Del <span class="font-semibold text-amber-300">{{ formatMedium(stats.window.start) }}</span>
                  al <span class="font-semibold text-amber-300">{{ formatMedium(stats.window.end) }}</span>
                  <span v-if="stats.window.endIsToday" class="ml-1 inline-flex items-center gap-1 rounded-full bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                    hasta hoy
                  </span>
                </p>
                <p class="mt-1 text-xs text-white/50">
                  {{ stats.window.calendarDays }} {{ stats.window.calendarDays === 1 ? 'día' : 'días' }} de calendario ·
                  <span class="text-amber-200/70">{{ stats.window.validDays }} válidos</span>
                  <span v-if="stats.window.skippedDays > 0"> · {{ stats.window.skippedDays }} salteados</span>
                </p>
              </div>

              <!-- Totales -->
              <div class="mt-4 grid grid-cols-2 gap-3">
                <div class="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3">
                  <p class="text-xs uppercase tracking-wide text-white/50">Total visto</p>
                  <p class="mt-1 text-2xl font-bold tabular-nums text-amber-300">{{ fmtDuration(stats.totals.durationSeconds) }}</p>
                </div>
                <div class="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3">
                  <p class="text-xs uppercase tracking-wide text-white/50">Episodios</p>
                  <p class="mt-1 text-2xl font-bold tabular-nums text-amber-300">{{ stats.totals.episodes }}</p>
                </div>
              </div>

              <!-- Ritmo efectivo -->
              <div class="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <p class="text-xs uppercase tracking-wide text-white/50">Tu ritmo real en esta lista</p>
                <p class="mt-1 text-base text-white">
                  <span class="font-semibold text-amber-300">{{ stats.actualPace.minutesPerValidDay }}</span> min/día válido
                  <span v-if="stats.actualPace.episodesPerValidDay > 0" class="text-white/70">
                    · <span class="font-semibold text-amber-300">{{ stats.actualPace.episodesPerValidDay }}</span> ep/día válido
                  </span>
                </p>
                <p v-if="stats.targetPace" class="mt-2 text-xs text-white/45">
                  Tu ritmo apuntado:
                  <span v-if="stats.targetPace.dailyMinutes != null" class="text-white/70">{{ stats.targetPace.dailyMinutes }} min/día</span>
                  <span v-if="stats.targetPace.dailyMinutes != null && stats.targetPace.dailyEpisodes != null" class="text-white/40"> · </span>
                  <span v-if="stats.targetPace.dailyEpisodes != null" class="text-white/70">{{ stats.targetPace.dailyEpisodes }} ep/día</span>
                </p>
              </div>

              <!-- Veredicto comparativo -->
              <div
                v-if="verdict"
                class="mt-4 flex items-center gap-3 rounded-xl border p-4"
                :class="{
                  'border-emerald-400/30 bg-emerald-500/10': verdict.kind === 'onpace',
                  'border-sky-400/30 bg-sky-500/10': verdict.kind === 'fast',
                  'border-amber-400/30 bg-amber-500/10': verdict.kind === 'slow',
                }"
              >
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  :class="{
                    'bg-emerald-400/20 text-emerald-300': verdict.kind === 'onpace',
                    'bg-sky-400/20 text-sky-300': verdict.kind === 'fast',
                    'bg-amber-400/20 text-amber-300': verdict.kind === 'slow',
                  }"
                >
                  <svg v-if="verdict.kind === 'onpace'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <svg v-else-if="verdict.kind === 'fast'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                    <path d="m13 19 6-6-6-6M5 19l6-6-6-6" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4l2 2" />
                  </svg>
                </span>
                <div>
                  <p
                    class="text-base font-bold"
                    :class="{
                      'text-emerald-300': verdict.kind === 'onpace',
                      'text-sky-300': verdict.kind === 'fast',
                      'text-amber-300': verdict.kind === 'slow',
                    }"
                  >
                    {{ verdict.label }}
                  </p>
                  <p class="text-xs text-white/55">{{ verdict.detail }}</p>
                </div>
              </div>
              <div v-else-if="noTargetMsg" class="mt-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-white/55">
                {{ noTargetMsg }}
                <button
                  v-if="!stats.targetPace || (stats.targetPace.dailyMinutes === null && stats.targetPace.dailyEpisodes === null)"
                  type="button"
                  class="ml-1 font-medium text-amber-300 hover:text-amber-200"
                  @click="goToPace"
                >
                  Configurar mi ritmo →
                </button>
              </div>

              <!-- Resumen de items + desplegable -->
              <div class="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                  :aria-expanded="itemsOpen"
                  @click="itemsOpen = !itemsOpen"
                >
                  <span class="flex flex-col gap-0.5">
                    <span class="text-sm font-medium text-white">
                      {{ stats.itemsCount }} {{ stats.itemsCount === 1 ? 'título contribuye' : 'títulos contribuyen' }}
                    </span>
                    <span class="text-xs text-white/50">
                      {{ stats.finishedCount }} {{ stats.finishedCount === 1 ? 'terminado' : 'terminados' }}
                      <template v-if="stats.inFlightCount > 0">
                        · {{ stats.inFlightCount }} en curso
                      </template>
                      <template v-if="stats.inheritedCount > 0">
                        · {{ stats.inheritedCount }} heredados
                      </template>
                    </span>
                  </span>
                  <svg
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                    class="h-4 w-4 shrink-0 text-white/50 transition-transform"
                    :class="itemsOpen ? 'rotate-180' : ''"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <ul v-if="itemsOpen" class="divide-y divide-white/5 border-t border-white/5">
                  <li
                    v-for="it in stats.contributingItems"
                    :key="it.id"
                    class="flex items-start justify-between gap-2 px-4 py-2.5 text-xs"
                  >
                    <div class="min-w-0">
                      <p class="truncate text-white">{{ it.title }}</p>
                      <p class="text-white/45">
                        {{ formatMedium(it.startedAt) }}
                        <template v-if="it.finishedAt"> → {{ formatMedium(it.finishedAt) }}</template>
                        <template v-else>
                          → <span class="text-sky-300/70">en curso</span>
                        </template>
                      </p>
                    </div>
                    <span
                      v-if="it.viaWatchlistName"
                      class="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200"
                      :title="`Heredado de &quot;${it.viaWatchlistName}&quot;`"
                    >
                      via {{ it.viaWatchlistName }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
