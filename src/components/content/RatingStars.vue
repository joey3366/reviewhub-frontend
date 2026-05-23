<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number | null
    size?: 'sm' | 'md' | 'lg'
    showNumber?: boolean
    theme?: 'light' | 'dark'
    editable?: boolean
  }>(),
  { size: 'md', showNumber: true, theme: 'light', editable: false }
)

const emit = defineEmits<{ 'update:value': [value: number] }>()

const hovered = ref<number | null>(null)
const justPicked = ref<number | null>(null)
let pulseTimeout: number | null = null

const filledStars = computed(() => {
  if (props.value === null) return 0
  return Math.round(props.value / 2)
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return { star: 'text-xs', editableStar: 'text-base', number: 'text-xs' }
    case 'lg':
      return { star: 'text-xl', editableStar: 'text-3xl', number: 'text-2xl font-semibold' }
    default:
      return { star: 'text-sm', editableStar: 'text-2xl', number: 'text-sm font-medium' }
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

const previewValue = computed(() => hovered.value ?? props.value ?? 0)

function pick(n: number) {
  if (!props.editable) return
  emit('update:value', n)
  justPicked.value = n
  if (pulseTimeout) window.clearTimeout(pulseTimeout)
  pulseTimeout = window.setTimeout(() => {
    justPicked.value = null
  }, 450)
}
</script>

<template>
  <div class="flex items-center gap-3">
    <div
      v-if="editable"
      class="rating-picker flex items-center gap-1"
      :class="sizeClasses.editableStar"
      role="radiogroup"
      aria-label="Calificación de 1 a 10"
      @mouseleave="hovered = null"
    >
      <button
        v-for="i in 10"
        :key="i"
        type="button"
        role="radio"
        :aria-checked="i === value"
        :aria-label="`${i} de 10`"
        class="star-btn leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm"
        :class="[
          i <= previewValue ? 'is-filled' : 'is-empty',
          i === justPicked ? 'is-picked' : '',
          theme === 'dark' ? 'theme-dark' : 'theme-light',
        ]"
        :style="{ transitionDelay: i <= previewValue ? `${(i - 1) * 18}ms` : '0ms' }"
        @mouseenter="hovered = i"
        @focus="hovered = i"
        @click="pick(i)"
      >★</button>
    </div>

    <div v-else-if="value !== null" class="flex items-center gap-0.5" :class="sizeClasses.star">
      <span
        v-for="i in 5"
        :key="i"
        :class="i <= filledStars ? colors.filled : colors.empty"
        aria-hidden="true"
      >★</span>
    </div>

    <span :class="[sizeClasses.number, colors.number]" v-if="showNumber">
      {{ editable
          ? (previewValue > 0 ? `${previewValue}/10` : 'Elegí una nota')
          : (value !== null ? `${value}/10` : 'Sin calificar') }}
    </span>
  </div>
</template>

<style scoped>
.star-btn {
  transition:
    color 0.2s ease,
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    text-shadow 0.2s ease,
    filter 0.2s ease;
  transform-origin: center;
  cursor: pointer;
}
.star-btn.is-empty.theme-dark { color: rgba(255, 255, 255, 0.2); }
.star-btn.is-empty.theme-light { color: rgba(10, 10, 10, 0.25); }
.star-btn.is-filled.theme-dark {
  color: rgb(251, 191, 36);
  text-shadow: 0 0 14px rgba(251, 191, 36, 0.45);
}
.star-btn.is-filled.theme-light {
  color: rgb(217, 119, 6);
  text-shadow: 0 0 10px rgba(217, 119, 6, 0.25);
}
.rating-picker:hover .star-btn.is-filled {
  transform: translateY(-2px) scale(1.08);
}
.star-btn:hover {
  transform: translateY(-3px) scale(1.18) rotate(-4deg);
  filter: brightness(1.15);
}
.star-btn.is-picked {
  animation: starPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes starPop {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.45) rotate(-6deg); filter: brightness(1.4); }
  70%  { transform: scale(0.92) rotate(2deg); }
  100% { transform: scale(1); filter: brightness(1); }
}
@media (prefers-reduced-motion: reduce) {
  .star-btn,
  .star-btn:hover,
  .star-btn.is-picked,
  .rating-picker:hover .star-btn.is-filled {
    animation: none;
    transition: color 0.15s ease;
    transform: none;
  }
}
</style>
