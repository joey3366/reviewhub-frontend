<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Content, ContentType } from '@/api/types'

const props = defineProps<{ content: Content }>()
const router = useRouter()

const TYPE_LABEL: Record<ContentType, string> = {
  movie: 'Película',
  series: 'Serie',
  game: 'Juego',
}
const typeLabel = computed(() => TYPE_LABEL[props.content.type])

const ratingDisplay = computed(() => {
  if (props.content.avgRating === null) return null
  return props.content.avgRating.toFixed(1)
})

const reviewLabel = computed(() => {
  const count = props.content.reviewCount
  return `${count} ${count === 1 ? 'reseña' : 'reseñas'}`
})

function navigate() {
  router.push(`/contents/${props.content.slug}`)
}
</script>

<template>
  <button
    type="button"
    class="group flex flex-col gap-3 rounded-lg text-left transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
    @click="navigate"
  >
    <div
      class="relative aspect-[2/3] overflow-hidden rounded-md border border-white/10 bg-black/40 shadow-lg shadow-black/40 transition-all group-hover:border-amber-400/40 group-hover:shadow-amber-500/15"
    >
      <img
        v-if="content.posterUrl"
        :src="content.posterUrl"
        :alt="content.title"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <div v-else class="flex h-full w-full items-center justify-center px-2 text-center text-xs text-white/40">
        {{ content.title }}
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <h3 class="line-clamp-2 text-sm font-semibold text-white transition-colors group-hover:text-amber-300">
        {{ content.title }}
      </h3>
      <p class="text-xs text-white/50">
        {{ typeLabel }}
        <span v-if="content.releaseYear"> · {{ content.releaseYear }}</span>
      </p>
      <p class="flex items-center gap-1 text-xs text-white/60">
        <span v-if="ratingDisplay" class="font-semibold text-amber-300">★ {{ ratingDisplay }}</span>
        <span v-else class="text-white/40">Sin calificar</span>
        <span class="text-white/30">· {{ reviewLabel }}</span>
      </p>
    </div>
  </button>
</template>
