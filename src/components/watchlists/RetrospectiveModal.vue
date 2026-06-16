<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Retrospective, WatchlistItem } from '@/api/types'
import { playbackApi } from '@/api/playback'

const props = defineProps<{
  open: boolean
  watchlistId: string
  item: WatchlistItem | null
}>()

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const dialogRef = ref<HTMLDivElement | null>(null)

const MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
function formatMedium(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MES[m - 1]} de ${y}`
}

const retro = ref<Retrospective | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const needsPace = ref(false)
const datesMissing = ref(false)

const title = computed(() => props.item?.content?.title ?? 'este título')

const dataMissing = computed(() => {
  if (!retro.value || !props.item) return false
  if (retro.value.mode === 'time') return (props.item.durationSeconds ?? 0) === 0
  return (props.item.episodesWatched ?? 0) === 0
})

// Veredicto según la desviación: en ritmo / atrasado / adelantado.
const verdict = computed(() => {
  const r = retro.value
  if (!r) return null
  if (r.onPace) return { kind: 'onpace' as const, label: 'Ibas en ritmo' }
  const n = Math.abs(r.deviationDays)
  const dias = n === 1 ? 'día' : 'días'
  return r.deviationDays > 0
    ? { kind: 'slow' as const, label: `Te atrasaste ${n} ${dias}` }
    : { kind: 'fast' as const, label: `Te adelantaste ${n} ${dias}` }
})

const paceLabel = computed(() => {
  const r = retro.value
  if (!r) return ''
  const base = r.mode === 'time'
    ? `${r.pace.dailyMinutes} min por día`
    : `${r.pace.dailyEpisodes} ${r.pace.dailyEpisodes === 1 ? 'episodio' : 'episodios'} por día`
  return r.pace.customForItem ? `${base} (ritmo propio de esta serie)` : base
})

async function fetchRetrospective() {
  if (!props.item) return
  loading.value = true
  error.value = null
  needsPace.value = false
  datesMissing.value = false
  retro.value = null
  try {
    retro.value = await playbackApi.retrospective(props.watchlistId, props.item.id)
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const msg = (e.response.data as { message?: string } | undefined)?.message ?? ''
      if (/pace/i.test(msg)) needsPace.value = true
      else if (/startedAt|finishedAt/i.test(msg)) datesMissing.value = true
      else error.value = msg || 'No se pudo calcular la retrospectiva.'
    } else {
      error.value = 'No se pudo calcular la retrospectiva.'
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
      fetchRetrospective()
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
        aria-labelledby="retro-modal-title"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-400/20 bg-neutral-950/95 p-6 shadow-2xl focus:outline-none"
        >
          <header class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-amber-300/70">Retrospectiva</p>
              <h2 id="retro-modal-title" class="mt-0.5 text-lg font-semibold text-white">{{ title }}</h2>
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

          <div class="mt-5 min-h-[8rem]">
            <!-- Cargando -->
            <div v-if="loading" class="flex h-32 items-center justify-center">
              <span class="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            </div>

            <!-- Falta ritmo -->
            <div v-else-if="needsPace" class="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-5 text-center">
              <p class="text-sm text-white/80">Primero configurá tu ritmo de visionado.</p>
              <p class="mt-1 text-xs text-white/50">Sin ritmo no hay con qué comparar.</p>
              <button
                type="button"
                class="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-300"
                @click="goToPace"
              >
                Configurar mi ritmo
              </button>
            </div>

            <!-- Faltan fechas -->
            <div v-else-if="datesMissing" class="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/60">
              Cargá las fechas de <span class="text-amber-300">inicio y fin</span> (con el reloj) para ver la retrospectiva.
            </div>

            <!-- Faltan datos del título -->
            <div v-else-if="dataMissing" class="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/60">
              <template v-if="retro?.mode === 'time'">
                Cargá la <span class="text-amber-300">duración</span> del título para comparar contra tu ritmo.
              </template>
              <template v-else>
                Cargá los <span class="text-amber-300">episodios</span> del título para comparar contra tu ritmo.
              </template>
            </div>

            <!-- Error -->
            <p v-else-if="error" class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-3 text-sm text-red-300" role="alert">
              {{ error }}
            </p>

            <!-- Resultado -->
            <div v-else-if="retro && verdict">
              <!-- Veredicto -->
              <div
                class="flex items-center gap-3 rounded-xl border p-4"
                :class="{
                  'border-emerald-400/30 bg-emerald-500/10': verdict.kind === 'onpace',
                  'border-amber-400/30 bg-amber-500/10': verdict.kind === 'slow',
                  'border-sky-400/30 bg-sky-500/10': verdict.kind === 'fast',
                }"
              >
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  :class="{
                    'bg-emerald-400/20 text-emerald-300': verdict.kind === 'onpace',
                    'bg-amber-400/20 text-amber-300': verdict.kind === 'slow',
                    'bg-sky-400/20 text-sky-300': verdict.kind === 'fast',
                  }"
                >
                  <svg v-if="verdict.kind === 'onpace'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <svg v-else-if="verdict.kind === 'slow'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4l2 2" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                    <path d="m13 19 6-6-6-6M5 19l6-6-6-6" />
                  </svg>
                </span>
                <div>
                  <p
                    class="text-lg font-bold"
                    :class="{
                      'text-emerald-300': verdict.kind === 'onpace',
                      'text-amber-300': verdict.kind === 'slow',
                      'text-sky-300': verdict.kind === 'fast',
                    }"
                  >
                    {{ verdict.label }}
                  </p>
                  <p class="text-xs text-white/50">Margen tolerado: ±{{ retro.toleranceDays }} {{ retro.toleranceDays === 1 ? 'día' : 'días' }}</p>
                </div>
              </div>

              <!-- Detalle: la meta vs lo real, según el ritmo -->
              <div class="mt-4 flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm">
                <p class="flex flex-wrap items-baseline gap-x-2 text-white/70">
                  <span class="text-xs uppercase tracking-wide text-white/40">A tu ritmo</span>
                  <span>deberías haber terminado el</span>
                  <span class="font-semibold text-amber-300">{{ formatMedium(retro.expectedFinishDate) }}</span>
                </p>
                <p class="flex flex-wrap items-baseline gap-x-2 text-white/70">
                  <span class="text-xs uppercase tracking-wide text-white/40">Terminaste el</span>
                  <span class="font-semibold text-white">{{ formatMedium(retro.finishedAt) }}</span>
                  <span class="text-xs text-white/40">(empezaste el {{ formatMedium(retro.startedAt) }})</span>
                </p>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3">
                <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p class="text-2xl font-bold tabular-nums text-white">{{ retro.actualValidDays }}</p>
                  <p class="text-xs text-white/50">días viendo (reales)</p>
                </div>
                <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p class="text-2xl font-bold tabular-nums text-amber-300">{{ retro.expectedDays }}</p>
                  <p class="text-xs text-white/50">esperados a tu ritmo</p>
                </div>
              </div>

              <p class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/45">
                <span>{{ retro.actualCalendarDays }} días en total</span>
                <span v-if="retro.actualSkippedDays > 0">{{ retro.actualSkippedDays }} salteados</span>
              </p>

              <p class="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/40">
                <span>A tu ritmo: <span class="text-amber-200/70">{{ paceLabel }}</span></span>
                <span v-if="retro.pace.skipHolidays">· salteando feriados</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
