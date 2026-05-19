<script setup lang="ts">
type Tone = 'neutral' | 'accent' | 'success' | 'error' | 'warning'

withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' })
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
      tone === 'neutral' && 'border border-outline bg-surface-subtle text-ink-muted',
      tone === 'accent' && 'bg-accent-soft text-accent',
      tone === 'success' && 'bg-green-50 text-success',
      tone === 'error' && 'bg-red-50 text-error',
      tone === 'warning' && 'bg-yellow-50 text-warning',
    ]"
  >
    <slot />
  </span>
</template>
