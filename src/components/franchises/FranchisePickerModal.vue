<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Franchise } from '@/api/types'
import { franchisesApi } from '@/api/franchises'

/**
 * Elegir una franquicia (desde una lista: "+ Franquicia"). Emite la
 * franquicia elegida (con sus títulos y tu estado en cada uno).
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; pick: [franchise: Franchise] }>()

const franchises = ref<Franchise[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const q = ref('')

const filtered = computed(() => {
  const term = q.value.trim().toLowerCase()
  return term ? franchises.value.filter((f) => f.name.toLowerCase().includes(term)) : franchises.value
})

watch(
  () => props.open,
  async (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (!open) return
    q.value = ''
    error.value = null
    loading.value = true
    try {
      franchises.value = await franchisesApi.list()
    } catch {
      error.value = 'No pudimos cargar las franquicias.'
    } finally {
      loading.value = false
    }
  }
)

function onKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

function cover(f: Franchise) {
  return f.backdropUrl ?? f.contents?.find((c) => c.posterUrl)?.posterUrl ?? null
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pick-franchise-title"
        @click.self="emit('close')"
      >
        <div class="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-400/25 bg-neutral-950/95 shadow-2xl shadow-black/60">
          <header class="flex flex-col gap-3 border-b border-white/10 p-5">
            <h2 id="pick-franchise-title" class="text-lg font-semibold text-white">Agregar una franquicia</h2>
            <input
              v-model="q"
              type="search"
              placeholder="Buscar franquicia…"
              class="h-9 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none"
            />
          </header>
          <ul class="flex-1 overflow-y-auto p-2">
            <li v-if="loading" class="p-6 text-center text-sm text-white/50">Cargando…</li>
            <li v-else-if="error" class="p-6 text-center text-sm text-red-300">{{ error }}</li>
            <li v-else-if="filtered.length === 0" class="p-6 text-center text-sm text-white/50">No hay franquicias{{ q ? ' con ese nombre' : '' }}.</li>
            <li v-for="f in filtered" v-else :key="f.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.06]"
                @click="emit('pick', f)"
              >
                <span class="h-12 w-20 flex-none overflow-hidden rounded border border-white/10 bg-zinc-900">
                  <img v-if="cover(f)" :src="cover(f)!" :alt="f.name" class="h-full w-full object-cover" loading="lazy" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-white">{{ f.name }}</span>
                  <span class="text-xs text-white/50">
                    {{ f.contentsCount ?? 0 }} títulos<template v-if="f.viewer"> · viste {{ f.viewer.watchedCount }}</template>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
