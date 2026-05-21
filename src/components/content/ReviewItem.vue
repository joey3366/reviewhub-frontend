<script setup lang="ts">
import { computed } from 'vue'
import type { Review } from '@/api/types'
import RatingStars from './RatingStars.vue'

const props = withDefaults(
  defineProps<{
    review: Review
    theme?: 'light' | 'dark'
  }>(),
  { theme: 'light' }
)

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

const isDark = computed(() => props.theme === 'dark')
</script>

<template>
  <article
    :class="
      isDark
        ? 'flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-5'
        : 'flex flex-col gap-3 rounded-lg border border-outline bg-surface p-5'
    "
  >
    <header class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3">
        <span
          :class="
            isDark
              ? 'flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white'
              : 'flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink'
          "
          aria-hidden="true"
        >
          {{ authorInitials }}
        </span>
        <div class="flex flex-col">
          <span :class="isDark ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-ink'">
            {{ authorName }}
          </span>
          <span :class="isDark ? 'text-xs text-white/50' : 'text-xs text-ink-subtle'">
            {{ formattedDate }}<span v-if="wasEdited"> · editada</span>
          </span>
        </div>
      </div>
      <RatingStars :value="review.rating" size="sm" :show-number="true" :theme="theme" />
    </header>

    <h4 :class="isDark ? 'text-base font-semibold tracking-tight text-white' : 'text-base font-semibold tracking-tight text-ink'">
      {{ review.title }}
    </h4>
    <p :class="isDark ? 'whitespace-pre-line text-sm leading-relaxed text-white/70' : 'whitespace-pre-line text-sm leading-relaxed text-ink-muted'">
      {{ review.body }}
    </p>
  </article>
</template>
