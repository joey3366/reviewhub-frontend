<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    placeholder?: string
    type?: string
    error?: string
    autocomplete?: string
    required?: boolean
    hint?: string
    /** light para páginas claras (default); dark para forms sobre fondo oscuro. */
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
      label: 'text-white',
      input: [
        'h-10 rounded-md border bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 transition-colors focus:outline-none focus:ring-1 [color-scheme:dark]',
        props.error
          ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
          : 'border-white/15 focus:border-amber-400 focus:ring-amber-400',
      ],
      error: 'text-red-300',
      hint: 'text-white/50',
    }
  }
  return {
    label: 'text-ink',
    input: [
      'h-10 rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
      props.error ? 'border-error' : 'border-outline focus:border-accent',
    ],
    error: 'text-error',
    hint: 'text-ink-subtle',
  }
})
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span v-if="label" class="text-sm font-medium" :class="styles.label">{{ label }}</span>
    <input
      :type="type ?? 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :class="styles.input"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="text-xs" :class="styles.error">{{ error }}</span>
    <span v-else-if="hint" class="text-xs" :class="styles.hint">{{ hint }}</span>
  </label>
</template>
