<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { contentApi } from '@/api/content'
import { reviewsApi } from '@/api/reviews'
import type { Content, PaginationMeta, Review } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import ContentDetailHeader from '@/components/content/ContentDetailHeader.vue'
import ReviewItem from '@/components/content/ReviewItem.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const slug = computed(() => route.params.slug as string)

const content = ref<Content | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const reviews = ref<Review[]>([])
const reviewsMeta = ref<PaginationMeta | null>(null)
const reviewsLoading = ref(false)
const reviewsError = ref<string | null>(null)
const reviewsSort = ref<'recent' | 'top'>('recent')
const reviewsPage = ref(1)

const reviewSortOptions = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'top', label: 'Mejor calificadas' },
]

async function loadContent() {
  loading.value = true
  error.value = null
  content.value = null
  try {
    content.value = await contentApi.show(slug.value)
  } catch (e: any) {
    if (e?.response?.status === 404) {
      error.value = 'No encontramos este contenido.'
    } else {
      error.value = 'No pudimos cargar el detalle. Probá refrescar la página.'
    }
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function loadReviews() {
  reviewsLoading.value = true
  reviewsError.value = null
  try {
    const result = await reviewsApi.listByContent(slug.value, {
      page: reviewsPage.value,
      sort: reviewsSort.value,
    })
    reviews.value = result.data
    reviewsMeta.value = result.metadata
  } catch (e) {
    reviewsError.value = 'No pudimos cargar las reseñas.'
    console.error(e)
  } finally {
    reviewsLoading.value = false
  }
}

function changeReviewsPage(page: number) {
  reviewsPage.value = page
}

watch(slug, async () => {
  reviewsPage.value = 1
  reviewsSort.value = 'recent'
  await loadContent()
  if (content.value) await loadReviews()
})

watch(reviewsSort, () => {
  reviewsPage.value = 1
  loadReviews()
})

watch(reviewsPage, loadReviews)

onMounted(async () => {
  await loadContent()
  if (content.value) await loadReviews()
})

function goHome() {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="relative bg-black text-white">
    <button
      type="button"
      class="absolute left-6 top-20 z-20 flex items-center gap-2 text-sm font-medium text-white/70 transition-colors hover:text-white md:left-10 md:top-24"
      @click="goHome"
    >
      <span aria-hidden="true">←</span> Volver
    </button>

    <div v-if="loading" class="flex min-h-[640px] flex-col gap-8 px-6 py-16 md:flex-row md:gap-12 md:px-12">
      <div class="aspect-[2/3] w-full max-w-[280px] flex-none animate-pulse rounded-lg bg-white/5 self-center md:self-start" />
      <div class="flex flex-1 flex-col gap-4">
        <div class="h-3 w-24 animate-pulse rounded bg-white/10" />
        <div class="h-12 w-2/3 animate-pulse rounded bg-white/10" />
        <div class="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div class="mt-4 space-y-2">
          <div class="h-3 animate-pulse rounded bg-white/10" />
          <div class="h-3 animate-pulse rounded bg-white/10" />
          <div class="h-3 w-4/5 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </div>

    <div
      v-else-if="error"
      class="mx-auto flex max-w-2xl flex-col items-start gap-4 px-6 py-24 md:px-12"
    >
      <p class="text-sm text-red-400">{{ error }}</p>
      <button
        type="button"
        class="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
        @click="goHome"
      >
        Volver al catálogo
      </button>
    </div>

    <template v-else-if="content">
      <ContentDetailHeader :content="content" />

      <section class="mx-auto flex max-w-7xl flex-col gap-6 border-t border-white/10 px-6 py-12 md:px-12">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="flex flex-col gap-1">
            <h2 class="text-2xl font-semibold tracking-tight text-white">Reseñas</h2>
            <p v-if="reviewsMeta" class="text-sm text-white/60">
              {{ reviewsMeta.total }} {{ reviewsMeta.total === 1 ? 'reseña en total' : 'reseñas en total' }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div v-if="reviews.length > 0" class="dark-select">
              <BaseSelect
                v-model="reviewsSort"
                :options="reviewSortOptions"
                label="Ordenar"
              />
            </div>
            <button
              v-if="auth.isAuthenticated"
              type="button"
              disabled
              class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white opacity-70 disabled:cursor-not-allowed"
              title="Próximamente"
            >
              Escribir reseña (próximamente)
            </button>
          </div>
        </div>

        <div v-if="reviewsLoading" class="flex flex-col gap-4">
          <div
            v-for="i in 3"
            :key="i"
            class="h-32 animate-pulse rounded-lg border border-white/10 bg-white/[0.03]"
          />
        </div>

        <div
          v-else-if="reviewsError"
          class="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {{ reviewsError }}
        </div>

        <div
          v-else-if="reviews.length === 0"
          class="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center"
        >
          <p class="text-base font-medium text-white">Todavía no hay reseñas</p>
          <p class="mt-1 text-sm text-white/60">
            <template v-if="auth.isAuthenticated">Sé el primero en escribir una.</template>
            <template v-else>
              <router-link to="/login" class="text-accent hover:underline">Iniciá sesión</router-link>
              para escribir la primera.
            </template>
          </p>
        </div>

        <template v-else>
          <div class="flex flex-col gap-4">
            <ReviewItem v-for="r in reviews" :key="r.id" :review="r" theme="dark" />
          </div>

          <PaginationControls
            v-if="reviewsMeta && reviewsMeta.lastPage > 1"
            :meta="reviewsMeta"
            @update:page="changeReviewsPage"
          />
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.dark-select :deep(label) {
  color: rgba(255, 255, 255, 0.6);
}
.dark-select :deep(select) {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  color: white;
}
.dark-select :deep(select):hover {
  border-color: rgba(255, 255, 255, 0.3);
}
</style>
