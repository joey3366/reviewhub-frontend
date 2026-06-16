<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: Array<{ value: string; label: string }>
    label?: string
    variant?: 'light' | 'dark'
  }>(),
  { variant: 'light' }
)

defineEmits<{
  'update:modelValue': [value: string]
}>()

const styles = computed(() => {
  if (props.variant === 'dark') {
    return {
      label: 'text-white/70',
      select:
        'h-10 rounded-md border border-white/15 bg-black/30 px-3 pr-8 text-sm text-white transition-colors [color-scheme:dark] focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400',
    }
  }
  return {
    label: 'text-ink',
    select:
      'h-10 rounded-md border border-outline bg-surface px-3 pr-8 text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent',
  }
})
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span v-if="label" class="text-sm font-medium" :class="styles.label">{{ label }}</span>
    <select
      :value="modelValue"
      :class="styles.select"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option
        v-for="opt in options"
        :key="opt.value"
        :value="opt.value"
        :class="variant === 'dark' ? 'bg-neutral-900' : ''"
      >
        {{ opt.label }}
      </option>
    </select>
  </label>
</template>
