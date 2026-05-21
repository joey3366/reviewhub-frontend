<script setup lang="ts">
import { computed } from 'vue'
import type { Review } from '@/api/types'
import RatingStars from './RatingStars.vue'

const props = defineProps<{ review: Review }>()

const authorName = computed(() => props.review.user?.fullName ?? 'Usuario anónimo')
const authorInitials = computed(() => props.review.user?.initials ?? '?')

const formattedDate = computed(() => {
  const date = new Date(props.review.createdAt)
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
})

const wasEdited = computed(() => {
  if (!props.review.updatedAt) return false
  return props.review.updatedAt !== props.review.createdAt
})
</script>

<template>
  <article class="flex flex-col gap-3 rounded-lg border border-outline bg-surface p-5">
    <header class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3">
        <span
          class="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink"
          aria-hidden="true"
        >
          {{ authorInitials }}
        </span>
        <div class="flex flex-col">
          <span class="text-sm font-semibold text-ink">{{ authorName }}</span>
          <span class="text-xs text-ink-subtle">
            {{ formattedDate }}<span v-if="wasEdited"> · editada</span>
          </span>
        </div>
      </div>
      <RatingStars :value="review.rating" size="sm" :show-number="true" />
    </header>

    <h4 class="text-base font-semibold tracking-tight text-ink">{{ review.title }}</h4>
    <p class="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{{ review.body }}</p>
  </article>
</template>
