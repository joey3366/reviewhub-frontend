<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WatchlistItem } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'
import DateField from '@/components/ui/DateField.vue'

const props = defineProps<{
  open: boolean
  watchlistId: string
  item: WatchlistItem | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)

// Inputs numéricos: number|null + v-model.number (ver reference-frontend-gotchas).
// "Totales" = lo que vas a ver completo (alimenta el pronóstico).
const hours = ref<number | null>(null)
const minutes = ref<number | null>(null)
const seconds = ref<number | null>(null)
const episodes = ref<number | null>(null)
// "Progreso" = lo que LLEVÁS visto hasta hoy (alimenta el "¿Cómo voy?").
const progressHours = ref<number | null>(null)
const progressMinutes = ref<number | null>(null)
const progressSeconds = ref<number | null>(null)
const progressEpisodes = ref<number | null>(null)
// "Ritmo personalizado" = override del ritmo global SOLO para esta serie.
// Útil cuando una tiene episodios largos y otra cortos: 3 eps/día no son
// lo mismo si dura 20 min vs 1 hora.
const paceMinutes = ref<number | null>(null)
const paceEpisodes = ref<number | null>(null)
const startedAt = ref('')
const finishedAt = ref('')
const saving = ref(false)
const error = ref<string | null>(null)
// Los desplegables arrancan abiertos solo si ya hay algo cargado.
const progressOpen = ref(false)
const paceOpen = ref(false)

const isSeries = computed(() => props.item?.content?.type === 'series')
const isGame = computed(() => props.item?.content?.type === 'game')
// Trackable = entidades con fechas y progreso parcial. Pelis se ven de una.
const trackable = computed(() => isSeries.value || isGame.value)
// Solo series tienen episodios; juegos llevan solo tiempo.
const hasEpisodes = computed(() => isSeries.value)
const title = computed(() => props.item?.content?.title ?? 'este título')

function fieldValue(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Precarga los campos con lo que ya tiene el item.
function resetFromItem() {
  error.value = null
  const sec = props.item?.durationSeconds ?? 0
  hours.value = sec > 0 ? Math.floor(sec / 3600) : null
  minutes.value = sec > 0 ? Math.floor((sec % 3600) / 60) : null
  seconds.value = sec > 0 ? sec % 60 : null
  episodes.value = props.item?.episodesWatched ?? null
  const psec = props.item?.durationProgressSeconds ?? 0
  progressHours.value = psec > 0 ? Math.floor(psec / 3600) : null
  progressMinutes.value = psec > 0 ? Math.floor((psec % 3600) / 60) : null
  progressSeconds.value = psec > 0 ? psec % 60 : null
  progressEpisodes.value = props.item?.episodesProgress ?? null
  paceMinutes.value = props.item?.paceMinutes ?? null
  paceEpisodes.value = props.item?.paceEpisodes ?? null
  startedAt.value = props.item?.startedAt ?? ''
  finishedAt.value = props.item?.finishedAt ?? ''
  progressOpen.value = psec > 0 || (props.item?.episodesProgress ?? 0) > 0
  paceOpen.value = (props.item?.paceMinutes ?? 0) > 0 || (props.item?.paceEpisodes ?? 0) > 0
}

// Resumen corto del ritmo personalizado para el header colapsado.
const paceSummary = computed(() => {
  const m = fieldValue(paceMinutes.value)
  const e = fieldValue(paceEpisodes.value)
  if (!m && !e) return null
  const parts: string[] = []
  if (m) parts.push(`${m} min/día`)
  if (e) parts.push(`${e} ep/día`)
  return parts.join(' · ')
})

// Resumen corto del progreso para mostrar en el header colapsado.
const progressSummary = computed(() => {
  const sec =
    (fieldValue(progressHours.value) ?? 0) * 3600 +
    (fieldValue(progressMinutes.value) ?? 0) * 60 +
    (fieldValue(progressSeconds.value) ?? 0)
  const eps = fieldValue(progressEpisodes.value) ?? 0
  if (sec === 0 && eps === 0) return null
  const parts: string[] = []
  if (eps > 0) parts.push(`${eps} ${eps === 1 ? 'ep' : 'ep'} vistos`)
  if (sec > 0) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    const time: string[] = []
    if (h) time.push(`${h}h`)
    if (m) time.push(`${m}m`)
    if (s) time.push(`${s}s`)
    parts.push(time.join(' '))
  }
  return parts.join(' · ')
})

function close() {
  emit('close')
}

async function save() {
  error.value = null
  if (!props.item) return
  const h = fieldValue(hours.value) ?? 0
  const m = fieldValue(minutes.value) ?? 0
  const s = fieldValue(seconds.value) ?? 0
  const durationSeconds = h * 3600 + m * 60 + s
  const eps = hasEpisodes.value ? fieldValue(episodes.value) : null
  // Progreso parcial: series y juegos. Pelis se ven de una.
  const ph = fieldValue(progressHours.value) ?? 0
  const pm = fieldValue(progressMinutes.value) ?? 0
  const ps = fieldValue(progressSeconds.value) ?? 0
  const durationProgressSeconds = trackable.value ? ph * 3600 + pm * 60 + ps : 0
  const progressEps = hasEpisodes.value ? fieldValue(progressEpisodes.value) : null
  // Las pelis no llevan fechas: se ven de una.
  const start = trackable.value ? startedAt.value || null : null
  const finish = trackable.value ? finishedAt.value || null : null
  if (start && finish && finish < start) {
    error.value = 'La fecha de fin no puede ser anterior a la de inicio.'
    return
  }
  saving.value = true
  try {
    // Pace override: series acepta minutos y episodios; juegos solo minutos.
    const pm = trackable.value ? fieldValue(paceMinutes.value) : null
    const pe = hasEpisodes.value ? fieldValue(paceEpisodes.value) : null
    await watchlistsApi.updateItem(props.watchlistId, props.item.id, {
      durationSeconds,
      episodesWatched: eps,
      durationProgressSeconds,
      episodesProgress: progressEps,
      paceMinutes: pm,
      paceEpisodes: pe,
      startedAt: start,
      finishedAt: finish,
    })
    emit('saved')
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const msg = (e.response?.data as { message?: string } | undefined)?.message
      error.value = `No se pudo guardar (HTTP ${status ?? '—'}${msg ? `: ${msg}` : ''}).`
    } else {
      error.value = 'No se pudo guardar el seguimiento.'
    }
    console.error(e)
  } finally {
    saving.value = false
  }
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
      resetFromItem()
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
        aria-labelledby="tracking-modal-title"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-400/20 bg-neutral-950/95 p-6 shadow-2xl focus:outline-none"
        >
          <header class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-amber-300/70">Seguimiento</p>
              <h2 id="tracking-modal-title" class="mt-0.5 text-lg font-semibold text-white">{{ title }}</h2>
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

          <p class="mt-2 text-xs text-white/40">
            <template v-if="trackable">
              Con estos datos calculamos cuándo vas a terminar (pronóstico) y qué tan
              bien cumpliste tu ritmo (retrospectiva).
            </template>
            <template v-else>
              Anotá cuánto dura para sumarla al total visto de la lista.
            </template>
          </p>

          <form class="mt-5 flex flex-col gap-5" @submit.prevent="save">
            <!-- Plan total -->
            <div>
              <span class="text-sm font-medium text-white">
                <template v-if="isGame">Horas estimadas (total)</template>
                <template v-else-if="isSeries">Duración total</template>
                <template v-else>Duración</template>
              </span>
              <p v-if="isSeries" class="mt-0.5 text-xs text-white/40">
                Cuánto dura la serie entera. Lo usa el pronóstico.
              </p>
              <p v-else-if="isGame" class="mt-0.5 text-xs text-white/40">
                Cuánto pensás que te va a llevar terminarlo. Lo usa el pronóstico.
              </p>
              <div class="mt-2 flex items-center gap-2">
                <label class="flex flex-1 flex-col gap-1">
                  <input
                    v-model.number="hours"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    placeholder="0"
                    class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <span class="text-xs text-white/40">horas</span>
                </label>
                <label class="flex flex-1 flex-col gap-1">
                  <input
                    v-model.number="minutes"
                    type="number"
                    min="0"
                    max="59"
                    inputmode="numeric"
                    placeholder="0"
                    class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <span class="text-xs text-white/40">minutos</span>
                </label>
                <label class="flex flex-1 flex-col gap-1">
                  <input
                    v-model.number="seconds"
                    type="number"
                    min="0"
                    max="59"
                    inputmode="numeric"
                    placeholder="0"
                    class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <span class="text-xs text-white/40">segundos</span>
                </label>
              </div>
            </div>

            <!-- Episodios totales (solo series) -->
            <label v-if="hasEpisodes" class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Episodios totales</span>
              <input
                v-model.number="episodes"
                type="number"
                min="0"
                inputmode="numeric"
                placeholder="Ej. 123"
                class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <span class="text-xs text-white/40">
                los que tiene la serie entera. Lo usa el pronóstico.
              </span>
            </label>

            <!-- Tu progreso hasta hoy (series y juegos) — desplegable -->
            <div v-if="trackable" class="overflow-hidden rounded-lg border border-sky-400/20 bg-sky-400/[0.04]">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sky-400/[0.06]"
                :aria-expanded="progressOpen"
                aria-controls="progress-fields"
                @click="progressOpen = !progressOpen"
              >
                <span class="flex flex-col gap-0.5">
                  <span class="text-sm font-medium text-sky-200">Tu progreso hasta hoy</span>
                  <span class="text-xs text-sky-200/60">
                    <template v-if="progressSummary">{{ progressSummary }}</template>
                    <template v-else>cargá lo que llevás visto para "¿Cómo voy?"</template>
                  </span>
                </span>
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  class="h-4 w-4 shrink-0 text-sky-200/70 transition-transform"
                  :class="progressOpen ? 'rotate-180' : ''"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div v-if="progressOpen" id="progress-fields" class="border-t border-sky-400/10 px-4 pb-4 pt-3">
                <div class="flex items-center gap-2">
                  <label class="flex min-w-0 flex-1 flex-col gap-1">
                    <input
                      v-model.number="progressHours"
                      type="number"
                      min="0"
                      inputmode="numeric"
                      placeholder="0"
                      class="h-11 w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                    <span class="text-xs text-white/40">horas vistas</span>
                  </label>
                  <label class="flex min-w-0 flex-1 flex-col gap-1">
                    <input
                      v-model.number="progressMinutes"
                      type="number"
                      min="0"
                      max="59"
                      inputmode="numeric"
                      placeholder="0"
                      class="h-11 w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                    <span class="text-xs text-white/40">minutos</span>
                  </label>
                  <label class="flex min-w-0 flex-1 flex-col gap-1">
                    <input
                      v-model.number="progressSeconds"
                      type="number"
                      min="0"
                      max="59"
                      inputmode="numeric"
                      placeholder="0"
                      class="h-11 w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                    <span class="text-xs text-white/40">segundos</span>
                  </label>
                </div>
                <label v-if="hasEpisodes" class="mt-3 flex flex-col gap-1.5">
                  <input
                    v-model.number="progressEpisodes"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    placeholder="Ej. 30"
                    class="h-11 w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  />
                  <span class="text-xs text-white/40">episodios vistos hasta hoy</span>
                </label>
              </div>
            </div>

            <!-- Ritmo personalizado para ESTE título (series y juegos) — desplegable -->
            <div v-if="trackable" class="overflow-hidden rounded-lg border border-violet-400/20 bg-violet-400/[0.04]">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-violet-400/[0.06]"
                :aria-expanded="paceOpen"
                aria-controls="pace-fields"
                @click="paceOpen = !paceOpen"
              >
                <span class="flex flex-col gap-0.5">
                  <span class="text-sm font-medium text-violet-200">
                    {{ isGame ? 'Ritmo para este juego' : 'Ritmo para esta serie' }}
                  </span>
                  <span class="text-xs text-violet-200/60">
                    <template v-if="paceSummary">{{ paceSummary }}</template>
                    <template v-else>opcional · sobrescribe tu ritmo global solo acá</template>
                  </span>
                </span>
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                  class="h-4 w-4 shrink-0 text-violet-200/70 transition-transform"
                  :class="paceOpen ? 'rotate-180' : ''"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div v-if="paceOpen" id="pace-fields" class="border-t border-violet-400/10 px-4 pb-4 pt-3">
                <p v-if="isSeries" class="mb-3 text-xs text-violet-200/70">
                  Usalo cuando los episodios son muy distintos al promedio (ej. 1h vs 20min).
                  Si seteás minutos, el pronóstico de esta serie usa tiempo. Si dejás todo vacío,
                  vuelve al ritmo global de "Mi ritmo".
                </p>
                <p v-else class="mb-3 text-xs text-violet-200/70">
                  Los juegos siempre van por tiempo (no hay episodios). Si dejás vacío
                  vuelve al ritmo global de "Mi ritmo" en minutos.
                </p>
                <div :class="hasEpisodes ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'">
                  <label class="flex flex-col gap-1.5">
                    <input
                      v-model.number="paceMinutes"
                      type="number"
                      min="1"
                      inputmode="numeric"
                      placeholder="Ej. 60"
                      class="h-11 w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <span class="text-xs text-white/40">min por día</span>
                  </label>
                  <label v-if="hasEpisodes" class="flex flex-col gap-1.5">
                    <input
                      v-model.number="paceEpisodes"
                      type="number"
                      min="1"
                      inputmode="numeric"
                      placeholder="Ej. 2"
                      class="h-11 w-full min-w-0 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <span class="text-xs text-white/40">eps por día</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Fechas (series y juegos: las pelis se ven de una) -->
            <div v-if="trackable" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-white">Empezaste</span>
                <DateField v-model="startedAt" variant="dark" placeholder="Elegir fecha" aria-label="Fecha de inicio" />
              </div>
              <div class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-white">Terminaste</span>
                <DateField v-model="finishedAt" variant="dark" placeholder="Elegir fecha" aria-label="Fecha de fin" />
              </div>
            </div>

            <p v-if="error" class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
              {{ error }}
            </p>

            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                class="h-11 rounded-md px-4 text-sm font-medium text-white/70 transition-colors hover:bg-white/5"
                :disabled="saving"
                @click="close"
              >
                Cancelar
              </button>
              <button
                type="submit"
                class="inline-flex h-11 items-center gap-2 rounded-full bg-amber-400 px-6 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="saving"
              >
                <span v-if="saving" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Guardar
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
