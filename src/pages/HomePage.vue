<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { contentApi } from '@/api/content'
import type { Content, Genre, PaginationMeta } from '@/api/types'
import ContentCard from '@/components/content/ContentCard.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const contents = ref<Content[]>([])
const genres = ref<Genre[]>([])
const meta = ref<PaginationMeta | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const page = ref(1)
const sort = ref<'top' | 'recent'>('top')
const selectedGenre = ref<string | null>(null)

const sortOptions = [
  { value: 'top', label: 'Mejor calificadas' },
  { value: 'recent', label: 'Más recientes' },
]

async function loadContents() {
  loading.value = true
  error.value = null
  try {
    const result = await contentApi.list({
      page: page.value,
      sort: sort.value,
      genre: selectedGenre.value ?? undefined,
    })
    contents.value = result.data
    meta.value = result.metadata
  } catch (e) {
    error.value = 'No pudimos cargar el catálogo. Asegurate que el backend esté corriendo en localhost:3333.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function loadGenres() {
  try {
    genres.value = await contentApi.genres()
  } catch (e) {
    console.error(e)
  }
}

function selectGenre(slug: string | null) {
  selectedGenre.value = slug
  page.value = 1
}

function changePage(newPage: number) {
  page.value = newPage
}

watch([page, sort], loadContents)
watch(selectedGenre, () => {
  page.value = 1
  loadContents()
})

onMounted(() => {
  loadGenres()
  loadContents()
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl font-semibold tracking-tight text-ink">Catálogo</h1>
      <p v-if="meta" class="text-sm text-ink-muted">
        {{ meta.total }} {{ meta.total === 1 ? 'título' : 'títulos' }}
      </p>
      <p v-else class="text-sm text-ink-muted">Cargando…</p>
    </header>

    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <BaseSelect v-model="sort" :options="sortOptions" label="Ordenar por" />

      <div v-if="genres.length" class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          :class="[
            'h-8 rounded-md px-3 text-xs font-medium transition-colors',
            selectedGenre === null
              ? 'bg-ink text-white'
              : 'border border-outline text-ink-muted hover:bg-surface-subtle hover:text-ink',
          ]"
          @click="selectGenre(null)"
        >
          Todos
        </button>
        <button
          v-for="g in genres"
          :key="g.id"
          type="button"
          :class="[
            'h-8 rounded-md px-3 text-xs font-medium transition-colors',
            selectedGenre === g.slug
              ? 'bg-ink text-white'
              : 'border border-outline text-ink-muted hover:bg-surface-subtle hover:text-ink',
          ]"
          @click="selectGenre(g.slug)"
        >
          {{ g.name }}
        </button>
      </div>
    </div>

    <div
      v-if="loading"
      class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      <div v-for="i in 10" :key="i" class="flex flex-col gap-3">
        <div class="aspect-[2/3] animate-pulse rounded-md bg-surface-muted" />
        <div class="h-4 animate-pulse rounded bg-surface-muted" />
        <div class="h-3 w-2/3 animate-pulse rounded bg-surface-muted" />
      </div>
    </div>

    <div
      v-else-if="error"
      class="rounded-lg border border-error/30 bg-red-50 p-6 text-sm text-error"
    >
      {{ error }}
    </div>

    <div
      v-else-if="contents.length === 0"
      class="rounded-lg border border-outline bg-surface-subtle p-12 text-center"
    >
      <p class="text-base font-medium text-ink">No hay títulos para mostrar</p>
      <p class="mt-1 text-sm text-ink-muted">Probá cambiar el filtro de género o el orden.</p>
    </div>

    <template v-else>
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <ContentCard v-for="c in contents" :key="c.id" :content="c" />
      </div>

      <PaginationControls
        v-if="meta && meta.lastPage > 1"
        :meta="meta"
        @update:page="changePage"
      />
    </template>
  </div>
</template>
