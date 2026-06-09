<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Watchlist } from '@/api/types'
import { watchlistsApi } from '@/api/watchlists'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

const router = useRouter()

const lists = ref<Watchlist[]>([])
const covers = ref<Record<string, string | null>>({})
const loading = ref(true)
const error = ref<string | null>(null)
const actionError = ref<string | null>(null)

// Tabs por tipo: 'all' | 'movies' | 'series'. Persistido entre sesiones.
type ListsTab = 'all' | 'movies' | 'series'
const TAB_KEY = 'reviewhub_lists_tab'
function readTab(): ListsTab {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(TAB_KEY) : null
  return raw === 'movies' || raw === 'series' ? raw : 'all'
}
const activeTab = ref<ListsTab>(readTab())
watch(activeTab, (v) => {
  try { localStorage.setItem(TAB_KEY, v) } catch { /* localStorage puede fallar en privado */ }
})

// Una lista entra en "Películas" si tiene al menos 1 movie; idem "Series".
// Las mixtas aparecen en ambas pestañas (eso es la promesa visual del tab).
const filteredLists = computed(() => {
  if (activeTab.value === 'all') return lists.value
  if (activeTab.value === 'movies') return lists.value.filter((l) => (l.moviesCount ?? 0) > 0)
  return lists.value.filter((l) => (l.seriesCount ?? 0) > 0)
})

const counts = computed(() => ({
  all: lists.value.length,
  movies: lists.value.filter((l) => (l.moviesCount ?? 0) > 0).length,
  series: lists.value.filter((l) => (l.seriesCount ?? 0) > 0).length,
}))

// Crear
const showCreate = ref(false)
const newName = ref('')
const creating = ref(false)

// Renombrar inline
const editingId = ref<string | null>(null)
const editName = ref('')
const savingEdit = ref(false)

// Menú ⋯ y operaciones por-fila
const menuOpenId = ref<string | null>(null)
const busyId = ref<string | null>(null)

// Partículas de polvo dorado (posiciones/tiempos fijos para variedad)
const particles = [
  { top: '12%', left: '8%', size: 3, delay: 0, dur: 11 },
  { top: '22%', left: '78%', size: 5, delay: 1.5, dur: 14 },
  { top: '40%', left: '30%', size: 2, delay: 3, dur: 9 },
  { top: '60%', left: '88%', size: 4, delay: 0.8, dur: 13 },
  { top: '70%', left: '15%', size: 3, delay: 2.2, dur: 12 },
  { top: '35%', left: '55%', size: 2, delay: 4, dur: 10 },
  { top: '82%', left: '60%', size: 5, delay: 1, dur: 15 },
  { top: '50%', left: '70%', size: 3, delay: 3.5, dur: 11 },
]

// Reordenar por drag. El orden se guarda en tu cuenta (backend: columna
// position), así que persiste y se ve igual en cualquier dispositivo.
const dragIndex = ref<number | null>(null)

async function persistOrder() {
  try {
    await watchlistsApi.reorder(lists.value.map((l) => l.id))
  } catch (e) {
    console.error(e)
    actionError.value = 'No se pudo guardar el orden.'
  }
}

function onDragStart(index: number) {
  // El reorder solo funciona en "Todas": el orden vive en una columna global
  // (position) y reordenar una vista filtrada produciría un desorden raro.
  if (activeTab.value !== 'all') return
  dragIndex.value = index
}
function onDragEnter(index: number) {
  if (activeTab.value !== 'all') return
  if (dragIndex.value === null || dragIndex.value === index) return
  const arr = [...lists.value]
  const [moved] = arr.splice(dragIndex.value, 1)
  arr.splice(index, 0, moved)
  lists.value = arr
  dragIndex.value = index
}
function onDragEnd() {
  if (dragIndex.value === null) return
  dragIndex.value = null
  persistOrder()
}

// Clic en la card → al detalle (salvo si estás renombrando esa lista).
function goToDetail(list: Watchlist) {
  if (editingId.value === list.id) return
  router.push(`/watchlists/${list.id}`)
}

async function loadLists() {
  loading.value = true
  error.value = null
  try {
    lists.value = await watchlistsApi.listMine()
    loadCovers() // en paralelo, no bloquea el render
  } catch (e) {
    error.value = 'No pudimos cargar tus listas.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

// listMine no trae items; la portada es el BACKDROP (banner ancho) del título
// con MAYOR calificación de la lista. Por eso pedimos el detalle de cada una.
async function loadCovers() {
  const entries = await Promise.all(
    lists.value.map(async (l) => {
      try {
        const wl = await watchlistsApi.show(l.id)
        const best = (wl.items ?? []).reduce<NonNullable<typeof wl.items>[number] | null>(
          (top, it) => {
            const r = it.content?.avgRating ?? -1
            const topR = top?.content?.avgRating ?? -1
            return r > topR ? it : top
          },
          null
        )
        // Preferimos el banner ancho; si no hay, caemos al poster.
        const cover = best?.content?.backdropUrl ?? best?.content?.posterUrl ?? null
        return [l.id, cover] as const
      } catch {
        return [l.id, null] as const
      }
    })
  )
  covers.value = Object.fromEntries(entries)
}

function itemsLabel(n: number | undefined) {
  const count = n ?? 0
  return `${count} ${count === 1 ? 'título' : 'títulos'}`
}

// --- Crear ---
function openCreate() {
  showCreate.value = true
  newName.value = ''
  actionError.value = null
}
async function submitCreate() {
  const name = newName.value.trim()
  if (name.length < 3) {
    actionError.value = 'El nombre necesita al menos 3 caracteres.'
    return
  }
  creating.value = true
  actionError.value = null
  try {
    const wl = await watchlistsApi.create({ name })
    lists.value.unshift(wl)
    covers.value = { ...covers.value, [wl.id]: null }
    persistOrder()
    showCreate.value = false
    newName.value = ''
  } catch (e) {
    actionError.value = 'No se pudo crear la lista.'
    console.error(e)
  } finally {
    creating.value = false
  }
}

// --- Renombrar ---
function startRename(list: Watchlist) {
  menuOpenId.value = null
  editingId.value = list.id
  editName.value = list.name
  actionError.value = null
}
function cancelRename() {
  editingId.value = null
  editName.value = ''
}
async function submitRename(list: Watchlist) {
  const name = editName.value.trim()
  if (name.length < 3) {
    actionError.value = 'El nombre necesita al menos 3 caracteres.'
    return
  }
  if (name === list.name) {
    cancelRename()
    return
  }
  savingEdit.value = true
  try {
    const updated = await watchlistsApi.update(list.id, { name })
    list.name = updated.name
    cancelRename()
  } catch (e) {
    actionError.value = 'No se pudo renombrar la lista.'
    console.error(e)
  } finally {
    savingEdit.value = false
  }
}

// --- Visibilidad ---
async function toggleVisibility(list: Watchlist) {
  menuOpenId.value = null
  if (busyId.value) return
  busyId.value = list.id
  actionError.value = null
  try {
    const updated = await watchlistsApi.update(list.id, { isPublic: !list.isPublic })
    list.isPublic = updated.isPublic
  } catch (e) {
    actionError.value = 'No se pudo cambiar la visibilidad.'
    console.error(e)
  } finally {
    busyId.value = null
  }
}

// --- Borrar ---
const listToDelete = ref<Watchlist | null>(null)

function removeList(list: Watchlist) {
  menuOpenId.value = null
  listToDelete.value = list
}
const removeMessage = computed(() => {
  const l = listToDelete.value
  return l ? `¿Borrar la lista "${l.name}"? No se puede deshacer.` : ''
})
async function confirmRemoveList() {
  const list = listToDelete.value
  if (!list) return
  busyId.value = list.id
  actionError.value = null
  try {
    await watchlistsApi.destroy(list.id)
    lists.value = lists.value.filter((l) => l.id !== list.id)
    listToDelete.value = null
    persistOrder()
  } catch (e) {
    actionError.value = 'No se pudo borrar la lista.'
    console.error(e)
    listToDelete.value = null
  } finally {
    busyId.value = null
  }
}

// --- Menú ⋯ ---
function toggleMenu(id: string) {
  menuOpenId.value = menuOpenId.value === id ? null : id
}
function closeMenus() {
  menuOpenId.value = null
}
watch(menuOpenId, (v) => {
  if (v) document.addEventListener('click', closeMenus)
  else document.removeEventListener('click', closeMenus)
})
onBeforeUnmount(() => document.removeEventListener('click', closeMenus))

onMounted(loadLists)
</script>

<template>
  <div class="relative min-h-[calc(100vh-3.5rem)] overflow-hidden text-white">
    <!-- Fondo cinematográfico -->
    <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-b from-zinc-950 via-black to-black" />
      <div
        class="bg-render ken-burns absolute inset-0 bg-cover bg-center"
        style="background-image: url(/watchlists-bg.png)"
      />
      <div class="absolute inset-0 bg-gradient-to-b from-black/75 via-black/45 to-black/90" />
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
    <div class="relative z-10 mx-auto max-w-7xl px-6 py-12 md:px-12">
      <header class="flex items-end justify-between gap-4">
        <div class="flex flex-col gap-2">
          <h1 class="text-4xl font-bold tracking-tight">Mis listas</h1>
          <p v-if="!loading && !error" class="text-sm text-amber-300/80">
            {{ filteredLists.length }} {{ filteredLists.length === 1 ? 'lista' : 'listas' }}
            <span v-if="activeTab !== 'all'" class="text-white/40">
              de {{ lists.length }} {{ lists.length === 1 ? 'total' : 'totales' }}
            </span>
          </p>
          <p v-else class="text-sm text-white/50">Cargando…</p>
        </div>
        <button
          v-if="!showCreate"
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300"
          @click="openCreate"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva lista
        </button>
      </header>

      <!-- Crear -->
      <form
        v-if="showCreate"
        class="mt-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm sm:flex-row sm:items-end"
        @submit.prevent="submitCreate"
      >
        <label class="flex flex-1 flex-col gap-1.5">
          <span class="text-sm font-medium text-white">Nombre de la lista</span>
          <input
            v-model="newName"
            type="text"
            maxlength="120"
            placeholder="Ej. Ver más tarde"
            autofocus
            class="h-10 rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </label>
        <div class="flex items-center gap-2">
          <button
            type="submit"
            class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-semibold text-black transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="creating || newName.trim().length < 3"
          >
            <span v-if="creating" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Crear
          </button>
          <button
            type="button"
            class="h-10 rounded-md px-4 text-sm font-medium text-white/70 transition-colors hover:bg-white/5"
            :disabled="creating"
            @click="showCreate = false"
          >
            Cancelar
          </button>
        </div>
      </form>

      <!-- Tabs por tipo -->
      <div
        v-if="!loading && !error && lists.length > 0"
        role="tablist"
        class="mt-6 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-sm"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'all'"
          class="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          :class="activeTab === 'all' ? 'bg-amber-400 text-black shadow' : 'text-white/70 hover:text-white'"
          @click="activeTab = 'all'"
        >
          Todas
          <span class="text-xs opacity-70">{{ counts.all }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'movies'"
          class="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          :class="activeTab === 'movies' ? 'bg-amber-400 text-black shadow' : 'text-white/70 hover:text-white'"
          @click="activeTab = 'movies'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M2 8h20M6 4v16M18 4v16" />
          </svg>
          Películas
          <span class="text-xs opacity-70">{{ counts.movies }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'series'"
          class="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          :class="activeTab === 'series' ? 'bg-amber-400 text-black shadow' : 'text-white/70 hover:text-white'"
          @click="activeTab = 'series'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="m8 2 4 4 4-4" />
          </svg>
          Series
          <span class="text-xs opacity-70">{{ counts.series }}</span>
        </button>
      </div>

      <p v-if="actionError" class="mt-6 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
        {{ actionError }}
      </p>

      <!-- Loading -->
      <div v-if="loading" class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 3" :key="i" class="h-64 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="mt-8 rounded-xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-300">
        {{ error }}
      </div>

      <!-- Vacío -->
      <div
        v-else-if="lists.length === 0"
        class="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center backdrop-blur-sm"
      >
        <p class="text-lg font-semibold text-white">Todavía no tenés listas</p>
        <p class="text-sm text-white/60">Creá tu primera lista y empezá a guardar pelis y series.</p>
        <button
          v-if="!showCreate"
          type="button"
          class="mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black transition-colors hover:bg-amber-300"
          @click="openCreate"
        >
          + Nueva lista
        </button>
      </div>

      <!-- Filtro vacío (tiene listas pero ninguna del tipo del tab) -->
      <div
        v-else-if="filteredLists.length === 0"
        class="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center backdrop-blur-sm"
      >
        <p class="text-lg font-semibold text-white">
          <template v-if="activeTab === 'movies'">No tenés listas con películas</template>
          <template v-else>No tenés listas con series</template>
        </p>
        <p class="text-sm text-white/60">
          Agregá algún título del tipo correspondiente a tus listas, o cambiá de pestaña.
        </p>
        <button
          type="button"
          class="mt-1 inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
          @click="activeTab = 'all'"
        >
          Ver todas
        </button>
      </div>

      <!-- Grilla -->
      <div v-else class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="(list, index) in filteredLists"
          :key="list.id"
          :draggable="editingId !== list.id && activeTab === 'all'"
          class="card-glow group relative flex h-64 flex-col justify-end overflow-hidden rounded-2xl border border-amber-400/25 bg-zinc-900 transition-all duration-200"
          :class="[
            activeTab === 'all' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
            dragIndex === index ? 'scale-[0.97] opacity-60 ring-2 ring-amber-300/70' : '',
          ]"
          @click="goToDetail(list)"
          @dragstart="onDragStart(index)"
          @dragenter.prevent="onDragEnter(index)"
          @dragover.prevent
          @dragend="onDragEnd"
        >
          <!-- Portada -->
          <div class="absolute inset-0">
            <div
              v-if="covers[list.id]"
              class="h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              :style="{ backgroundImage: `url(${covers[list.id]})` }"
            />
            <div v-else class="h-full w-full bg-gradient-to-br from-amber-500/20 via-zinc-900 to-black" />
            <div class="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/20" />
          </div>

          <!-- Badge visibilidad -->
          <span
            class="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-black/50 px-2.5 py-1 text-xs font-medium text-amber-300 backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
              <template v-if="list.isPublic">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20" />
              </template>
              <template v-else>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </template>
            </svg>
            {{ list.isPublic ? 'Pública' : 'Privada' }}
          </span>

          <!-- Menú ⋯ -->
          <div class="absolute right-2 top-2" @click.stop>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white"
              :aria-label="`Opciones de ${list.name}`"
              @click="toggleMenu(list.id)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            <div
              v-if="menuOpenId === list.id"
              class="absolute right-0 top-10 z-10 w-44 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 py-1 shadow-2xl shadow-black/60 backdrop-blur-xl"
            >
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-white transition-colors hover:bg-white/5" @click="startRename(list)">
                Renombrar
              </button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-white transition-colors hover:bg-white/5" @click="toggleVisibility(list)">
                {{ list.isPublic ? 'Hacer privada' : 'Hacer pública' }}
              </button>
              <button type="button" class="block w-full px-4 py-2 text-left text-sm text-red-300 transition-colors hover:bg-red-500/10" @click="removeList(list)">
                Borrar
              </button>
            </div>
          </div>

          <!-- Nombre + conteo -->
          <div class="relative p-5">
            <template v-if="editingId === list.id">
              <input
                v-model="editName"
                type="text"
                maxlength="120"
                class="h-9 w-full rounded-md border border-amber-400 bg-black/60 px-2.5 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                @click.stop
                @keyup.enter="submitRename(list)"
                @keyup.esc="cancelRename"
              />
              <div class="mt-2 flex items-center gap-2" @click.stop>
                <button
                  type="button"
                  class="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-400 px-3 text-xs font-semibold text-black transition-colors hover:bg-amber-300 disabled:opacity-50"
                  :disabled="savingEdit"
                  @click="submitRename(list)"
                >
                  <span v-if="savingEdit" class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Guardar
                </button>
                <button type="button" class="h-8 rounded-md px-3 text-xs font-medium text-white/70 hover:bg-white/10" :disabled="savingEdit" @click="cancelRename">
                  Cancelar
                </button>
              </div>
            </template>
            <template v-else>
              <span class="text-xl font-semibold tracking-tight text-white transition-colors group-hover:text-amber-300">
                {{ list.name }}
              </span>
              <p class="mt-0.5 text-sm text-white/60">{{ itemsLabel(list.itemsCount) }}</p>
            </template>
          </div>
        </article>
      </div>

      <!-- Frase -->
      <p v-if="!loading && lists.length > 0" class="mt-14 text-center text-sm italic text-white/40">
        <span class="text-amber-300/60">“</span>
        Cada lista es una historia en construcción.
        <span class="text-amber-300/60">”</span>
      </p>
    </div>

    <ConfirmModal
      :open="listToDelete !== null"
      title="Borrar lista"
      :message="removeMessage"
      confirm-label="Borrar"
      variant="destructive"
      :loading="busyId !== null"
      @close="listToDelete = null"
      @confirm="confirmRemoveList"
    />
  </div>
</template>

<style scoped>
@keyframes kenBurns {
  0% { transform: scale(1.05) translate(0, 0); }
  50% { transform: scale(1.14) translate(-1.5%, -1%); }
  100% { transform: scale(1.05) translate(0, 0); }
}
.ken-burns {
  animation: kenBurns 40s ease-in-out infinite;
  transform-origin: center;
}

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

@keyframes goldGlow {
  0%, 100% {
    box-shadow: 0 0 18px -6px rgba(251, 191, 36, 0.35), inset 0 0 0 1px rgba(251, 191, 36, 0.1);
  }
  50% {
    box-shadow: 0 0 30px -4px rgba(251, 191, 36, 0.55), inset 0 0 0 1px rgba(251, 191, 36, 0.22);
  }
}
.card-glow {
  box-shadow: 0 0 22px -6px rgba(251, 191, 36, 0.4), inset 0 0 0 1px rgba(251, 191, 36, 0.15);
  animation: goldGlow 4.5s ease-in-out infinite;
}
.card-glow:hover {
  animation: none;
  border-color: rgba(252, 211, 77, 0.7);
  box-shadow: 0 0 42px -2px rgba(251, 191, 36, 0.7), inset 0 0 0 1px rgba(252, 211, 77, 0.45);
}

@media (prefers-reduced-motion: reduce) {
  .ken-burns,
  .dust,
  .card-glow {
    animation: none;
  }
  .dust {
    opacity: 0.4;
  }
}
</style>
