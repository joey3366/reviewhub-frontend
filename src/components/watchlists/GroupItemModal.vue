<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { WatchlistItem } from '@/api/types'

/**
 * "Unir a…": elegís a qué título de la lista se une `item` (ej. la película
 * Yu-Gi-Oh! 3D a la serie 5D's). El unido deja de contar como título aparte
 * y su tiempo se suma al del principal. Se puede separar después.
 *
 * El padre pasa los candidatos ya filtrados (propios, sueltos, ≠ item).
 */
const props = defineProps<{
  open: boolean
  item: WatchlistItem | null
  candidates: WatchlistItem[]
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  pick: [parentItemId: string]
}>()

const TYPE_LABEL: Record<string, string> = { movie: 'Película', series: 'Serie', game: 'Juego' }

function close() {
  if (!props.saving) emit('close')
}
function onKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') close()
}
watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  }
)
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
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
        v-if="open && item"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-item-title"
        @click.self="close"
      >
        <div
          class="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-400/25 bg-neutral-950/95 shadow-2xl shadow-black/60"
        >
          <header class="flex items-start justify-between gap-4 border-b border-white/10 p-5">
            <div class="min-w-0">
              <h2 id="group-item-title" class="text-lg font-semibold text-white">Unir a…</h2>
              <p class="mt-1 text-sm text-white/60">
                <span class="font-medium text-white/80">{{ item.content?.title }}</span>
                va a contar como parte del título que elijas: su tiempo se suma y deja de contarse aparte.
              </p>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Cerrar"
              @click="close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-4 w-4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <ul class="flex-1 overflow-y-auto p-2">
            <li v-if="candidates.length === 0" class="p-6 text-center text-sm text-white/50">
              No hay otros títulos en esta lista a los que unirlo.
            </li>
            <li v-for="c in candidates" :key="c.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50"
                :disabled="saving"
                @click="emit('pick', c.id)"
              >
                <span class="h-14 w-10 flex-none overflow-hidden rounded border border-white/10 bg-zinc-900">
                  <img
                    v-if="c.content?.posterUrl"
                    :src="c.content.posterUrl"
                    :alt="c.content?.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-white">{{ c.content?.title }}</span>
                  <span class="text-xs text-white/50">{{ TYPE_LABEL[c.content?.type ?? ''] ?? '' }}</span>
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 flex-none text-amber-300/70">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
