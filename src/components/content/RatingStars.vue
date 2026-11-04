<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Calificación 0.5 → 10 en pasos de 0.5.
 *
 * - Editable: 10 estrellas; cada una tiene dos mitades. Mitad izquierda
 *   de la estrella i = i - 0.5, mitad derecha = i. Flechas del teclado
 *   suben/bajan de a 0.5.
 * - Solo lectura: 5 estrellas (cada una = 2 puntos) con medias estrellas.
 *
 * Una media estrella se dibuja con dos capas: la estrella vacía abajo y
 * la llena arriba recortada con clip-path al 50%.
 */
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

const MIN = 0.5
const MAX = 10

const hovered = ref<number | null>(null)
const justPicked = ref<number | null>(null)
let pulseTimeout: number | null = null

type Fill = 'full' | 'half' | 'empty'

function fillFor(starIndex: number, starsValue: number): Fill {
  if (starsValue >= starIndex) return 'full'
  if (starsValue >= starIndex - 0.5) return 'half'
  return 'empty'
}

/** Solo lectura: 0-10 → 0-5 estrellas, redondeado a la media estrella. */
const readOnlyStars = computed(() => {
  if (props.value === null) return 0
  return Math.round(props.value) / 2
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return { star: 'text-xs', editableStar: 'text-base', number: 'text-xs' }
    case 'lg':
      return { star: 'text-xl', editableStar: 'text-[1.7rem] sm:text-3xl', number: 'text-xl font-semibold sm:text-2xl' }
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

function formatRating(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** Valor según en qué mitad de la estrella está el puntero. */
function valueFromPointer(i: number, e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const isLeftHalf = e.clientX - rect.left < rect.width / 2
  return isLeftHalf ? i - 0.5 : i
}

function pick(n: number) {
  if (!props.editable) return
  const clamped = Math.min(MAX, Math.max(MIN, n))
  emit('update:value', clamped)
  justPicked.value = Math.ceil(clamped)
  if (pulseTimeout) window.clearTimeout(pulseTimeout)
  pulseTimeout = window.setTimeout(() => {
    justPicked.value = null
  }, 450)
}

function onKeydown(e: KeyboardEvent) {
  const current = props.value ?? 0
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault()
    pick(current + 0.5)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault()
    pick(current - 0.5)
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <div
      v-if="editable"
      class="rating-picker flex items-center gap-0.5 sm:gap-1"
      :class="sizeClasses.editableStar"
      role="slider"
      tabindex="0"
      aria-label="Calificación de 0.5 a 10"
      :aria-valuemin="MIN"
      :aria-valuemax="MAX"
      :aria-valuenow="value ?? undefined"
      :aria-valuetext="value !== null ? `${formatRating(value)} de 10` : 'Sin calificar'"
      @mouseleave="hovered = null"
      @keydown="onKeydown"
    >
      <button
        v-for="i in 10"
        :key="i"
        type="button"
        tabindex="-1"
        :aria-label="`${i} de 10`"
        class="star-btn relative leading-none focus:outline-none"
        :class="[
          `fill-${fillFor(i, previewValue)}`,
          i === justPicked ? 'is-picked' : '',
          theme === 'dark' ? 'theme-dark' : 'theme-light',
        ]"
        :style="{ transitionDelay: i <= previewValue ? `${(i - 1) * 18}ms` : '0ms' }"
        @mousemove="hovered = valueFromPointer(i, $event)"
        @click="pick(valueFromPointer(i, $event))"
      >
        <span class="star-empty" aria-hidden="true">★</span>
        <span class="star-fill" aria-hidden="true">★</span>
      </button>
    </div>

    <div v-else-if="value !== null" class="flex items-center gap-0.5" :class="sizeClasses.star">
      <span
        v-for="i in 5"
        :key="i"
        class="relative leading-none"
        aria-hidden="true"
      >
        <span :class="colors.empty">★</span>
        <span
          v-if="fillFor(i, readOnlyStars) !== 'empty'"
          class="absolute inset-0"
          :class="colors.filled"
          :style="fillFor(i, readOnlyStars) === 'half' ? { clipPath: 'inset(0 50% 0 0)' } : undefined"
        >★</span>
      </span>
    </div>

    <span :class="[sizeClasses.number, colors.number]" v-if="showNumber">
      {{ editable
          ? (previewValue > 0 ? `${formatRating(previewValue)}/10` : 'Elegí una nota')
          : (value !== null ? `${formatRating(value)}/10` : 'Sin calificar') }}
    </span>
  </div>
</template>

<style scoped>
.rating-picker:focus-visible {
  outline: 2px solid rgb(251, 191, 36);
  outline-offset: 4px;
  border-radius: 4px;
}
.star-btn {
  transition:
    transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.2s ease;
  transform-origin: center;
  cursor: pointer;
}
.star-btn .star-fill {
  position: absolute;
  inset: 0;
  transition:
    opacity 0.2s ease,
    clip-path 0.15s ease;
}

/* Colores por tema */
.theme-dark .star-empty { color: rgba(255, 255, 255, 0.2); }
.theme-light .star-empty { color: rgba(10, 10, 10, 0.25); }
.theme-dark .star-fill {
  color: rgb(251, 191, 36);
  text-shadow: 0 0 14px rgba(251, 191, 36, 0.45);
}
.theme-light .star-fill {
  color: rgb(217, 119, 6);
  text-shadow: 0 0 10px rgba(217, 119, 6, 0.25);
}

/* Estado de llenado */
.star-btn.fill-empty .star-fill { opacity: 0; clip-path: inset(0 0 0 0); }
.star-btn.fill-half .star-fill { opacity: 1; clip-path: inset(0 50% 0 0); }
.star-btn.fill-full .star-fill { opacity: 1; clip-path: inset(0 0 0 0); }

.rating-picker:hover .star-btn.fill-full,
.rating-picker:hover .star-btn.fill-half {
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
  .rating-picker:hover .star-btn.fill-full,
  .rating-picker:hover .star-btn.fill-half {
    animation: none;
    transition: none;
    transform: none;
  }
}
</style>
