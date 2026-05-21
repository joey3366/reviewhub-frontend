<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number | null
    size?: 'sm' | 'md' | 'lg'
    showNumber?: boolean
  }>(),
  { size: 'md', showNumber: true }
)

const filledStars = computed(() => {
  if (props.value === null) return 0
  return Math.round(props.value / 2)
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return { star: 'text-xs', number: 'text-xs' }
    case 'lg':
      return { star: 'text-xl', number: 'text-2xl font-semibold' }
    default:
      return { star: 'text-sm', number: 'text-sm font-medium' }
  }
})
</script>

<template>
  <div class="flex items-center gap-2">
    <div v-if="value !== null" class="flex items-center gap-0.5" :class="sizeClasses.star">
      <span
        v-for="i in 5"
        :key="i"
        :class="i <= filledStars ? 'text-ink' : 'text-ink-subtle/40'"
        aria-hidden="true"
      >★</span>
    </div>
    <span
      v-if="showNumber"
      :class="[sizeClasses.number, value === null ? 'text-ink-subtle' : 'text-ink']"
    >
      {{ value !== null ? `${value}/10` : 'Sin calificar' }}
    </span>
  </div>
</template>
