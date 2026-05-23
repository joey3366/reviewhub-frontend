<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Review } from '@/api/types'
import ReviewForm from './ReviewForm.vue'

const props = defineProps<{
  open: boolean
  contentSlug: string
  initial?: Review | null
  presetRating?: number
}>()

const emit = defineEmits<{
  close: []
  success: [review: Review]
}>()

const dialogRef = ref<HTMLDivElement | null>(null)

function close() {
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) close()
}

function lockScroll(lock: boolean) {
  document.body.style.overflow = lock ? 'hidden' : ''
}

watch(
  () => props.open,
  (open) => {
    lockScroll(open)
    if (open) {
      setTimeout(() => dialogRef.value?.focus(), 0)
    }
  },
  { immediate: true }
)

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  lockScroll(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl max-h-[90vh] focus:outline-none"
        >
          <ReviewForm
            :content-slug="contentSlug"
            :initial="initial"
            :preset-rating="presetRating"
            @cancel="close"
            @success="emit('success', $event)"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
