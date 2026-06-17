<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { contentApi } from '@/api/content'
import type { Content } from '@/api/types'

const props = defineProps<{
  variant?: 'light' | 'dark'
}>()

const router = useRouter()
const variant = computed(() => props.variant ?? 'light')

const query = ref('')
const results = ref<Content[]>([])
const loading = ref(false)
const open = ref(false)
const activeIndex = ref(-1)
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLDivElement | null>(null)
const requestId = ref(0)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const typeLabel: Record<Content['type'], string> = {
  movie: 'Película',
  series: 'Serie',
  game: 'Juego',
}

async function runSearch(q: string) {
  const id = ++requestId.value
  loading.value = true
  try {
    const result = await contentApi.list({ q, perPage: 8 })
    if (id !== requestId.value) return
    results.value = result.data
    activeIndex.value = result.data.length > 0 ? 0 : -1
  } catch (e) {
    if (id !== requestId.value) return
    results.value = []
    activeIndex.value = -1
    console.error(e)
  } finally {
    if (id === requestId.value) loading.value = false
  }
}

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = val.trim()
  if (trimmed.length < 2) {
    results.value = []
    activeIndex.value = -1
    loading.value = false
    return
  }
  debounceTimer = setTimeout(() => runSearch(trimmed), 300)
})

function handleFocus() {
  open.value = true
}

function handleClickOutside(e: MouseEvent) {
  if (!rootRef.value) return
  if (!rootRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (results.value.length === 0) return
    activeIndex.value = (activeIndex.value + 1) % results.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (results.value.length === 0) return
    activeIndex.value =
      activeIndex.value <= 0 ? results.value.length - 1 : activeIndex.value - 1
  } else if (e.key === 'Enter') {
    if (activeIndex.value >= 0 && results.value[activeIndex.value]) {
      e.preventDefault()
      selectResult(results.value[activeIndex.value])
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeAndReset()
    inputRef.value?.blur()
  }
}

function handleGlobalShortcut(e: KeyboardEvent) {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault()
    inputRef.value?.focus()
    open.value = true
  }
}

function selectResult(c: Content) {
  router.push(`/contents/${c.slug}`)
  closeAndReset()
}

function closeAndReset() {
  open.value = false
  query.value = ''
  results.value = []
  activeIndex.value = -1
}

watch(activeIndex, async (idx) => {
  if (idx < 0) return
  await nextTick()
  const el = document.getElementById(`global-search-result-${idx}`)
  el?.scrollIntoView({ block: 'nearest' })
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleGlobalShortcut)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleGlobalShortcut)
  if (debounceTimer) clearTimeout(debounceTimer)
})

const styles = computed(() => {
  if (variant.value === 'dark') {
    return {
      input:
        'w-full rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-9 pr-3 text-sm text-white placeholder-white/40 outline-none transition focus:border-amber-300/60 focus:bg-white/[0.1] focus:ring-2 focus:ring-amber-300/20',
      iconColor: 'text-white/50',
      kbd: 'border-white/15 bg-white/[0.06] text-white/50',
      dropdown:
        'absolute left-0 right-0 top-full z-50 mt-2 max-h-[28rem] overflow-y-auto rounded-xl border border-white/10 bg-neutral-950/95 backdrop-blur-xl shadow-2xl',
      itemBase: 'flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors',
      itemActive: 'bg-amber-300/10 text-white',
      itemIdle: 'text-white/80 hover:bg-white/5',
      meta: 'text-xs text-white/40',
      empty: 'px-3 py-6 text-center text-sm text-white/40',
      hint: 'border-t border-white/10 px-3 py-2 text-[11px] text-white/40',
    }
  }
  return {
    input:
      'w-full rounded-full border border-outline bg-surface-subtle py-1.5 pl-9 pr-3 text-sm text-ink placeholder-ink-muted/60 outline-none transition focus:border-ink/40 focus:bg-surface focus:ring-2 focus:ring-ink/10',
    iconColor: 'text-ink-muted',
    kbd: 'border-outline bg-surface text-ink-muted',
    dropdown:
      'absolute left-0 right-0 top-full z-50 mt-2 max-h-[28rem] overflow-y-auto rounded-xl border border-outline bg-surface shadow-xl',
    itemBase: 'flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors',
    itemActive: 'bg-surface-subtle text-ink',
    itemIdle: 'text-ink hover:bg-surface-subtle',
    meta: 'text-xs text-ink-muted',
    empty: 'px-3 py-6 text-center text-sm text-ink-muted',
    hint: 'border-t border-outline px-3 py-2 text-[11px] text-ink-muted',
  }
})

const showDropdown = computed(
  () => open.value && (loading.value || results.value.length > 0 || query.value.trim().length >= 2)
)
</script>

<template>
  <div ref="rootRef" class="relative w-full max-w-md">
    <div class="relative">
      <svg
        :class="['pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', styles.iconColor]"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clip-rule="evenodd"
        />
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        :class="styles.input"
        placeholder="Buscar título…"
        autocomplete="off"
        aria-label="Buscar contenido"
        @focus="handleFocus"
        @keydown="handleKeydown"
      />
      <kbd
        v-if="!query"
        :class="['pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] font-medium md:block', styles.kbd]"
      >
        /
      </kbd>
    </div>

    <div v-if="showDropdown" :class="styles.dropdown">
      <div v-if="loading" :class="styles.empty">Buscando…</div>
      <div v-else-if="results.length === 0" :class="styles.empty">
        Sin resultados para "{{ query.trim() }}"
      </div>
      <ul v-else class="py-1">
        <li
          v-for="(c, idx) in results"
          :id="`global-search-result-${idx}`"
          :key="c.id"
          :class="[styles.itemBase, idx === activeIndex ? styles.itemActive : styles.itemIdle]"
          @mouseenter="activeIndex = idx"
          @mousedown.prevent="selectResult(c)"
        >
          <div class="h-12 w-8 flex-shrink-0 overflow-hidden rounded bg-black/40">
            <img
              v-if="c.posterUrl"
              :src="c.posterUrl"
              :alt="c.title"
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium">{{ c.title }}</div>
            <div :class="['flex items-center gap-1.5', styles.meta]">
              <span>{{ typeLabel[c.type] }}</span>
              <span v-if="c.releaseYear">· {{ c.releaseYear }}</span>
              <span v-if="c.avgRating !== null">· ★ {{ c.avgRating.toFixed(1) }}</span>
            </div>
          </div>
        </li>
      </ul>
      <div v-if="results.length > 0 && !loading" :class="styles.hint">
        ↑↓ navegar · Enter abrir · Esc cerrar
      </div>
    </div>
  </div>
</template>
