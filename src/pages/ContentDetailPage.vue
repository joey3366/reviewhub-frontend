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
import BaseButton from '@/components/ui/BaseButton.vue'

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
  <div class="flex flex-col gap-12">
    <div v-if="loading" class="flex flex-col gap-8 md:flex-row md:gap-12">
      <div class="aspect-[2/3] w-full max-w-[280px] flex-none animate-pulse rounded-md bg-surface-muted self-center md:self-start" />
      <div class="flex flex-1 flex-col gap-4">
        <div class="h-3 w-24 animate-pulse rounded bg-surface-muted" />
        <div class="h-10 w-2/3 animate-pulse rounded bg-surface-muted" />
        <div class="h-4 w-32 animate-pulse rounded bg-surface-muted" />
        <div class="mt-4 space-y-2">
          <div class="h-3 animate-pulse rounded bg-surface-muted" />
          <div class="h-3 animate-pulse rounded bg-surface-muted" />
          <div class="h-3 w-4/5 animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
    </div>

    <div
      v-else-if="error"
      class="flex flex-col items-start gap-4 rounded-lg border border-error/30 bg-red-50 p-6"
    >
      <p class="text-sm text-error">{{ error }}</p>
      <BaseButton variant="secondary" @click="goHome">Volver al catálogo</BaseButton>
    </div>

    <template v-else-if="content">
      <ContentDetailHeader :content="content" />

      <section class="flex flex-col gap-6">
        <div class="flex flex-col gap-3 border-t border-outline pt-8 md:flex-row md:items-end md:justify-between">
          <div class="flex flex-col gap-1">
            <h2 class="text-2xl font-semibold tracking-tight text-ink">Reseñas</h2>
            <p v-if="reviewsMeta" class="text-sm text-ink-muted">
              {{ reviewsMeta.total }} {{ reviewsMeta.total === 1 ? 'reseña' : 'reseñas' }} en total
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <BaseSelect
              v-if="reviews.length > 0"
              v-model="reviewsSort"
              :options="reviewSortOptions"
              label="Ordenar"
            />
            <BaseButton v-if="auth.isAuthenticated" variant="primary" disabled>
              Escribir reseña (próximamente)
            </BaseButton>
          </div>
        </div>

        <div v-if="reviewsLoading" class="flex flex-col gap-4">
          <div
            v-for="i in 3"
            :key="i"
            class="h-32 animate-pulse rounded-lg border border-outline bg-surface-subtle"
          />
        </div>

        <div
          v-else-if="reviewsError"
          class="rounded-lg border border-error/30 bg-red-50 p-4 text-sm text-error"
        >
          {{ reviewsError }}
        </div>

        <div
          v-else-if="reviews.length === 0"
          class="rounded-lg border border-outline bg-surface-subtle p-8 text-center"
        >
          <p class="text-base font-medium text-ink">Todavía no hay reseñas</p>
          <p class="mt-1 text-sm text-ink-muted">
            <template v-if="auth.isAuthenticated">Sé el primero en escribir una.</template>
            <template v-else>
              <router-link to="/login" class="text-accent hover:underline">Iniciá sesión</router-link>
              para escribir la primera.
            </template>
          </p>
        </div>

        <template v-else>
          <div class="flex flex-col gap-4">
            <ReviewItem v-for="r in reviews" :key="r.id" :review="r" />
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
