<script setup lang="ts">
import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Genre, GenreAppliesTo } from '@/api/types'
import { adminApi } from '@/api/admin'
import { useToast } from '@/composables/useToast'

const APPLIES_TO_OPTIONS: { value: GenreAppliesTo; label: string }[] = [
  { value: 'all', label: 'Universal' },
  { value: 'movie', label: 'Películas' },
  { value: 'series', label: 'Series' },
  { value: 'game', label: 'Juegos' },
]

const toast = useToast()

/**
 * Modal de gestión de géneros: lista editable con rename inline + delete con
 * confirm inline en cada fila. Mantenemos el slug intacto al renombrar — es
 * un display name change, no un rebrand de URL.
 *
 * El padre pasa la lista completa (`genres`) y emite eventos para sincronizar:
 *  - updated → reemplaza el género en la lista local
 *  - deleted → lo quita de la lista local y de selectedGenreIds (eso lo hace
 *    el padre)
 */

const props = defineProps<{
  open: boolean
  genres: Genre[]
}>()

const emit = defineEmits<{
  close: []
  updated: [Genre]
  deleted: [string]
}>()

const dialogRef = ref<HTMLDivElement | null>(null)
// drafts[id] = nombre tipiado para ese género; ausente = sin cambios.
const drafts = ref<Record<string, string>>({})
// appliesToDrafts[id] = nuevo applies_to seleccionado; ausente = sin cambios.
const appliesToDrafts = ref<Record<string, GenreAppliesTo>>({})
const savingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const confirmingDeleteId = ref<string | null>(null)
const errorById = ref<Record<string, string>>({})

const sortedGenres = computed(() =>
  [...props.genres].sort((a, b) => a.name.localeCompare(b.name))
)

function currentValue(g: Genre): string {
  return drafts.value[g.id] !== undefined ? drafts.value[g.id] : g.name
}

function currentAppliesTo(g: Genre): GenreAppliesTo {
  return appliesToDrafts.value[g.id] ?? g.appliesTo
}

function hasChange(g: Genre): boolean {
  const nameDraft = drafts.value[g.id]
  const appliesDraft = appliesToDrafts.value[g.id]
  const nameChanged =
    nameDraft !== undefined && nameDraft.trim().length > 0 && nameDraft.trim() !== g.name
  const appliesChanged = appliesDraft !== undefined && appliesDraft !== g.appliesTo
  return nameChanged || appliesChanged
}

function setDraft(id: string, value: string) {
  drafts.value = { ...drafts.value, [id]: value }
}

function setAppliesToDraft(id: string, value: GenreAppliesTo) {
  appliesToDrafts.value = { ...appliesToDrafts.value, [id]: value }
}

function clearError(id: string) {
  if (errorById.value[id]) {
    const next = { ...errorById.value }
    delete next[id]
    errorById.value = next
  }
}

async function save(g: Genre) {
  if (!hasChange(g)) return
  const nameDraft = drafts.value[g.id]?.trim()
  const appliesDraft = appliesToDrafts.value[g.id]
  const payload: { name?: string; appliesTo?: GenreAppliesTo } = {}
  if (nameDraft && nameDraft !== g.name) payload.name = nameDraft
  if (appliesDraft && appliesDraft !== g.appliesTo) payload.appliesTo = appliesDraft

  savingId.value = g.id
  clearError(g.id)
  try {
    const updated = await adminApi.updateGenre(g.id, payload)
    emit('updated', updated)
    toast.success(`Género "${updated.name}" actualizado`)
    // Limpiamos drafts para que la fila refleje los valores nuevos desde props.
    const nextDrafts = { ...drafts.value }
    delete nextDrafts[g.id]
    drafts.value = nextDrafts
    const nextApplies = { ...appliesToDrafts.value }
    delete nextApplies[g.id]
    appliesToDrafts.value = nextApplies
  } catch (e) {
    if (axios.isAxiosError(e)) {
      errorById.value = {
        ...errorById.value,
        [g.id]: (e.response?.data as { message?: string })?.message ?? 'No se pudo guardar.',
      }
    } else {
      errorById.value = { ...errorById.value, [g.id]: 'No se pudo guardar.' }
    }
    console.error(e)
  } finally {
    savingId.value = null
  }
}

function startConfirmDelete(g: Genre) {
  confirmingDeleteId.value = g.id
  clearError(g.id)
}
function cancelConfirmDelete() {
  confirmingDeleteId.value = null
}
async function confirmDelete(g: Genre) {
  deletingId.value = g.id
  clearError(g.id)
  try {
    await adminApi.deleteGenre(g.id)
    emit('deleted', g.id)
    toast.success(`Género "${g.name}" eliminado`)
    confirmingDeleteId.value = null
    // Limpiamos cualquier draft pendiente para ese id.
    if (drafts.value[g.id] !== undefined) {
      const nextDrafts = { ...drafts.value }
      delete nextDrafts[g.id]
      drafts.value = nextDrafts
    }
  } catch (e) {
    if (axios.isAxiosError(e)) {
      errorById.value = {
        ...errorById.value,
        [g.id]: (e.response?.data as { message?: string })?.message ?? 'No se pudo eliminar.',
      }
    } else {
      errorById.value = { ...errorById.value, [g.id]: 'No se pudo eliminar.' }
    }
    console.error(e)
  } finally {
    deletingId.value = null
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
      drafts.value = {}
      appliesToDrafts.value = {}
      confirmingDeleteId.value = null
      errorById.value = {}
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
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="genre-manager-title"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-outline bg-white shadow-2xl focus:outline-none"
        >
          <header class="flex items-start justify-between gap-4 border-b border-outline px-5 py-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-ink-subtle">Admin</p>
              <h2 id="genre-manager-title" class="mt-0.5 text-lg font-semibold text-ink">Géneros</h2>
              <p class="mt-1 text-xs text-ink-muted">
                {{ sortedGenres.length }} {{ sortedGenres.length === 1 ? 'género' : 'géneros' }}.
                Renombrar acá no cambia el slug de URL.
              </p>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-subtle hover:text-ink"
              aria-label="Cerrar"
              @click="close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div class="flex-1 overflow-y-auto px-5 py-3">
            <p v-if="sortedGenres.length === 0" class="py-8 text-center text-sm text-ink-subtle">
              No hay géneros todavía. Creá uno desde el form de contenido.
            </p>
            <ul v-else class="flex flex-col divide-y divide-outline">
              <li v-for="g in sortedGenres" :key="g.id" class="py-3">
                <!-- Confirmación de eliminación inline -->
                <div
                  v-if="confirmingDeleteId === g.id"
                  class="flex flex-col gap-3 rounded-md border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p class="text-sm text-red-700">
                    ¿Eliminar <span class="font-semibold">{{ g.name }}</span>?
                    Se desvincula de los contenidos que lo usen (no los borra).
                  </p>
                  <div class="flex shrink-0 gap-2">
                    <button
                      type="button"
                      class="h-9 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="deletingId === g.id"
                      @click="cancelConfirmDelete"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-9 items-center gap-2 rounded-md bg-red-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="deletingId === g.id"
                      @click="confirmDelete(g)"
                    >
                      <span v-if="deletingId === g.id" class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Eliminar
                    </button>
                  </div>
                </div>
                <!-- Fila normal: input + select de aplica-a + acciones -->
                <div v-else class="flex items-center gap-2">
                  <input
                    type="text"
                    maxlength="80"
                    :value="currentValue(g)"
                    :disabled="savingId === g.id"
                    class="h-9 min-w-0 flex-1 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                    @input="(e) => setDraft(g.id, (e.target as HTMLInputElement).value)"
                    @keydown.enter.prevent="hasChange(g) && save(g)"
                  />
                  <select
                    :value="currentAppliesTo(g)"
                    :disabled="savingId === g.id"
                    :title="`Aplica a: ${currentAppliesTo(g)}`"
                    class="h-9 shrink-0 rounded-md border border-outline bg-white px-2 text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                    @change="(e) => setAppliesToDraft(g.id, (e.target as HTMLSelectElement).value as GenreAppliesTo)"
                  >
                    <option v-for="opt in APPLIES_TO_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                  <button
                    v-if="hasChange(g)"
                    type="button"
                    class="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="savingId === g.id"
                    @click="save(g)"
                  >
                    <span v-if="savingId === g.id" class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Guardar
                  </button>
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-red-50 hover:text-red-600"
                    :aria-label="`Eliminar ${g.name}`"
                    title="Eliminar"
                    @click="startConfirmDelete(g)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
                <p v-if="errorById[g.id]" class="mt-1.5 text-xs text-red-600">{{ errorById[g.id] }}</p>
              </li>
            </ul>
          </div>

          <footer class="flex items-center justify-end border-t border-outline bg-surface-subtle px-5 py-3">
            <button
              type="button"
              class="h-9 rounded-md border border-outline bg-white px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle"
              @click="close"
            >
              Cerrar
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
