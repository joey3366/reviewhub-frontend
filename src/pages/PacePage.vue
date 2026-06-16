<script setup lang="ts">
import axios from 'axios'
import { computed, onMounted, ref } from 'vue'
import type { Holiday, Weekday } from '@/api/types'
import { playbackApi } from '@/api/playback'
import { useToast } from '@/composables/useToast'

const toast = useToast()

// --- Días de la semana (orden lunes→domingo, como se lee acá) ---
const WEEKDAYS: { key: Weekday; label: string }[] = [
  { key: 'monday', label: 'Lun' },
  { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mié' },
  { key: 'thursday', label: 'Jue' },
  { key: 'friday', label: 'Vie' },
  { key: 'saturday', label: 'Sáb' },
  { key: 'sunday', label: 'Dom' },
]
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Partículas de polvo dorado (mismo recurso visual que "Mis listas")
const particles = [
  { top: '14%', left: '10%', size: 3, delay: 0, dur: 12 },
  { top: '26%', left: '82%', size: 4, delay: 1.5, dur: 14 },
  { top: '55%', left: '24%', size: 2, delay: 3, dur: 10 },
  { top: '68%', left: '78%', size: 4, delay: 0.8, dur: 13 },
  { top: '80%', left: '40%', size: 3, delay: 2.2, dur: 11 },
]

const loading = ref(true)
const loadError = ref<string | null>(null)

// --- Ritmo ---
// Ojo: <input type="number"> + v-model.number deja un NÚMERO (o '' al vaciarlo),
// nunca un string parseable. Por eso tipamos number|null y normalizamos con
// fieldValue() en vez de hacer .trim() (que crashearía sobre un número).
const minutes = ref<number | null>(null)
const episodes = ref<number | null>(null)
const skipWeekdays = ref<Weekday[]>([])
const savingPace = ref(false)

// --- Días libres ---
const holidays = ref<Holiday[]>([])
const newDate = ref('')
const newHolidayName = ref('')
const addingHoliday = ref(false)
const removingDate = ref<string | null>(null)

// Normaliza el valor de un input numérico: '' / null / NaN → null; número → número.
function fieldValue(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Resumen en lenguaje natural del ritmo actual (mientras editás).
const paceSummary = computed(() => {
  const ep = fieldValue(episodes.value)
  const mn = fieldValue(minutes.value)
  const parts: string[] = []
  if (ep !== null) parts.push(`${ep} ${ep === 1 ? 'episodio' : 'episodios'} por día`)
  if (mn !== null) parts.push(`${mn} min por día`)
  if (parts.length === 0) return 'Configurá al menos uno para poder calcular pronósticos.'
  let text = `Ves ${parts.join(' o ')}`
  if (skipWeekdays.value.length > 0) {
    const days = WEEKDAYS.filter((w) => skipWeekdays.value.includes(w.key)).map((w) => w.label)
    text += ` · descansás ${days.join(', ')}`
  }
  return text + '.'
})

function isSkipped(key: Weekday) {
  return skipWeekdays.value.includes(key)
}
function toggleWeekday(key: Weekday) {
  if (isSkipped(key)) {
    skipWeekdays.value = skipWeekdays.value.filter((d) => d !== key)
    return
  }
  if (skipWeekdays.value.length >= 6) {
    toast.error('No podés saltear los 7 días: necesitás al menos uno para ver.')
    return
  }
  skipWeekdays.value = [...skipWeekdays.value, key]
}

function formatHoliday(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${WEEKDAY_SHORT[wd]} ${d} ${MONTHS[m - 1]} ${y}`
}

async function loadAll() {
  loading.value = true
  loadError.value = null
  try {
    const [pace, hols] = await Promise.all([
      playbackApi.getPaceSettings(),
      playbackApi.listHolidays(),
    ])
    if (pace) {
      minutes.value = pace.dailyMinutes
      episodes.value = pace.dailyEpisodes
      skipWeekdays.value = [...pace.skipWeekdays]
    }
    holidays.value = hols
  } catch (e) {
    loadError.value = 'No pudimos cargar tu configuración.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function savePace() {
  const mRaw = fieldValue(minutes.value)
  const eRaw = fieldValue(episodes.value)
  const m = mRaw === null ? null : Math.trunc(mRaw)
  const e = eRaw === null ? null : Math.trunc(eRaw)
  if (m === null && e === null) {
    toast.error('Configurá al menos minutos o episodios por día.')
    return
  }
  if (m !== null && (m < 1 || m > 1440)) {
    toast.error('Los minutos por día van de 1 a 1440.')
    return
  }
  if (e !== null && (e < 1 || e > 100)) {
    toast.error('Los episodios por día van de 1 a 100.')
    return
  }
  if (skipWeekdays.value.length >= 7) {
    toast.error('No podés saltear los 7 días.')
    return
  }
  savingPace.value = true
  try {
    const updated = await playbackApi.updatePaceSettings({
      dailyMinutes: m,
      dailyEpisodes: e,
      skipWeekdays: skipWeekdays.value,
    })
    minutes.value = updated.dailyMinutes
    episodes.value = updated.dailyEpisodes
    skipWeekdays.value = [...updated.skipWeekdays]
    toast.success('Ritmo guardado')
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      const msg = (err.response?.data as { message?: string } | undefined)?.message
      toast.error(
        status
          ? `No se pudo guardar el ritmo (HTTP ${status}${msg ? `: ${msg}` : ''}).`
          : 'No se pudo guardar el ritmo: el servidor no respondió. ¿Está corriendo el backend?'
      )
    } else {
      toast.error('No se pudo guardar el ritmo.')
    }
  } finally {
    savingPace.value = false
  }
}

async function addHoliday() {
  if (!newDate.value) {
    toast.error('Elegí una fecha.')
    return
  }
  addingHoliday.value = true
  try {
    const h = await playbackApi.addHoliday({
      date: newDate.value,
      name: newHolidayName.value.trim() || undefined,
    })
    holidays.value = [...holidays.value, h].sort((a, b) => a.date.localeCompare(b.date))
    newDate.value = ''
    newHolidayName.value = ''
    toast.success(h.name ? `Día libre agregado: ${h.name}` : 'Día libre agregado')
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      toast.error('Ya tenés un día libre en esa fecha.')
    } else {
      toast.error('No se pudo agregar el día libre.')
    }
    console.error(err)
  } finally {
    addingHoliday.value = false
  }
}

async function removeHoliday(date: string) {
  removingDate.value = date
  try {
    await playbackApi.removeHoliday(date)
    holidays.value = holidays.value.filter((h) => h.date !== date)
    toast.success('Día libre quitado')
  } catch (err) {
    toast.error('No se pudo borrar el día libre.')
    console.error(err)
  } finally {
    removingDate.value = null
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="relative min-h-[calc(100vh-3.5rem)] overflow-hidden text-white">
    <!-- Fondo cinematográfico -->
    <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-b from-zinc-950 via-black to-black" />
      <div class="absolute left-1/2 top-0 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-amber-500/10 blur-[120px]" />
      <span
        v-for="(p, i) in particles"
        :key="i"
        class="dust absolute rounded-full bg-amber-300/70"
        :style="{
          top: p.top,
          left: p.left,
          width: `${p.size}px`,
          height: `${p.size}px`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.dur}s`,
        }"
      />
    </div>

    <!-- Contenido -->
    <div class="relative z-10 mx-auto max-w-3xl px-6 py-12">
      <header class="flex flex-col gap-2">
        <h1 class="text-4xl font-bold tracking-tight">Mi ritmo</h1>
        <p class="text-sm text-white/60">
          Decile a Kairos cuánto ves por día y qué días descansás. Con eso
          calcula cuándo vas a terminar cada peli o serie de tus listas.
        </p>
      </header>

      <!-- Loading -->
      <div v-if="loading" class="mt-8 space-y-5">
        <div class="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        <div class="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
      </div>

      <!-- Error de carga -->
      <div v-else-if="loadError" class="mt-8 rounded-xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-300">
        {{ loadError }}
        <button type="button" class="ml-2 underline hover:text-red-200" @click="loadAll">Reintentar</button>
      </div>

      <template v-else>
        <!-- ============ Ritmo ============ -->
        <section class="mt-8 rounded-2xl border border-amber-400/20 bg-white/[0.04] p-6 backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-amber-300">Tu ritmo diario</h2>
          <p class="mt-1 text-sm text-white/50">
            Necesitás configurar al menos uno. Para series suele usarse episodios; para películas, minutos.
          </p>

          <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Episodios por día</span>
              <input
                v-model.number="episodes"
                type="number"
                min="1"
                max="100"
                inputmode="numeric"
                placeholder="Ej. 2"
                class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Minutos por día</span>
              <input
                v-model.number="minutes"
                type="number"
                min="1"
                max="1440"
                inputmode="numeric"
                placeholder="Ej. 60"
                class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
          </div>

          <div class="mt-6">
            <span class="text-sm font-medium text-white">Días que NO ves nada</span>
            <p class="mt-0.5 text-xs text-white/40">Esos días no cuentan para el plan (ej. fines de semana ocupados).</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="w in WEEKDAYS"
                :key="w.key"
                type="button"
                class="h-10 w-12 rounded-lg border text-sm font-semibold transition-all"
                :class="
                  isSkipped(w.key)
                    ? 'border-amber-400 bg-amber-400 text-black shadow-lg shadow-amber-500/20'
                    : 'border-white/15 bg-white/[0.03] text-white/70 hover:border-white/30 hover:text-white'
                "
                @click="toggleWeekday(w.key)"
              >
                {{ w.label }}
              </button>
            </div>
          </div>

          <!-- Resumen en palabras -->
          <p class="mt-6 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/90">
            {{ paceSummary }}
          </p>

          <div class="mt-5">
            <button
              type="button"
              class="inline-flex h-11 items-center gap-2 rounded-full bg-amber-400 px-6 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="savingPace"
              @click="savePace"
            >
              <span v-if="savingPace" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Guardar ritmo
            </button>
          </div>
        </section>

        <!-- ============ Días libres ============ -->
        <section class="mt-6 rounded-2xl border border-amber-400/20 bg-white/[0.04] p-6 backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-amber-300">Días libres</h2>
          <p class="mt-1 text-sm text-white/50">
            Feriados o vacaciones donde no vas a ver nada. Tampoco cuentan para el plan.
          </p>

          <form class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="addHoliday">
            <label class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Fecha</span>
              <input
                v-model="newDate"
                type="date"
                class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <label class="flex flex-1 flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Nombre <span class="text-white/40">(opcional)</span></span>
              <input
                v-model="newHolidayName"
                type="text"
                maxlength="120"
                placeholder="Ej. Navidad"
                class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <button
              type="submit"
              class="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-amber-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="addingHoliday"
            >
              <span v-if="addingHoliday" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Agregar
            </button>
          </form>

          <!-- Lista de días libres -->
          <ul v-if="holidays.length > 0" class="mt-5 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            <li
              v-for="h in holidays"
              :key="h.date"
              class="flex items-center justify-between gap-3 bg-white/[0.02] px-4 py-3"
            >
              <div class="flex flex-col">
                <span class="text-sm font-medium text-white">{{ formatHoliday(h.date) }}</span>
                <span v-if="h.name" class="text-xs text-amber-300/70">{{ h.name }}</span>
              </div>
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                :aria-label="`Borrar ${h.name ?? h.date}`"
                :disabled="removingDate === h.date"
                @click="removeHoliday(h.date)"
              >
                <span v-if="removingDate === h.date" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          </ul>
          <p v-else class="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
            Todavía no agregaste días libres.
          </p>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
@keyframes dustFloat {
  0% { transform: translateY(0); opacity: 0; }
  20% { opacity: 0.9; }
  80% { opacity: 0.6; }
  100% { transform: translateY(-60px); opacity: 0; }
}
.dust {
  animation-name: dustFloat;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  filter: blur(0.5px);
  box-shadow: 0 0 6px rgba(252, 211, 77, 0.6);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .dust {
    animation: none;
    opacity: 0.4;
  }
}
</style>
