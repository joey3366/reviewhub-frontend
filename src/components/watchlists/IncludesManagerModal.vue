<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Watchlist } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'

const props = defineProps<{
  open: boolean
  watchlist: Watchlist | null
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)
const allMyLists = ref<Watchlist[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const selectedId = ref('')
const adding = ref(false)
const removingId = ref<string | null>(null)

const included = computed(() => props.watchlist?.includedLists ?? [])

// Candidatos para agregar: mis listas excepto la actual y las ya incluidas
// directamente. Los ciclos (incluir un ancestro) los rechaza el backend con
// 422; ahí mostramos el mensaje.
const candidates = computed(() => {
  if (!props.watchlist) return []
  const excluded = new Set<string>([props.watchlist.id, ...included.value.map((l) => l.id)])
  return allMyLists.value.filter((l) => !excluded.has(l.id))
})

async function loadLists() {
  loading.value = true
  error.value = null
  try {
    allMyLists.value = await watchlistsApi.listMine()
  } catch (e) {
    error.value = 'No pudimos cargar tus listas.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function addInclude() {
  if (!props.watchlist || !selectedId.value) return
  adding.value = true
  error.value = null
  try {
    await watchlistsApi.addInclude(props.watchlist.id, selectedId.value)
    selectedId.value = ''
    emit('changed')
    // Cerramos al agregar para que la usuaria vea el resultado en la grilla.
    emit('close')
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status
      const msg = (e.response?.data as { message?: string } | undefined)?.message
      if (status === 422) error.value = msg || 'No se pudo agregar (ciclo o regla inválida).'
      else if (status === 409) error.value = 'Esa lista ya estaba incluida.'
      else if (status === 403) error.value = 'No podés incluir listas ajenas.'
      else error.value = `No se pudo agregar (HTTP ${status ?? '—'}).`
    } else error.value = 'No se pudo agregar la lista.'
    console.error(e)
  } finally {
    adding.value = false
  }
}

async function removeInclude(childId: string) {
  if (!props.watchlist) return
  removingId.value = childId
  error.value = null
  try {
    await watchlistsApi.removeInclude(props.watchlist.id, childId)
    emit('changed')
  } catch (e) {
    error.value = 'No se pudo quitar la lista.'
    console.error(e)
  } finally {
    removingId.value = null
  }
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
      loadLists()
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
        aria-labelledby="includes-modal-title"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-amber-400/20 bg-neutral-950/95 p-6 shadow-2xl focus:outline-none"
        >
          <header class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-amber-300/70">Listas incluidas</p>
              <h2 id="includes-modal-title" class="mt-0.5 text-lg font-semibold text-white">
                {{ watchlist?.name }}
              </h2>
              <p class="mt-1 text-xs text-white/40">
                Los títulos de las listas incluidas aparecen acá con un badge "via X".
              </p>
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

          <!-- Incluidas actuales -->
          <section class="mt-5">
            <p class="text-sm font-medium text-white">
              Incluidas ahora <span class="text-white/40">({{ included.length }})</span>
            </p>
            <ul v-if="included.length > 0" class="mt-2 flex flex-col gap-1.5">
              <li
                v-for="inc in included"
                :key="inc.id"
                class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm text-white">{{ inc.name }}</p>
                  <p class="text-xs text-white/45">
                    {{ inc.itemsCount }} {{ inc.itemsCount === 1 ? 'título' : 'títulos' }}
                  </p>
                </div>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 px-3 text-xs text-white/70 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  :disabled="removingId === inc.id"
                  @click="removeInclude(inc.id)"
                >
                  <span v-if="removingId === inc.id" class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Quitar
                </button>
              </li>
            </ul>
            <p v-else class="mt-2 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/40">
              Todavía no incluiste ninguna otra lista.
            </p>
          </section>

          <!-- Agregar inclusión -->
          <section class="mt-5">
            <p class="text-sm font-medium text-white">Agregar una lista</p>
            <p class="mt-0.5 text-xs text-white/40">
              Elegí una lista tuya para incluir sus títulos en ésta.
            </p>
            <div v-if="loading" class="mt-3 flex h-11 items-center text-xs text-white/50">
              <span class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              Cargando tus listas…
            </div>
            <div v-else-if="candidates.length === 0" class="mt-3 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/40">
              No hay listas disponibles para incluir.
            </div>
            <div v-else class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                v-model="selectedId"
                class="h-11 flex-1 rounded-md border border-white/15 bg-neutral-900 px-3 text-sm text-white [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="" disabled class="bg-neutral-900 text-white">— elegí una lista —</option>
                <option v-for="l in candidates" :key="l.id" :value="l.id" class="bg-neutral-900 text-white">{{ l.name }}</option>
              </select>
              <button
                type="button"
                class="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!selectedId || adding"
                @click="addInclude"
              >
                <span v-if="adding" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Incluir
              </button>
            </div>
          </section>

          <p v-if="error" class="mt-4 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
            {{ error }}
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
