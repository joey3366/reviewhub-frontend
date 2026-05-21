<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number | null
    size?: 'sm' | 'md' | 'lg'
    showNumber?: boolean
    theme?: 'light' | 'dark'
  }>(),
  { size: 'md', showNumber: true, theme: 'light' }
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

const colors = computed(() => {
  if (props.theme === 'dark') {
    return {
      filled: 'text-amber-400',
      empty: 'text-white/20',
      number: props.value === null ? 'text-white/40' : 'text-white',
    }
  }
  return {
    filled: 'text-ink',
    empty: 'text-ink-subtle/40',
    number: props.value === null ? 'text-ink-subtle' : 'text-ink',
  }
})
</script>

<template>
  <div class="flex items-center gap-2">
    <div v-if="value !== null" class="flex items-center gap-0.5" :class="sizeClasses.star">
      <span
        v-for="i in 5"
        :key="i"
        :class="i <= filledStars ? colors.filled : colors.empty"
        aria-hidden="true"
      >★</span>
    </div>
    <span :class="[sizeClasses.number, colors.number]" v-if="showNumber">
      {{ value !== null ? `${value}/10` : 'Sin calificar' }}
    </span>
  </div>
</template>
