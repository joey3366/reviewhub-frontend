<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Content } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ content: Content }>()

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

interface ListRow {
  id: string
  name: string
  inList: boolean
  itemId: string | null // id del WatchlistItem (para poder quitarlo)
  busy: boolean
}

const open = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
const rows = ref<ListRow[]>([])
const newListName = ref('')
const creating = ref(false)

const inAnyList = computed(() => rows.value.some((r) => r.inList))
const loadedOnce = ref(false)

async function toggleOpen() {
  if (!auth.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  open.value = !open.value
  if (open.value && !loadedOnce.value) await loadRows()
}

async function loadRows() {
  loading.value = true
  error.value = null
  try {
    const lists = await watchlistsApi.listMine()
    // listMine no trae los items; para saber si este contenido ya está en cada
    // lista pedimos el detalle de cada una. N+1, pero N = tus listas (pocas).
    const details = await Promise.all(lists.map((l) => watchlistsApi.show(l.id)))
    rows.value = details.map((wl) => {
      const item = wl.items?.find((it) => it.contentId === props.content.id)
      return {
        id: wl.id,
        name: wl.name,
        inList: Boolean(item),
        itemId: item?.id ?? null,
        busy: false,
      }
    })
    loadedOnce.value = true
  } catch {
    error.value = 'No pudimos cargar tus listas.'
  } finally {
    loading.value = false
  }
}

async function toggleRow(row: ListRow) {
  if (row.busy) return
  row.busy = true
  error.value = null
  try {
    if (row.inList && row.itemId) {
      await watchlistsApi.removeItem(row.id, row.itemId)
      row.inList = false
      row.itemId = null
    } else {
      const item = await watchlistsApi.addItem(row.id, { contentId: props.content.id })
      row.inList = true
      row.itemId = item.id
      open.value = false // al guardar, cerramos el popover
    }
  } catch {
    error.value = 'No se pudo actualizar la lista.'
  } finally {
    row.busy = false
  }
}

async function createList() {
  const name = newListName.value.trim()
  if (name.length < 3) {
    error.value = 'El nombre necesita al menos 3 caracteres.'
    return
  }
  creating.value = true
  error.value = null
  try {
    const wl = await watchlistsApi.create({ name })
    // Crear una lista desde acá implica querer meter este contenido en ella.
    const item = await watchlistsApi.addItem(wl.id, { contentId: props.content.id })
    rows.value.unshift({ id: wl.id, name: wl.name, inList: true, itemId: item.id, busy: false })
    newListName.value = ''
    open.value = false // recién creada y guardada → cerramos
  } catch {
    error.value = 'No se pudo crear la lista.'
  } finally {
    creating.value = false
  }
}

// El panel se teleporta al <body> para no quedar recortado por el
// overflow-hidden del hero. Calculamos su posición (debajo del botón) a
// partir del rect del botón, y la recalculamos al scrollear/redimensionar.
// El maxHeight se ajusta al espacio disponible abajo; la lista scrollea
// internamente y el formulario queda siempre visible.
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function positionPanel() {
  const el = rootEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  panelStyle.value = {
    top: `${r.bottom + 8}px`,
    left: `${r.left}px`,
    maxHeight: `${Math.max(180, window.innerHeight - r.bottom - 24)}px`,
  }
}

function onDocClick(e: MouseEvent) {
  const target = e.target as Node
  if (rootEl.value?.contains(target)) return
  if (panelEl.value?.contains(target)) return
  open.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    positionPanel()
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKeydown)
    window.addEventListener('scroll', positionPanel, { passive: true })
    window.addEventListener('resize', positionPanel)
  } else {
    document.removeEventListener('click', onDocClick)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('scroll', positionPanel)
    window.removeEventListener('resize', positionPanel)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', positionPanel)
  window.removeEventListener('resize', positionPanel)
})
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      :aria-expanded="open"
      :aria-label="inAnyList ? 'En tu lista' : 'Agregar a mi lista'"
      :title="inAnyList ? 'En tu lista' : 'Mi lista'"
      :class="[
        'flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-medium transition-colors',
        inAnyList
          ? 'w-11 border-amber-400/70 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
          : 'px-4 border-white/25 text-white hover:bg-white/10',
      ]"
      @click="toggleOpen"
    >
      <svg
        v-if="inAnyList"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-5 w-5"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <template v-else>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Mi lista
      </template>
    </button>

    <Teleport to="body">
      <Transition name="pop">
        <div
          v-if="open"
          ref="panelEl"
          :style="panelStyle"
          class="fixed z-50 flex w-80 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <p class="flex-none border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/50">
            Guardar en…
          </p>

          <div v-if="loading" class="flex flex-none flex-col gap-2 p-4">
            <div v-for="i in 3" :key="i" class="h-9 animate-pulse rounded-md bg-white/5" />
          </div>

          <ul v-else-if="rows.length" class="min-h-0 flex-1 overflow-y-auto py-1">
            <li v-for="row in rows" :key="row.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/5 disabled:opacity-50"
                :disabled="row.busy"
                @click="toggleRow(row)"
              >
                <span
                  :class="[
                    'flex h-5 w-5 flex-none items-center justify-center rounded border transition-colors',
                    row.inList ? 'border-amber-400 bg-amber-400 text-black' : 'border-white/30',
                  ]"
                >
                  <svg
                    v-if="row.inList"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="h-3 w-3"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <span class="truncate">{{ row.name }}</span>
              </button>
            </li>
          </ul>

          <p v-else class="flex-none px-4 py-3 text-sm text-white/50">
            Todavía no tenés listas. Creá la primera 👇
          </p>

          <form class="flex flex-none items-center gap-2 border-t border-white/10 p-3" @submit.prevent="createList">
            <input
              v-model="newListName"
              type="text"
              maxlength="120"
              placeholder="Nueva lista…"
              class="h-9 min-w-0 flex-1 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button
              type="submit"
              class="inline-flex h-9 flex-none items-center justify-center rounded-md bg-white px-3 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="creating || newListName.trim().length < 3"
            >
              <span
                v-if="creating"
                class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
              <span v-else>Crear</span>
            </button>
          </form>

          <p v-if="error" class="flex-none px-4 pb-3 text-xs text-red-300">{{ error }}</p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .pop-enter-active,
  .pop-leave-active {
    transition: none;
  }
}
</style>
