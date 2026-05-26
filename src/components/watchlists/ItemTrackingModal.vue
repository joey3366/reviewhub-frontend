<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { WatchlistItem } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'

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
const hours = ref<number | null>(null)
const minutes = ref<number | null>(null)
const seconds = ref<number | null>(null)
const episodes = ref<number | null>(null)
const startedAt = ref('')
const finishedAt = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const isSeries = computed(() => props.item?.content?.type === 'series')
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
  startedAt.value = props.item?.startedAt ?? ''
  finishedAt.value = props.item?.finishedAt ?? ''
}

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
  const eps = isSeries.value ? fieldValue(episodes.value) : null
  // Las pelis no llevan fechas: se ven de una.
  const start = isSeries.value ? startedAt.value || null : null
  const finish = isSeries.value ? finishedAt.value || null : null
  if (start && finish && finish < start) {
    error.value = 'La fecha de fin no puede ser anterior a la de inicio.'
    return
  }
  saving.value = true
  try {
    await watchlistsApi.updateItem(props.watchlistId, props.item.id, {
      durationSeconds,
      episodesWatched: eps,
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
            <template v-if="isSeries">
              Con estos datos calculamos cuándo vas a terminar (pronóstico) y qué tan
              bien cumpliste tu ritmo (retrospectiva).
            </template>
            <template v-else>
              Anotá cuánto dura para sumarla al total visto de la lista.
            </template>
          </p>

          <form class="mt-5 flex flex-col gap-5" @submit.prevent="save">
            <!-- Duración -->
            <div>
              <span class="text-sm font-medium text-white">
                {{ isSeries ? 'Duración total que viste' : 'Duración' }}
              </span>
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

            <!-- Episodios (solo series) -->
            <label v-if="isSeries" class="flex flex-col gap-1.5">
              <span class="text-sm font-medium text-white">Episodios</span>
              <input
                v-model.number="episodes"
                type="number"
                min="0"
                inputmode="numeric"
                placeholder="Ej. 123"
                class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <span class="text-xs text-white/40">
                los que vas a ver en total (o los que viste) — es lo que usa el pronóstico
              </span>
            </label>

            <!-- Fechas (solo series: una peli se ve de una) -->
            <div v-if="isSeries" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-white">Empezaste</span>
                <input
                  v-model="startedAt"
                  type="date"
                  class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </label>
              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-white">Terminaste</span>
                <input
                  v-model="finishedAt"
                  type="date"
                  class="h-11 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </label>
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
