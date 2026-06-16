<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Content, Review } from '@/api/types'
import RatingStars from './RatingStars.vue'
import WatchlistButton from '@/components/watchlists/WatchlistButton.vue'

const props = withDefaults(
  defineProps<{
    content: Content
    myReview?: Review | null
    canQuickRate?: boolean
  }>(),
  { myReview: null, canQuickRate: false }
)
const emit = defineEmits<{
  'quick-rate': [rating: number]
  'edit-mine': []
}>()
const router = useRouter()

const typeLabel = computed(() => (props.content.type === 'movie' ? 'Película' : 'Serie'))

const runtimeLabel = computed(() => {
  if (props.content.movie?.runtimeMinutes) {
    const total = props.content.movie.runtimeMinutes
    const h = Math.floor(total / 60)
    const m = total % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  if (props.content.series?.seasonsCount) {
    const s = props.content.series.seasonsCount
    return `${s} ${s === 1 ? 'temporada' : 'temporadas'}`
  }
  return null
})

const director = computed(() => props.content.movie?.director ?? null)
const reviewCountLabel = computed(() => {
  const count = props.content.reviewCount
  return `${count} ${count === 1 ? 'puntuación' : 'puntuaciones'}`
})

// Promedio interno de Kairos (NO IMDb). Mostramos "0.0" cuando aún no
// hay reseñas para no esconder el bloque entero — el conteo al lado deja
// claro que no hay puntuaciones todavía.
const avgRatingLabel = computed(() => {
  const v = props.content.avgRating
  return v === null ? '0.0' : v.toFixed(1)
})

const hasWrittenReview = computed(() => {
  const r = props.myReview
  return Boolean(r && ((r.title && r.title.trim()) || (r.body && r.body.trim())))
})

const backdropOffset = ref(0)

function handleScroll() {
  backdropOffset.value = window.scrollY * 0.35
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
})

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'home' })
  }
}
</script>

<template>
  <section class="relative min-h-[720px] overflow-hidden">
    <div
      class="pointer-events-none absolute inset-0 -top-10"
      :style="{ transform: `translate3d(0, ${backdropOffset}px, 0)` }"
    >
      <div
        v-if="content.backdropUrl"
        class="ken-burns absolute inset-0 bg-cover bg-center"
        :style="{ backgroundImage: `url(${content.backdropUrl})` }"
      />
      <div v-else class="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />

      <div class="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent" />
      <div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
    </div>

    <div class="relative mx-auto max-w-7xl px-6 pb-16 pt-8 md:pb-20 md:pt-10">
      <button
        type="button"
        class="mb-8 inline-flex items-center gap-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
        @click="goBack"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Volver
      </button>

      <div class="flex flex-col gap-10 md:flex-row md:gap-12">
        <div class="flex w-full max-w-[280px] flex-none flex-col gap-6 self-center md:self-start fade-up">
          <div class="aspect-[2/3] w-full overflow-hidden rounded-lg border border-white/10 bg-white/5 shadow-2xl shadow-black/50">
            <img
              v-if="content.posterUrl"
              :src="content.posterUrl"
              :alt="content.title"
              class="h-full w-full object-cover"
              loading="eager"
            />
            <div v-else class="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
              <span class="text-xs uppercase tracking-wide text-white/40">Sin poster</span>
              <span class="line-clamp-3 text-sm font-medium text-white/70">{{ content.title }}</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <WatchlistButton :content="content" />
          </div>
        </div>

        <div class="flex max-w-xl flex-1 flex-col gap-5 text-white">
          <div class="flex flex-wrap items-center gap-3 text-sm text-white/70 fade-up" style="animation-delay: 60ms">
            <span v-if="content.releaseYear">{{ content.releaseYear }}</span>
            <span v-if="content.releaseYear" class="text-white/30">·</span>
            <span>{{ typeLabel }}</span>
            <template v-if="runtimeLabel">
              <span class="text-white/30">·</span>
              <span>{{ runtimeLabel }}</span>
            </template>
          </div>

          <h1 class="text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl fade-up" style="animation-delay: 120ms">
            {{ content.title }}
          </h1>

          <p v-if="content.originalTitle && content.originalTitle !== content.title"
             class="text-sm italic text-white/60 fade-up" style="animation-delay: 180ms">
            {{ content.originalTitle }}
          </p>

          <div class="flex flex-wrap items-center gap-3 fade-up" style="animation-delay: 240ms">
            <!-- Logueado: una sola fila con estrellas editables (puntuar directo) -->
            <template v-if="canQuickRate">
              <span class="text-xs uppercase tracking-wider text-white/50">
                {{ myReview ? 'Tu nota' : 'Calificá' }}
              </span>
              <RatingStars
                :value="myReview ? myReview.rating : null"
                :editable="true"
                size="lg"
                theme="dark"
                :show-number="true"
                @update:value="emit('quick-rate', $event)"
              />
              <button
                v-if="myReview"
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-full text-amber-300 transition-colors hover:bg-amber-300/10 hover:text-amber-200"
                :title="hasWrittenReview ? 'Editar reseña' : 'Escribir reseña'"
                :aria-label="hasWrittenReview ? 'Editar reseña' : 'Escribir reseña'"
                @click="emit('edit-mine')"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            </template>

            <!-- No logueado: promedio en modo lectura -->
            <template v-else>
              <RatingStars :value="content.avgRating" size="lg" theme="dark" />
            </template>

            <span class="inline-flex items-center gap-1.5 text-sm text-white/50">
              <svg
                class="avg-star h-4 w-4 flex-none text-amber-300"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2.6l2.6 5.86 6.4.55-4.85 4.2 1.45 6.23L12 16.95 5.95 19.44 7.4 13.21 2.55 9.01l6.4-.55z" />
              </svg>
              <span>{{ avgRatingLabel }} prom.</span>
              <span class="text-white/30">·</span>
              <span>{{ reviewCountLabel }}</span>
            </span>
          </div>

          <div v-if="content.genres.length" class="flex flex-wrap gap-2 fade-up" style="animation-delay: 300ms">
            <span
              v-for="g in content.genres"
              :key="g.id"
              class="rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm"
            >
              {{ g.name }}
            </span>
          </div>

          <p v-if="content.synopsis"
             class="max-w-prose text-base leading-relaxed text-white/75 fade-up" style="animation-delay: 360ms">
            {{ content.synopsis }}
          </p>
          <p v-else class="text-sm italic text-white/40 fade-up" style="animation-delay: 360ms">
            Sin sinopsis disponible.
          </p>

          <div v-if="director" class="flex flex-col gap-1 fade-up" style="animation-delay: 420ms">
            <span class="text-sm font-semibold text-white">Director</span>
            <span class="text-sm text-white/70">{{ director }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@keyframes kenBurns {
  0% { transform: scale(1.05) translate(0, 0); }
  50% { transform: scale(1.18) translate(-2%, -1.5%); }
  100% { transform: scale(1.05) translate(0, 0); }
}
.ken-burns {
  animation: kenBurns 32s ease-in-out infinite;
  transform-origin: center;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
.fade-up {
  animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}

@keyframes twinkle {
  0%, 100% {
    transform: scale(1) rotate(0deg);
    opacity: 0.8;
    filter: drop-shadow(0 0 0 rgba(252, 211, 77, 0));
  }
  50% {
    transform: scale(1.22) rotate(10deg);
    opacity: 1;
    filter: drop-shadow(0 0 6px rgba(252, 211, 77, 0.75));
  }
}
.avg-star {
  animation: twinkle 2.6s ease-in-out infinite;
  transform-origin: center;
}

@media (prefers-reduced-motion: reduce) {
  .ken-burns,
  .fade-up,
  .avg-star {
    animation: none;
  }
}
</style>
