<script setup lang="ts">
defineProps<{
  modelValue: string
  label?: string
  placeholder?: string
  type?: string
  error?: string
  autocomplete?: string
  required?: boolean
  hint?: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span v-if="label" class="text-sm font-medium text-ink">{{ label }}</span>
    <input
      :type="type ?? 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :class="[
        'h-10 rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
        error ? 'border-error' : 'border-outline focus:border-accent',
      ]"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="text-xs text-error">{{ error }}</span>
    <span v-else-if="hint" class="text-xs text-ink-subtle">{{ hint }}</span>
  </label>
</template>
