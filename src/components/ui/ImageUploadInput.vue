<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  uploadImage,
  isCloudinaryConfigured,
  CloudinaryUploadError,
  type UploadResult,
} from '@/lib/cloudinary'

/**
 * Input combinado para imágenes: subida directa a Cloudinary (drag-drop o
 * file picker) + fallback a pegar una URL externa (TMDb, IMDb, etc.).
 *
 * El valor que emite es siempre un string (URL final). El padre lo guarda
 * en `posterUrl` / `backdropUrl` igual que antes. El backend NO se entera
 * de la diferencia entre upload y URL externa — ambas son strings de URL.
 *
 * Props:
 *  - modelValue: la URL actual (puede venir de Cloudinary o externa)
 *  - label: ej. "Poster" o "Backdrop"
 *  - folder: sub-carpeta dentro del preset, ej. "posters"
 *  - aspectClass: clase Tailwind para el aspect-ratio del preview
 *  - accept: filtro de file picker (default "image/*")
 */

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    folder?: string
    aspectClass?: string
    accept?: string
  }>(),
  {
    folder: undefined,
    aspectClass: 'aspect-video',
    accept: 'image/png, image/jpeg, image/webp',
  }
)

const emit = defineEmits<{
  'update:modelValue': [string]
}>()

const cloudinaryReady = isCloudinaryConfigured()
const fileInputRef = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const uploading = ref(false)
const progress = ref(0)
const error = ref<string | null>(null)
// Modo "pegar URL" — toggle visible solo cuando NO hay valor cargado.
const urlMode = ref(false)
const urlDraft = ref('')

const hasValue = computed(() => props.modelValue.trim().length > 0)

function pick() {
  fileInputRef.value?.click()
}

async function handleFiles(files: FileList | null) {
  if (!files || files.length === 0) return
  const file = files[0]
  if (!cloudinaryReady) {
    error.value = 'Cloudinary no está configurado. Pegá una URL en su lugar.'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    error.value = 'El archivo supera 5MB.'
    return
  }
  error.value = null
  uploading.value = true
  progress.value = 0
  try {
    const result: UploadResult = await uploadImage(file, {
      folder: props.folder,
      onProgress: (p) => (progress.value = p),
    })
    emit('update:modelValue', result.secureUrl)
  } catch (e) {
    if (e instanceof CloudinaryUploadError) {
      error.value = `Falló la subida: ${e.message}`
    } else {
      error.value = 'No se pudo subir la imagen.'
    }
    console.error(e)
  } finally {
    uploading.value = false
    progress.value = 0
  }
}

function onChange(e: Event) {
  const target = e.target as HTMLInputElement
  handleFiles(target.files)
  // Reset el input para que cargar el mismo archivo dos veces dispare change.
  target.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (uploading.value) return
  handleFiles(e.dataTransfer?.files ?? null)
}

function clear() {
  emit('update:modelValue', '')
  urlDraft.value = ''
  urlMode.value = false
  error.value = null
}

function applyUrl() {
  const trimmed = urlDraft.value.trim()
  if (trimmed.length === 0) return
  emit('update:modelValue', trimmed)
  urlMode.value = false
  urlDraft.value = ''
  error.value = null
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <span class="text-sm font-medium text-ink">{{ label }}</span>

    <!-- Preview cuando ya hay URL -->
    <div v-if="hasValue && !uploading" class="flex items-start gap-3">
      <div :class="['shrink-0 overflow-hidden rounded border border-outline bg-surface-subtle', aspectClass === 'aspect-[2/3]' ? 'h-40 w-28' : 'h-24 w-40']">
        <img :src="modelValue" :alt="label" class="h-full w-full object-cover" @error="error = 'No se pudo cargar la imagen desde esa URL.'" />
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <p class="break-all text-xs text-ink-muted">{{ modelValue }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-md border border-outline px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
            @click="pick"
          >
            Cambiar
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            @click="clear"
          >
            Quitar
          </button>
        </div>
      </div>
    </div>

    <!-- Drag-drop + URL toggle cuando no hay valor -->
    <template v-else>
      <div
        v-if="!urlMode"
        :class="[
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          aspectClass,
          dragOver
            ? 'border-accent bg-accent/5'
            : 'border-outline bg-surface hover:border-ink-subtle',
          uploading ? 'pointer-events-none opacity-70' : 'cursor-pointer',
        ]"
        role="button"
        :aria-label="`Subir ${label.toLowerCase()}`"
        tabindex="0"
        @click="pick"
        @keydown.enter="pick"
        @keydown.space.prevent="pick"
        @dragenter.prevent="dragOver = true"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <template v-if="uploading">
          <span class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p class="text-xs text-ink-muted">Subiendo… {{ progress }}%</p>
          <div class="h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-surface-subtle">
            <div class="h-full bg-accent transition-all" :style="{ width: progress + '%' }" />
          </div>
        </template>
        <template v-else>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8 text-ink-subtle">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          <p class="text-sm text-ink">Arrastrá una imagen o tocá</p>
          <p class="text-xs text-ink-subtle">PNG, JPG o WebP · máx 5MB</p>
        </template>
      </div>

      <!-- Modo URL: input + apply -->
      <div v-else class="flex flex-col gap-2 rounded-lg border border-outline bg-surface p-3">
        <input
          v-model="urlDraft"
          type="url"
          placeholder="https://…"
          class="h-10 rounded-md border border-outline bg-white px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          @keydown.enter.prevent="applyUrl"
        />
        <div class="flex justify-end gap-2">
          <button type="button" class="text-xs text-ink-muted hover:text-ink" @click="urlMode = false">
            Cancelar
          </button>
          <button type="button" class="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-hover" @click="applyUrl">
            Usar esta URL
          </button>
        </div>
      </div>

      <!-- Toggle a modo URL -->
      <button
        v-if="!urlMode && !uploading"
        type="button"
        class="self-start text-xs text-ink-muted underline-offset-2 hover:underline"
        @click="urlMode = true; urlDraft = ''"
      >
        o pegá una URL externa
      </button>
    </template>

    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <p v-if="!cloudinaryReady" class="text-xs text-amber-700">
      Cloudinary no está configurado: solo podés pegar URLs.
    </p>

    <input
      ref="fileInputRef"
      type="file"
      :accept="accept"
      class="hidden"
      @change="onChange"
    />
  </div>
</template>
