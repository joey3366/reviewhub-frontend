<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import axios from 'axios'
import type { Review } from '@/api/types'
import { reviewsApi, type CreateReviewInput } from '@/api/reviews'
import { extractFieldErrors, extractErrorMessage } from '@/utils/extractFieldErrors'
import RatingStars from './RatingStars.vue'

const props = defineProps<{
  contentSlug: string
  initial?: Review | null
  presetRating?: number
}>()

const emit = defineEmits<{
  success: [review: Review]
  cancel: []
}>()

const mode = computed<'create' | 'edit'>(() => (props.initial ? 'edit' : 'create'))

const form = reactive<{ rating: number; title: string; body: string }>({
  rating: props.initial?.rating ?? props.presetRating ?? 0,
  title: props.initial?.title ?? '',
  body: props.initial?.body ?? '',
})

const fieldErrors = ref<Record<string, string>>({})
const generalError = ref<string | null>(null)
const loading = ref(false)

const TITLE_MIN = 3
const TITLE_MAX = 200
const BODY_MIN = 10
const BODY_MAX = 10000

const titleCount = computed(() => form.title.trim().length)
const bodyCount = computed(() => form.body.trim().length)

function validate(): boolean {
  const errs: Record<string, string> = {}
  if (form.rating < 1 || form.rating > 10) {
    errs.rating = 'Elegí una calificación entre 1 y 10.'
  }
  // Título y body son opcionales: solo se validan si escribiste algo.
  if (titleCount.value > 0 && titleCount.value < TITLE_MIN) {
    errs.title = `Mínimo ${TITLE_MIN} caracteres (o dejalo vacío).`
  } else if (titleCount.value > TITLE_MAX) {
    errs.title = `Máximo ${TITLE_MAX} caracteres.`
  }
  if (bodyCount.value > 0 && bodyCount.value < BODY_MIN) {
    errs.body = `Mínimo ${BODY_MIN} caracteres (o dejalo vacío).`
  } else if (bodyCount.value > BODY_MAX) {
    errs.body = `Máximo ${BODY_MAX} caracteres.`
  }
  fieldErrors.value = errs
  return Object.keys(errs).length === 0
}

async function handleSubmit() {
  generalError.value = null
  if (!validate()) return

  loading.value = true
  try {
    const payload: CreateReviewInput = {
      rating: form.rating,
      title: form.title.trim() || undefined,
      body: form.body.trim() || undefined,
    }
    const review =
      mode.value === 'edit' && props.initial
        ? await reviewsApi.update(props.initial.id, payload)
        : await reviewsApi.create(props.contentSlug, payload)
    emit('success', review)
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined
    if (status === 422) {
      fieldErrors.value = extractFieldErrors(e)
      if (Object.keys(fieldErrors.value).length === 0) {
        generalError.value = extractErrorMessage(e)
      }
    } else if (status === 409) {
      generalError.value = extractErrorMessage(e)
    } else {
      generalError.value = extractErrorMessage(e)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="handleSubmit">
    <header class="flex flex-col gap-1">
      <h2 class="text-xl font-semibold tracking-tight text-white">
        {{ mode === 'edit' ? 'Editar tu review' : 'Escribir review' }}
      </h2>
      <p class="text-sm text-white/60">
        La calificación alcanza. El título y la reseña son opcionales.
      </p>
    </header>

    <div
      v-if="generalError"
      class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
      role="alert"
    >
      {{ generalError }}
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-sm font-medium text-white">Calificación</span>
      <RatingStars
        :value="form.rating || null"
        :editable="true"
        size="lg"
        theme="dark"
        @update:value="form.rating = $event"
      />
      <span v-if="fieldErrors.rating" class="text-xs text-red-300">{{ fieldErrors.rating }}</span>
    </div>

    <label class="flex flex-col gap-1.5">
      <span class="text-sm font-medium text-white">Título <span class="font-normal text-white/40">(opcional)</span></span>
      <input
        v-model="form.title"
        type="text"
        maxlength="200"
        placeholder="Un resumen en una línea"
        :class="[
          'h-10 rounded-md border bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400',
          fieldErrors.title ? 'border-red-400/60' : 'border-white/15 focus:border-amber-400',
        ]"
      />
      <div class="flex items-center justify-between">
        <span v-if="fieldErrors.title" class="text-xs text-red-300">{{ fieldErrors.title }}</span>
        <span v-else class="text-xs text-white/40">{{ TITLE_MIN }}–{{ TITLE_MAX }} caracteres</span>
        <span class="text-xs text-white/40">{{ titleCount }}/{{ TITLE_MAX }}</span>
      </div>
    </label>

    <label class="flex flex-col gap-1.5">
      <span class="text-sm font-medium text-white">Tu review <span class="font-normal text-white/40">(opcional)</span></span>
      <textarea
        v-model="form.body"
        rows="6"
        maxlength="10000"
        placeholder="Contá qué te gustó, qué no, sin spoilers fuertes."
        :class="[
          'rounded-md border bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y',
          fieldErrors.body ? 'border-red-400/60' : 'border-white/15 focus:border-amber-400',
        ]"
      />
      <div class="flex items-center justify-between">
        <span v-if="fieldErrors.body" class="text-xs text-red-300">{{ fieldErrors.body }}</span>
        <span v-else class="text-xs text-white/40">{{ BODY_MIN }}–{{ BODY_MAX }} caracteres</span>
        <span class="text-xs text-white/40">{{ bodyCount }}/{{ BODY_MAX }}</span>
      </div>
    </label>

    <footer class="flex items-center justify-end gap-3 pt-2">
      <button
        type="button"
        class="h-10 rounded-md border border-white/15 px-4 text-sm font-medium text-white/80 transition-colors hover:bg-white/5"
        :disabled="loading"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
      <button
        type="submit"
        class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="loading"
      >
        <span
          v-if="loading"
          class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
        {{ mode === 'edit' ? 'Guardar cambios' : 'Publicar review' }}
      </button>
    </footer>
  </form>
</template>
