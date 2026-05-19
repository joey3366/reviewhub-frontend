<script setup lang="ts">
defineProps<{
  modelValue: string
  options: Array<{ value: string; label: string }>
  label?: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span v-if="label" class="text-sm font-medium text-ink">{{ label }}</span>
    <select
      :value="modelValue"
      class="h-10 rounded-md border border-outline bg-surface px-3 pr-8 text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
  </label>
</template>
