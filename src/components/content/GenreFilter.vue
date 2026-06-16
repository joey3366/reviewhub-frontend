<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Genre } from '@/api/types'

/**
 * Filtro de géneros multi-select. Reemplaza al row de pills que se desbordaba
 * con muchos géneros. Trigger compacto + popover con búsqueda y lista de
 * checkboxes (scroll si hay decenas/cientos). Semántica del filtro: OR — un
 * content que tenga AL MENOS UNO de los géneros seleccionados aparece.
 *
 * v-model: string[] con los slugs seleccionados. [] = sin filtro.
 * variant: light (páginas claras) o dark (catálogo cinemático).
 */

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    genres: Genre[]
    variant?: 'light' | 'dark'
  }>(),
  { variant: 'light' }
)
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)
const search = ref('')
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLDivElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)

const selectedSet = computed(() => new Set(props.modelValue))

// Match case + accent-insensitive: normalizamos a NFD y sacamos diacríticos
// para que "anime" matchee "Animé" y al revés.
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const filteredGenres = computed(() => {
  const q = normalize(search.value.trim())
  if (!q) return props.genres
  return props.genres.filter((g) => normalize(g.name).includes(q))
})

const triggerLabel = computed(() => {
  const n = props.modelValue.length
  if (n === 0) return 'Géneros'
  if (n === 1) {
    const g = props.genres.find((x) => x.slug === props.modelValue[0])
    return g ? g.name : '1 género'
  }
  return `Géneros · ${n}`
})

function toggle(slug: string) {
  const next = new Set(props.modelValue)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  emit('update:modelValue', Array.from(next))
}

function clearAll() {
  if (props.modelValue.length === 0) return
  emit('update:modelValue', [])
}

function toggleOpen() {
  open.value = !open.value
}

watch(open, (o) => {
  if (!o) return
  search.value = ''
  setTimeout(() => searchInputRef.value?.focus(), 0)
})

function onClickOutside(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (triggerRef.value?.contains(t)) return
  if (popoverRef.value?.contains(t)) return
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false
    triggerRef.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  window.removeEventListener('keydown', onKey)
})

const styles = computed(() => {
  if (props.variant === 'dark') {
    return {
      triggerBase:
        'flex h-10 items-center gap-2 rounded-md border border-white/15 bg-black/30 px-3 text-sm font-medium text-white/80 transition-colors hover:border-amber-400/60 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 [color-scheme:dark]',
      triggerActive: 'border-amber-400 text-amber-300',
      badge: 'flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-black',
      chevron: 'h-3.5 w-3.5 text-white/40 transition-transform',
      popover:
        'absolute left-0 top-full z-30 mt-2 flex w-72 origin-top flex-col overflow-hidden rounded-xl border border-amber-400/25 bg-neutral-950/95 backdrop-blur-xl shadow-2xl shadow-black/70',
      searchBorder: 'border-b border-white/10',
      searchIcon: 'pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40',
      searchInput:
        'h-9 w-full rounded-md border border-white/15 bg-black/30 pl-8 pr-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400',
      emptyText: 'px-3 py-6 text-center text-xs text-white/40',
      rowBase: 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.06]',
      rowSelected: 'text-white',
      rowUnselected: 'text-white/70',
      checkboxBase: 'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
      checkboxOn: 'border-amber-400 bg-amber-400 text-black',
      checkboxOff: 'border-white/25 bg-black/30',
      footerBorder: 'border-t border-white/10 bg-white/[0.04]',
      footerClearActive: 'text-red-300 hover:text-red-200',
      footerClearDisabled: 'text-white/30',
      footerClose: 'text-white/60 hover:text-white',
    }
  }
  return {
    triggerBase:
      'flex h-10 items-center gap-2 rounded-md border border-outline bg-white px-3 text-sm font-medium text-ink transition-colors hover:border-accent focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
    triggerActive: 'border-accent text-accent',
    badge: 'flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white',
    chevron: 'h-3.5 w-3.5 text-ink-subtle transition-transform',
    popover:
      'absolute left-0 top-full z-30 mt-2 flex w-72 origin-top flex-col overflow-hidden rounded-xl border border-outline bg-white shadow-xl shadow-black/10',
    searchBorder: 'border-b border-outline',
    searchIcon: 'pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle',
    searchInput:
      'h-9 w-full rounded-md border border-outline bg-white pl-8 pr-2 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
    emptyText: 'px-3 py-6 text-center text-xs text-ink-subtle',
    rowBase: 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-subtle',
    rowSelected: 'text-ink',
    rowUnselected: 'text-ink-muted',
    checkboxBase: 'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
    checkboxOn: 'border-accent bg-accent text-white',
    checkboxOff: 'border-outline bg-white',
    footerBorder: 'border-t border-outline bg-surface-subtle',
    footerClearActive: 'text-red-600 hover:text-red-700',
    footerClearDisabled: 'text-ink-subtle',
    footerClose: 'text-ink-muted hover:text-ink',
  }
})
</script>

<template>
  <div class="relative inline-block">
    <button
      ref="triggerRef"
      type="button"
      :class="[styles.triggerBase, modelValue.length > 0 ? styles.triggerActive : '']"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
        <path d="M3 4h18l-7 9v6l-4 2v-8L3 4Z" />
      </svg>
      <span>{{ triggerLabel }}</span>
      <span v-if="modelValue.length > 0" :class="styles.badge">{{ modelValue.length }}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="[styles.chevron, open ? 'rotate-180' : '']">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 -translate-y-1 scale-[0.98]"
    >
      <div
        v-if="open"
        ref="popoverRef"
        role="dialog"
        aria-label="Filtrar por género"
        :class="styles.popover"
      >
        <!-- Search -->
        <div class="p-2" :class="styles.searchBorder">
          <div class="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="styles.searchIcon">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref="searchInputRef"
              v-model="search"
              type="text"
              placeholder="Buscar género…"
              :class="styles.searchInput"
            />
          </div>
        </div>

        <!-- Lista -->
        <div class="max-h-64 overflow-y-auto py-1">
          <p v-if="filteredGenres.length === 0" :class="styles.emptyText">
            <template v-if="search">Sin coincidencias para "{{ search }}".</template>
            <template v-else>No hay géneros configurados.</template>
          </p>
          <button
            v-for="g in filteredGenres"
            :key="g.id"
            type="button"
            :class="[styles.rowBase, selectedSet.has(g.slug) ? styles.rowSelected : styles.rowUnselected]"
            @click="toggle(g.slug)"
          >
            <span :class="[styles.checkboxBase, selectedSet.has(g.slug) ? styles.checkboxOn : styles.checkboxOff]">
              <svg v-if="selectedSet.has(g.slug)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span class="flex-1">{{ g.name }}</span>
          </button>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-3 py-2 text-xs" :class="styles.footerBorder">
          <button
            type="button"
            class="font-medium transition-colors disabled:cursor-not-allowed"
            :class="modelValue.length > 0 ? styles.footerClearActive : styles.footerClearDisabled"
            :disabled="modelValue.length === 0"
            @click="clearAll"
          >
            Limpiar selección
          </button>
          <button
            type="button"
            class="font-medium"
            :class="styles.footerClose"
            @click="open = false"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
