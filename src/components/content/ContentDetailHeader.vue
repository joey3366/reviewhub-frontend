<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Content } from '@/api/types'
import RatingStars from './RatingStars.vue'

const props = defineProps<{ content: Content }>()
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
  return `${count} ${count === 1 ? 'reseña' : 'reseñas'}`
})

const ratingForBadge = computed(() => {
  if (props.content.avgRating === null) return null
  return props.content.avgRating.toFixed(1)
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
            <button
              type="button"
              disabled
              class="group flex items-center gap-3 rounded-full text-sm font-medium text-white opacity-80 transition-opacity disabled:cursor-not-allowed"
              title="Próximamente"
            >
              <span class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black transition-transform group-hover:scale-105">
                <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5 translate-x-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              Ver tráiler
            </button>

            <button
              type="button"
              disabled
              class="flex h-11 items-center gap-2 rounded-full border border-white/25 px-4 text-sm font-medium text-white opacity-80 transition-colors disabled:cursor-not-allowed hover:bg-white/10"
              title="Próximamente"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Mi lista
            </button>

            <button
              type="button"
              disabled
              class="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 text-white opacity-80 transition-colors disabled:cursor-not-allowed hover:bg-white/10"
              title="Compartir"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
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
            <template v-if="ratingForBadge">
              <span class="text-white/30">·</span>
              <span class="inline-flex items-center gap-1.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                IMDb
              </span>
              <span class="font-medium text-white">{{ ratingForBadge }}/10</span>
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
            <RatingStars :value="content.avgRating" size="lg" theme="dark" />
            <span class="text-sm text-white/50">· {{ reviewCountLabel }}</span>
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

@media (prefers-reduced-motion: reduce) {
  .ken-burns,
  .fade-up {
    animation: none;
  }
}
</style>
