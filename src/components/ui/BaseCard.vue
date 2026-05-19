<script setup lang="ts">
withDefaults(defineProps<{ padded?: boolean }>(), { padded: true })
</script>

<template>
  <div
    :class="[
      'rounded-lg border border-outline bg-surface',
      padded && 'p-6',
    ]"
  >
    <slot />
  </div>
</template>
