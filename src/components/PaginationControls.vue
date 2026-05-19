<script setup lang="ts">
import { computed } from 'vue'
import type { PaginationMeta } from '@/api/types'

const props = defineProps<{ meta: PaginationMeta }>()
defineEmits<{ 'update:page': [page: number] }>()

const pages = computed(() => {
  const total = props.meta.lastPage
  const current = props.meta.currentPage
  const arr: (number | '…')[] = []

  if (total <= 7) {
    for (let i = 1; i <= total; i++) arr.push(i)
    return arr
  }

  arr.push(1)
  if (current > 3) arr.push('…')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) arr.push(i)

  if (current < total - 2) arr.push('…')
  arr.push(total)
  return arr
})

const canPrev = computed(() => props.meta.currentPage > props.meta.firstPage)
const canNext = computed(() => props.meta.currentPage < props.meta.lastPage)
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-1">
    <button
      type="button"
      :disabled="!canPrev"
      class="h-9 rounded-md border border-outline px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
      @click="$emit('update:page', meta.currentPage - 1)"
    >
      Anterior
    </button>

    <template v-for="(p, i) in pages" :key="i">
      <span v-if="p === '…'" class="px-2 text-sm text-ink-subtle">…</span>
      <button
        v-else
        type="button"
        :class="[
          'h-9 min-w-9 rounded-md px-3 text-sm font-medium transition-colors',
          p === meta.currentPage
            ? 'bg-ink text-white'
            : 'border border-outline text-ink hover:bg-surface-subtle',
        ]"
        @click="$emit('update:page', p as number)"
      >
        {{ p }}
      </button>
    </template>

    <button
      type="button"
      :disabled="!canNext"
      class="h-9 rounded-md border border-outline px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
      @click="$emit('update:page', meta.currentPage + 1)"
    >
      Siguiente
    </button>
  </div>
</template>
