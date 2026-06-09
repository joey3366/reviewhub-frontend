<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { contentApi } from '@/api/content'
import { reviewsApi } from '@/api/reviews'
import type { Content, PaginationMeta, Review } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import ContentDetailHeader from '@/components/content/ContentDetailHeader.vue'
import ReviewItem from '@/components/content/ReviewItem.vue'
import ReviewModal from '@/components/content/ReviewModal.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

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

const modalOpen = ref(false)
const editingReview = ref<Review | null>(null)
const presetRating = ref<number | undefined>(undefined)
const deletingId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const reviewToDelete = ref<Review | null>(null)

const myReview = computed(() => {
  if (!auth.user) return null
  return reviews.value.find((r) => r.user?.id === auth.user!.id) ?? null
})

const canWriteReview = computed(() => auth.isAuthenticated && !myReview.value)

// Solo las reseñas con texto se listan como tarjetas; las puntuaciones sin
// reseña cuentan para el promedio pero no aparecen abajo.
const writtenReviews = computed(() =>
  reviews.value.filter((r) => (r.title && r.title.trim()) || (r.body && r.body.trim()))
)

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

function openCreate() {
  if (!auth.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  if (myReview.value) {
    editingReview.value = myReview.value
  } else {
    editingReview.value = null
  }
  presetRating.value = undefined
  actionError.value = null
  modalOpen.value = true
}

function openEdit(review: Review) {
  editingReview.value = review
  presetRating.value = undefined
  actionError.value = null
  modalOpen.value = true
}

async function openQuickRate(rating: number) {
  if (!auth.isAuthenticated) {
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  actionError.value = null
  try {
    if (myReview.value) {
      await reviewsApi.update(myReview.value.id, { rating })
    } else {
      await reviewsApi.create(slug.value, { rating })
    }
    await Promise.all([loadReviews(), loadContent()])
  } catch (e) {
    console.error(e)
    actionError.value = 'No pudimos guardar tu puntuación. Intentá de nuevo.'
  }
}

function closeModal() {
  modalOpen.value = false
  editingReview.value = null
  presetRating.value = undefined
}

async function handleSuccess() {
  closeModal()
  await Promise.all([loadReviews(), loadContent()])
}

function handleDelete(review: Review) {
  reviewToDelete.value = review
}

async function confirmDeleteReview() {
  const review = reviewToDelete.value
  if (!review) return
  deletingId.value = review.id
  actionError.value = null
  try {
    await reviewsApi.destroy(review.id)
    reviewToDelete.value = null
    await Promise.all([loadReviews(), loadContent()])
  } catch (e) {
    console.error(e)
    actionError.value = 'No pudimos borrar la reseña. Intentá de nuevo.'
    reviewToDelete.value = null
  } finally {
    deletingId.value = null
  }
}

function canEditReview(review: Review): boolean {
  return !!auth.user && review.user?.id === auth.user.id
}

function canDeleteReview(review: Review): boolean {
  if (!auth.user) return false
  if (auth.isAdmin) return true
  return review.user?.id === auth.user.id
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
  <div class="relative min-h-[calc(100vh-3.5rem)] bg-black text-white">
    <div v-if="loading" class="mx-auto flex min-h-[640px] max-w-7xl flex-col gap-8 px-6 py-16 md:flex-row md:gap-12">
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
      <ContentDetailHeader
        :content="content"
        :my-review="myReview"
        :can-quick-rate="auth.isAuthenticated"
        @quick-rate="openQuickRate"
        @edit-mine="myReview && openEdit(myReview)"
      />

      <section class="mx-auto flex max-w-7xl flex-col gap-6 border-t border-white/10 px-6 py-12 md:px-12">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="flex flex-col gap-1">
            <h2 class="text-2xl font-semibold tracking-tight text-white">Reseñas</h2>
            <p v-if="writtenReviews.length" class="text-sm text-white/60">
              {{ writtenReviews.length }} {{ writtenReviews.length === 1 ? 'reseña escrita' : 'reseñas escritas' }}
            </p>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <div v-if="writtenReviews.length > 0" class="dark-select">
              <BaseSelect
                v-model="reviewsSort"
                :options="reviewSortOptions"
                label="Ordenar"
              />
            </div>

            <button
              v-if="canWriteReview"
              type="button"
              class="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
              @click="openCreate"
            >
              Escribir reseña
            </button>

            <button
              v-else-if="myReview"
              type="button"
              class="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
              @click="openEdit(myReview)"
            >
              Editar mi reseña
            </button>

            <router-link
              v-else
              :to="{ path: '/login', query: { redirect: route.fullPath } }"
              class="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Iniciá sesión para reseñar
            </router-link>
          </div>
        </div>

        <div
          v-if="actionError"
          class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {{ actionError }}
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
          v-else-if="writtenReviews.length === 0"
          class="flex flex-col items-center gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center"
        >
          <div class="flex flex-col gap-1">
            <p class="text-base font-medium text-white">Todavía no hay reseñas escritas</p>
            <p class="text-sm text-white/60">
              <template v-if="auth.isAuthenticated">Sé el primero en escribir una.</template>
              <template v-else>Iniciá sesión para escribir la primera.</template>
            </p>
          </div>
          <button
            v-if="auth.isAuthenticated"
            type="button"
            class="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
            @click="openCreate"
          >
            Escribir reseña
          </button>
          <router-link
            v-else
            :to="{ path: '/login', query: { redirect: route.fullPath } }"
            class="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Iniciar sesión
          </router-link>
        </div>

        <template v-else>
          <div class="flex flex-col gap-4">
            <ReviewItem
              v-for="r in writtenReviews"
              :key="r.id"
              :review="r"
              theme="dark"
              :can-edit="canEditReview(r)"
              :can-delete="canDeleteReview(r) && deletingId !== r.id"
              @edit="openEdit"
              @delete="handleDelete"
            />
          </div>

          <PaginationControls
            v-if="reviewsMeta && reviewsMeta.lastPage > 1"
            :meta="reviewsMeta"
            @update:page="changeReviewsPage"
          />
        </template>
      </section>
    </template>

    <ReviewModal
      :open="modalOpen"
      :content-slug="slug"
      :initial="editingReview"
      :preset-rating="presetRating"
      @close="closeModal"
      @success="handleSuccess"
    />

    <ConfirmModal
      :open="reviewToDelete !== null"
      title="Borrar reseña"
      message="¿Borrar esta reseña? No se puede deshacer."
      confirm-label="Borrar"
      variant="destructive"
      :loading="deletingId !== null"
      @close="reviewToDelete = null"
      @confirm="confirmDeleteReview"
    />
  </div>
</template>

<style scoped>
.dark-select :deep(label) {
  color: rgba(255, 255, 255, 0.6);
}
.dark-select :deep(select) {
  background-color: rgba(20, 20, 20, 0.95);
  border-color: rgba(255, 255, 255, 0.15);
  color: white;
  color-scheme: dark;
}
.dark-select :deep(select):hover {
  border-color: rgba(255, 255, 255, 0.3);
}
.dark-select :deep(select) option {
  background-color: #0a0a0a;
  color: white;
}
</style>
