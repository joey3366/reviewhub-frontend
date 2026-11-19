<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import axios from 'axios'
import type { Franchise, Watchlist, WatchlistItem } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'

/**
 * Agregar una franquicia a una lista.
 *
 * - Qué agregar: toda la franquicia, o solo lo que te falta (ni visto ni
 *   en alguna lista). Lo que ya esté en la lista destino se saltea (409).
 * - Unir en un grupo: después de agregar, une TODOS los títulos de la
 *   franquicia que haya en esa lista (también los que ya estaban) en una
 *   sola tarjeta con el nombre de la franquicia. Respeta las reglas de la
 *   unión: un solo nivel, no toca títulos unidos a otra cosa ni principales
 *   de otros grupos, ni heredados de listas incluidas.
 *
 * `fixedListId`: si viene (abierto desde una lista), no se elige lista.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    franchise: Franchise | null
    fixedListId?: string | null
    defaultMode?: 'all' | 'missing'
  }>(),
  { fixedListId: null, defaultMode: 'all' }
)

const emit = defineEmits<{
  close: []
  done: [result: { added: number; skipped: number; grouped: number; listName: string }]
}>()

const lists = ref<Watchlist[]>([])
const loadingLists = ref(false)
const selectedId = ref<string | null>(null)
const mode = ref<'all' | 'missing'>('all')
const group = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const contents = computed(() => props.franchise?.contents ?? [])
const missing = computed(() => contents.value.filter((c) => c.viewerStatus === 'none'))
const toAdd = computed(() => (mode.value === 'all' ? contents.value : missing.value))
const hasViewerStatus = computed(() => contents.value.some((c) => c.viewerStatus !== null))

watch(
  () => props.open,
  async (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (!open) return
    error.value = null
    group.value = true
    mode.value = props.defaultMode === 'missing' && missing.value.length > 0 ? 'missing' : 'all'
    if (props.fixedListId) {
      selectedId.value = props.fixedListId
      return
    }
    loadingLists.value = true
    try {
      lists.value = await watchlistsApi.listMine()
      // Si hay una lista con el nombre de la franquicia, la preseleccionamos.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const name = props.franchise?.name ?? ''
      selectedId.value =
        lists.value.find((l) => norm(l.name) === norm(name))?.id ?? lists.value[0]?.id ?? null
    } catch {
      error.value = 'No pudimos cargar tus listas.'
    } finally {
      loadingLists.value = false
    }
  }
)

/**
 * Une en un grupo los títulos de la franquicia presentes en la lista.
 * Principal: el primero (en el orden de la franquicia) que esté suelto.
 * Devuelve cuántos se unieron.
 */
async function groupInList(listId: string): Promise<number> {
  const franchise = props.franchise!
  const wl = await watchlistsApi.show(listId)
  const own = (wl.items ?? []).filter((i) => !i.viaWatchlistId)
  const byContent = new Map(own.map((i) => [i.contentId, i]))
  const childCount = new Map<string, number>()
  for (const i of own) if (i.parentItemId) childCount.set(i.parentItemId, (childCount.get(i.parentItemId) ?? 0) + 1)

  const members = contents.value
    .map((c) => byContent.get(c.id))
    .filter((i): i is WatchlistItem => !!i)
  if (members.length < 2) return 0

  // Si ya hay un grupo con el nombre de la franquicia, lo reusamos.
  const named = members.find((i) => !i.parentItemId && i.groupName === franchise.name)
  const parent = named ?? members.find((i) => !i.parentItemId)
  if (!parent) return 0

  if (!parent.groupName) await watchlistsApi.setGroupName(listId, parent.id, franchise.name)

  let grouped = 0
  for (const item of members) {
    if (item.id === parent.id) continue
    if (item.parentItemId === parent.id) continue // ya estaba en el grupo
    if (item.parentItemId) continue // unido a otra cosa: no lo tocamos
    if ((childCount.get(item.id) ?? 0) > 0) continue // principal de otro grupo
    await watchlistsApi.setItemParent(listId, item.id, parent.id)
    grouped++
  }

  // Orden: los del grupo quedan juntos, en el orden de la franquicia, en el
  // lugar del principal; el resto de la lista no se mueve.
  const groupIds = new Set(
    members
      .filter((i) => i.id === parent.id || i.parentItemId === parent.id || (!i.parentItemId && (childCount.get(i.id) ?? 0) === 0))
      .map((i) => i.id)
  )
  const groupInOrder = members.filter((i) => groupIds.has(i.id)).map((i) => i.id)
  const ordered: string[] = []
  let placed = false
  for (const i of [...own].sort((a, b) => a.position - b.position)) {
    if (!groupIds.has(i.id)) ordered.push(i.id)
    else if (!placed) {
      ordered.push(...groupInOrder)
      placed = true
    }
  }
  await watchlistsApi.reorderItems(listId, ordered)
  return grouped
}

async function confirm() {
  const listId = selectedId.value
  if (!listId || !props.franchise || saving.value) return
  saving.value = true
  error.value = null
  let added = 0
  let skipped = 0
  try {
    for (const c of toAdd.value) {
      try {
        await watchlistsApi.addItem(listId, { contentId: c.id })
        added++
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 409) skipped++
        else throw e
      }
    }
    const grouped = group.value ? await groupInList(listId) : 0
    const listName = lists.value.find((l) => l.id === listId)?.name ?? 'la lista'
    emit('done', { added, skipped, grouped, listName })
  } catch (e) {
    error.value = `Se agregaron ${added}, pero algo falló después. Revisá la lista y probá de nuevo.`
    console.error(e)
  } finally {
    saving.value = false
  }
}

function close() {
  if (!saving.value) emit('close')
}
function onKey(e: KeyboardEvent) {
  if (props.open && e.key === 'Escape') close()
}
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
        v-if="open && franchise"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-franchise-title"
        @click.self="close"
      >
        <div class="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-400/25 bg-neutral-950/95 shadow-2xl shadow-black/60">
          <header class="border-b border-white/10 p-5">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">Franquicia</p>
            <h2 id="add-franchise-title" class="mt-0.5 text-lg font-semibold text-white">Agregar {{ franchise.name }} a una lista</h2>
          </header>

          <div class="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
            <!-- Qué agregar -->
            <fieldset class="flex flex-col gap-2">
              <legend class="mb-1 text-sm font-medium text-white">¿Qué agregar?</legend>
              <label class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors" :class="mode === 'all' ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 hover:bg-white/[0.04]'">
                <input v-model="mode" type="radio" value="all" class="mt-0.5 accent-amber-400" />
                <span>
                  <span class="block text-sm text-white">Toda la franquicia <span class="text-white/50">({{ contents.length }})</span></span>
                  <span class="text-xs text-white/50">Los que ya estén en la lista se saltean.</span>
                </span>
              </label>
              <label
                v-if="hasViewerStatus"
                class="flex items-start gap-3 rounded-lg border p-3 transition-colors"
                :class="[
                  mode === 'missing' ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 hover:bg-white/[0.04]',
                  missing.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                ]"
              >
                <input v-model="mode" type="radio" value="missing" class="mt-0.5 accent-amber-400" :disabled="missing.length === 0" />
                <span>
                  <span class="block text-sm text-white">Solo lo que me falta <span class="text-white/50">({{ missing.length }})</span></span>
                  <span class="text-xs text-white/50">Lo que no viste ni tenés en ninguna lista.</span>
                </span>
              </label>
              <ul v-if="toAdd.length" class="mt-1 flex flex-col gap-0.5 pl-1 text-xs text-white/45">
                <li v-for="c in toAdd" :key="c.id" class="truncate">· {{ c.title }}<span v-if="c.releaseYear" class="text-white/30"> ({{ c.releaseYear }})</span></li>
              </ul>
            </fieldset>

            <!-- Unir -->
            <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 p-3 hover:bg-white/[0.04]">
              <input v-model="group" type="checkbox" class="mt-0.5 accent-amber-400" />
              <span>
                <span class="block text-sm text-white">Unirlos en un grupo “{{ franchise.name }}”</span>
                <span class="text-xs text-white/50">
                  Quedan como una sola tarjeta con ese nombre (cuentan como 1 título). Incluye los que ya estaban en la lista. Se puede separar después.
                </span>
              </span>
            </label>

            <!-- Lista destino -->
            <div v-if="!fixedListId" class="flex flex-col gap-1">
              <span class="text-sm font-medium text-white">Lista</span>
              <p v-if="loadingLists" class="p-2 text-xs text-white/50">Cargando tus listas…</p>
              <p v-else-if="lists.length === 0" class="p-2 text-xs text-white/50">Todavía no tenés listas. Creá una desde “Mis listas”.</p>
              <label
                v-for="l in lists"
                v-else
                :key="l.id"
                class="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-white/[0.05]"
                :class="selectedId === l.id && 'bg-amber-400/10'"
              >
                <input v-model="selectedId" type="radio" name="target-list" :value="l.id" class="accent-amber-400" />
                <span class="min-w-0 flex-1 truncate text-sm text-white">{{ l.name }}</span>
                <span class="text-xs text-white/40">{{ l.itemsCount ?? 0 }} títulos</span>
              </label>
            </div>
          </div>

          <p v-if="error" class="mx-5 mb-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{{ error }}</p>

          <footer class="flex justify-end gap-2 border-t border-white/10 p-4">
            <button type="button" class="rounded-md px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10" :disabled="saving" @click="close">
              Cancelar
            </button>
            <button
              type="button"
              class="rounded-md bg-amber-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-amber-300 disabled:opacity-50"
              :disabled="!selectedId || saving || (toAdd.length === 0 && !group)"
              @click="confirm"
            >
              {{ saving ? 'Agregando…' : `Agregar ${toAdd.length}` }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
