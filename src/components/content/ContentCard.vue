<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Content } from '@/api/types'

const props = defineProps<{ content: Content }>()
const router = useRouter()

const typeLabel = computed(() => (props.content.type === 'movie' ? 'Película' : 'Serie'))

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
    class="group flex flex-col gap-3 rounded-lg text-left transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    @click="navigate"
  >
    <div
      class="relative aspect-[2/3] overflow-hidden rounded-md border border-outline bg-surface-muted"
    >
      <img
        v-if="content.posterUrl"
        :src="content.posterUrl"
        :alt="content.title"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <div v-else class="flex h-full w-full items-center justify-center text-xs text-ink-subtle">
        Sin poster
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <h3 class="line-clamp-2 text-sm font-semibold text-ink">{{ content.title }}</h3>
      <p class="text-xs text-ink-subtle">
        {{ typeLabel }}
        <span v-if="content.releaseYear"> · {{ content.releaseYear }}</span>
      </p>
      <p class="flex items-center gap-1 text-xs text-ink-muted">
        <span v-if="ratingDisplay" class="font-medium text-ink">★ {{ ratingDisplay }}</span>
        <span v-else class="text-ink-subtle">Sin calificar</span>
        <span class="text-ink-subtle">· {{ reviewLabel }}</span>
      </p>
    </div>
  </button>
</template>
