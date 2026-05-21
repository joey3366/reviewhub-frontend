<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Content } from '@/api/types'
import PosterScene from './PosterScene.vue'
import RatingStars from './RatingStars.vue'

const props = defineProps<{ content: Content }>()

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
</script>

<template>
  <section class="relative min-h-[640px] overflow-hidden">
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

      <div
        class="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-transparent"
      />
      <div
        class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent"
      />
      <div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
    </div>

    <div class="relative mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12 md:flex-row md:gap-12 md:py-16">
      <div class="w-full max-w-[280px] flex-none self-center md:self-start fade-up">
        <PosterScene :poster-url="content.posterUrl" :title="content.title" />
      </div>

      <div class="flex flex-1 flex-col gap-5 text-white">
        <p class="text-xs uppercase tracking-[0.2em] text-white/50 fade-up" style="animation-delay: 60ms">
          {{ typeLabel }}<span v-if="content.releaseYear"> · {{ content.releaseYear }}</span><span v-if="runtimeLabel"> · {{ runtimeLabel }}</span>
        </p>

        <h1 class="text-4xl font-bold tracking-tight md:text-6xl fade-up" style="animation-delay: 120ms">
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
            class="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm"
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

        <p v-if="director" class="text-sm text-white/70 fade-up" style="animation-delay: 420ms">
          <span class="text-white/50">Dirección:</span> {{ director }}
        </p>
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
