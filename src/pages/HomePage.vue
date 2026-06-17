<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { contentApi } from '@/api/content'
import type { Content, ContentType, Genre, PaginationMeta } from '@/api/types'
import ContentCard from '@/components/content/ContentCard.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import GenreFilter from '@/components/content/GenreFilter.vue'
import FormBackdrop from '@/components/ui/FormBackdrop.vue'

const contents = ref<Content[]>([])
const genres = ref<Genre[]>([])
const meta = ref<PaginationMeta | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const page = ref(1)
const sort = ref<'top' | 'recent'>('top')
const typeFilter = ref<'all' | ContentType>('all')
// Slugs de géneros seleccionados (multi). [] = sin filtro.
const selectedGenres = ref<string[]>([])

const sortOptions = [
  { value: 'top', label: 'Mejor calificadas' },
  { value: 'recent', label: 'Más recientes' },
]

const typeOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'movie', label: 'Películas' },
  { value: 'series', label: 'Series' },
  { value: 'game', label: 'Juegos' },
]

// Géneros aplicables al tipo activo: filtramos para no mostrar pills que
// no aplican (ej. "FPS" cuando estás viendo solo series).
const visibleGenres = computed(() => {
  if (typeFilter.value === 'all') return genres.value
  return genres.value.filter(
    (g) => g.appliesTo === 'all' || g.appliesTo === typeFilter.value
  )
})

async function loadContents() {
  loading.value = true
  error.value = null
  try {
    const result = await contentApi.list({
      page: page.value,
      sort: sort.value,
      type: typeFilter.value === 'all' ? undefined : typeFilter.value,
      genres: selectedGenres.value.length > 0 ? selectedGenres.value : undefined,
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

function changePage(newPage: number) {
  page.value = newPage
}

watch([page, sort], loadContents)
watch(typeFilter, () => {
  page.value = 1
  // Al cambiar tipo, dejamos solo géneros que sigan aplicando.
  if (typeFilter.value !== 'all') {
    selectedGenres.value = selectedGenres.value.filter((slug) => {
      const g = genres.value.find((x) => x.slug === slug)
      return g && (g.appliesTo === 'all' || g.appliesTo === typeFilter.value)
    })
  }
  loadContents()
})
watch(selectedGenres, () => {
  page.value = 1
  loadContents()
}, { deep: true })

onMounted(() => {
  loadGenres()
  loadContents()
})
</script>

<template>
  <FormBackdrop image="/catalog-bg.png">
    <div class="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header class="flex flex-col gap-1">
        <p class="text-xs font-medium uppercase tracking-widest text-amber-300/70">Catálogo</p>
        <p v-if="meta" class="text-sm text-white/60">
          {{ meta.total }} {{ meta.total === 1 ? 'título' : 'títulos' }}
        </p>
        <p v-else class="text-sm text-white/40">Cargando…</p>
      </header>

      <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div class="flex flex-col gap-4 sm:flex-row">
          <BaseSelect v-model="typeFilter" :options="typeOptions" label="Tipo" variant="dark" />
          <BaseSelect v-model="sort" :options="sortOptions" label="Ordenar por" variant="dark" />
        </div>
        <GenreFilter
          v-if="visibleGenres.length"
          v-model="selectedGenres"
          :genres="visibleGenres"
          variant="dark"
        />
      </div>

      <div
        v-if="loading"
        class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        <div v-for="i in 10" :key="i" class="flex flex-col gap-3">
          <div class="aspect-[2/3] animate-pulse rounded-md bg-white/[0.04]" />
          <div class="h-4 animate-pulse rounded bg-white/[0.04]" />
          <div class="h-3 w-2/3 animate-pulse rounded bg-white/[0.04]" />
        </div>
      </div>

      <div
        v-else-if="error"
        class="rounded-xl border border-red-400/30 bg-red-500/10 p-6 text-sm text-red-300"
      >
        {{ error }}
      </div>

      <div
        v-else-if="contents.length === 0"
        class="rounded-xl border border-white/10 bg-neutral-950/60 p-12 text-center backdrop-blur-xl"
      >
        <p class="text-base font-medium text-white">No hay títulos para mostrar</p>
        <p class="mt-1 text-sm text-white/50">Probá cambiar el filtro de género o el orden.</p>
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
  </FormBackdrop>
</template>
