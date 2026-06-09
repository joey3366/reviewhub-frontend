<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Forecast, WatchlistItem } from '@/api/types'
import { playbackApi } from '@/api/playback'

const props = defineProps<{
  open: boolean
  watchlistId: string
  item: WatchlistItem | null
}>()

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const dialogRef = ref<HTMLDivElement | null>(null)

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function todayIso() {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function formatLongDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DOW[wd]} ${d} de ${MES[m - 1]} de ${y}`
}

const startDate = ref(todayIso())
const forecast = ref<Forecast | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const needsPace = ref(false)

const title = computed(() => props.item?.content?.title ?? 'este título')

// El pronóstico es trivial si el campo que usa el modo está vacío. Pero el modo
// lo decide TU RITMO (minutos = tiempo, episodios = episodios), así que el dato
// faltante puede ser por un desajuste entre tu ritmo y lo que cargaste.
const guidance = computed<{ text: string; showPace: boolean } | null>(() => {
  const f = forecast.value
  const it = props.item
  if (!f || !it) return null

  if (f.mode === 'time' && (it.durationSeconds ?? 0) === 0) {
    if ((it.episodesWatched ?? 0) > 0) {
      return {
        text: `Tu ritmo está en minutos por día, así que el pronóstico usa la duración (que está vacía) e ignora los ${it.episodesWatched} episodios. Para pronosticar por episodios, poné tu ritmo en episodios por día.`,
        showPace: true,
      }
    }
    return { text: 'Cargá la duración del título (con el reloj) para ver un pronóstico real.', showPace: false }
  }

  if (f.mode === 'episodes' && (it.episodesWatched ?? 0) === 0) {
    if ((it.durationSeconds ?? 0) > 0) {
      return {
        text: 'Tu ritmo está en episodios por día, así que el pronóstico usa los episodios (que están vacíos). Cargá los episodios, o poné tu ritmo en minutos por día para usar la duración.',
        showPace: true,
      }
    }
    return { text: 'Cargá los episodios del título (con el reloj) para ver un pronóstico real.', showPace: false }
  }

  return null
})
const dataMissing = computed(() => guidance.value !== null)

const paceLabel = computed(() => {
  const f = forecast.value
  if (!f) return ''
  const base = f.mode === 'time'
    ? `${f.pace.dailyMinutes} min por día`
    : `${f.pace.dailyEpisodes} ${f.pace.dailyEpisodes === 1 ? 'episodio' : 'episodios'} por día`
  return f.pace.customForItem ? `${base} (ritmo propio de esta serie)` : base
})

async function fetchForecast() {
  if (!props.item || !startDate.value) return
  loading.value = true
  error.value = null
  needsPace.value = false
  forecast.value = null
  try {
    forecast.value = await playbackApi.forecast(props.watchlistId, props.item.id, {
      startDate: startDate.value,
    })
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      const msg = (e.response.data as { message?: string } | undefined)?.message ?? ''
      if (/pace/i.test(msg)) needsPace.value = true
      else error.value = msg || 'No se pudo calcular el pronóstico.'
    } else {
      error.value = 'No se pudo calcular el pronóstico.'
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
      // Si ya marcaste cuándo empezás/empezaste, arrancamos de ahí; si no, hoy.
      startDate.value = props.item?.startedAt || todayIso()
      fetchForecast()
      setTimeout(() => dialogRef.value?.focus(), 0)
    }
  },
  { immediate: true }
)
// Recalcular cuando cambia la fecha de inicio (estando abierto).
watch(startDate, () => {
  if (props.open) fetchForecast()
})

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
        aria-labelledby="forecast-modal-title"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-400/20 bg-neutral-950/95 p-6 shadow-2xl focus:outline-none"
        >
          <header class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-amber-300/70">Pronóstico</p>
              <h2 id="forecast-modal-title" class="mt-0.5 text-lg font-semibold text-white">{{ title }}</h2>
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

          <!-- Fecha de inicio -->
          <label class="mt-5 flex flex-col gap-1.5">
            <span class="text-sm font-medium text-white">¿Cuándo arrancás?</span>
            <input
              v-model="startDate"
              type="date"
              class="h-11 w-full rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </label>

          <!-- Resultado -->
          <div class="mt-5 min-h-[7rem]">
            <!-- Cargando -->
            <div v-if="loading" class="flex h-28 items-center justify-center">
              <span class="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            </div>

            <!-- Falta configurar ritmo -->
            <div v-else-if="needsPace" class="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-5 text-center">
              <p class="text-sm text-white/80">Primero configurá tu ritmo de visionado.</p>
              <p class="mt-1 text-xs text-white/50">Cuántos minutos o episodios ves por día.</p>
              <button
                type="button"
                class="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-300"
                @click="goToPace"
              >
                Configurar mi ritmo
              </button>
            </div>

            <!-- Error -->
            <p v-else-if="error" class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-3 text-sm text-red-300" role="alert">
              {{ error }}
            </p>

            <!-- Faltan datos / desajuste de ritmo -->
            <div v-else-if="guidance" class="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-center text-sm text-white/70">
              <p>{{ guidance.text }}</p>
              <button
                v-if="guidance.showPace"
                type="button"
                class="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-300"
                @click="goToPace"
              >
                Ajustar mi ritmo
              </button>
            </div>

            <!-- Resultado -->
            <div v-else-if="forecast" class="rounded-xl border border-amber-400/25 bg-gradient-to-br from-amber-400/[0.08] to-transparent p-5">
              <p class="text-xs uppercase tracking-wide text-white/50">Terminás el</p>
              <p class="mt-1 text-2xl font-bold capitalize text-amber-300">
                {{ formatLongDate(forecast.finishDate) }}
              </p>
              <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <span class="text-white/70">
                  <span class="font-semibold text-white">{{ forecast.requiredDays }}</span>
                  {{ forecast.requiredDays === 1 ? 'día' : 'días' }} viendo
                </span>
                <span v-if="forecast.skippedDays > 0" class="text-white/70">
                  <span class="font-semibold text-white">{{ forecast.skippedDays }}</span> salteados
                </span>
                <span class="text-white/70">
                  <span class="font-semibold text-white">{{ forecast.totalCalendarDays }}</span> días en total
                </span>
              </div>
            </div>
          </div>

          <!-- Pie: ritmo usado -->
          <p v-if="forecast && !dataMissing" class="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/40">
            <span>A tu ritmo: <span class="text-amber-200/70">{{ paceLabel }}</span></span>
            <span v-if="forecast.pace.skipWeekdays.length > 0">· descansás {{ forecast.pace.skipWeekdays.length }} días/semana</span>
            <span v-if="forecast.pace.skipHolidays">· salteando feriados</span>
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
