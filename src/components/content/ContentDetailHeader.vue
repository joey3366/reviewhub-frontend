<script setup lang="ts">
import { computed } from 'vue'
import type { Content } from '@/api/types'
import PosterScene from './PosterScene.vue'
import RatingStars from './RatingStars.vue'

const props = defineProps<{ content: Content }>()

const typeLabel = computed(() => (props.content.type === 'movie' ? 'Película' : 'Serie'))

const metaLine = computed(() => {
  const parts: string[] = [typeLabel.value]
  if (props.content.releaseYear) parts.push(String(props.content.releaseYear))
  if (props.content.movie?.runtimeMinutes) {
    parts.push(`${props.content.movie.runtimeMinutes} min`)
  }
  if (props.content.series?.seasonsCount) {
    const s = props.content.series.seasonsCount
    parts.push(`${s} ${s === 1 ? 'temporada' : 'temporadas'}`)
  }
  return parts.join(' · ')
})

const director = computed(() => props.content.movie?.director ?? null)
const reviewCountLabel = computed(() => {
  const count = props.content.reviewCount
  return `${count} ${count === 1 ? 'reseña' : 'reseñas'}`
})
</script>

<template>
  <header class="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
    <div class="w-full max-w-[280px] flex-none self-center md:self-start">
      <PosterScene :poster-url="content.posterUrl" :title="content.title" />
    </div>

    <div class="flex flex-1 flex-col gap-5">
      <div class="flex flex-col gap-2">
        <p class="text-xs uppercase tracking-wide text-ink-subtle">{{ metaLine }}</p>
        <h1 class="text-4xl font-semibold tracking-tight text-ink md:text-5xl">
          {{ content.title }}
        </h1>
        <p v-if="content.originalTitle && content.originalTitle !== content.title"
           class="text-sm italic text-ink-muted">
          {{ content.originalTitle }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <RatingStars :value="content.avgRating" size="lg" />
        <span class="text-sm text-ink-subtle">· {{ reviewCountLabel }}</span>
      </div>

      <div v-if="content.genres.length" class="flex flex-wrap gap-2">
        <span
          v-for="g in content.genres"
          :key="g.id"
          class="rounded-md border border-outline px-2.5 py-1 text-xs font-medium text-ink-muted"
        >
          {{ g.name }}
        </span>
      </div>

      <p v-if="content.synopsis"
         class="max-w-prose text-base leading-relaxed text-ink-muted">
        {{ content.synopsis }}
      </p>
      <p v-else class="text-sm italic text-ink-subtle">Sin sinopsis disponible.</p>

      <p v-if="director" class="text-sm text-ink-muted">
        <span class="text-ink-subtle">Dirección:</span> {{ director }}
      </p>
    </div>
  </header>
</template>
