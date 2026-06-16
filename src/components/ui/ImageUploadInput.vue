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
 *  - variant: light para páginas claras, dark para forms sobre fondo oscuro
 */

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    folder?: string
    aspectClass?: string
    accept?: string
    variant?: 'light' | 'dark'
  }>(),
  {
    folder: undefined,
    aspectClass: 'aspect-video',
    accept: 'image/png, image/jpeg, image/webp',
    variant: 'light',
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

const styles = computed(() => {
  if (props.variant === 'dark') {
    return {
      label: 'text-white',
      preview: 'border-amber-400/20 bg-black/30',
      btnChange: 'border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/10',
      btnRemove: 'text-red-300 hover:bg-red-500/10',
      dropZoneIdle: 'border-white/15 bg-white/[0.03] hover:border-amber-400/60',
      dropZoneDragOver: 'border-amber-400 bg-amber-400/[0.08]',
      iconUpload: 'text-white/50',
      dropMainText: 'text-white',
      dropSubText: 'text-white/50',
      progressTrack: 'bg-white/10',
      progressBar: 'bg-amber-400',
      progressText: 'text-white/70',
      spinner: 'border-amber-400',
      urlPanel: 'border-white/15 bg-black/30',
      urlInput:
        'border-white/15 bg-black/40 text-white placeholder:text-white/30 focus:border-amber-400 focus:ring-amber-400',
      urlCancel: 'text-white/60 hover:text-white',
      urlApply: 'bg-amber-400 text-black hover:bg-amber-300',
      errorText: 'text-red-300',
      warnText: 'text-amber-300',
      urlToggle: 'text-amber-300/80 hover:text-amber-200 hover:underline',
    }
  }
  return {
    label: 'text-ink',
    preview: 'border-outline bg-surface-subtle',
    btnChange: 'border-outline text-ink-muted hover:bg-surface-subtle',
    btnRemove: 'text-red-600 hover:bg-red-50',
    dropZoneIdle: 'border-outline bg-surface hover:border-ink-subtle',
    dropZoneDragOver: 'border-accent bg-accent/5',
    iconUpload: 'text-ink-subtle',
    dropMainText: 'text-ink',
    dropSubText: 'text-ink-subtle',
    progressTrack: 'bg-surface-subtle',
    progressBar: 'bg-accent',
    progressText: 'text-ink-muted',
    spinner: 'border-accent',
    urlPanel: 'border-outline bg-surface',
    urlInput:
      'border-outline bg-white text-ink focus:border-accent focus:ring-accent',
    urlCancel: 'text-ink-muted hover:text-ink',
    urlApply: 'bg-accent text-white hover:bg-accent-hover',
    errorText: 'text-red-600',
    warnText: 'text-amber-700',
    urlToggle: 'text-ink-muted hover:underline',
  }
})

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
    <span class="text-sm font-medium" :class="styles.label">{{ label }}</span>

    <!-- Preview cuando ya hay URL -->
    <div v-if="hasValue && !uploading" class="flex items-start gap-3">
      <div :class="['shrink-0 overflow-hidden rounded border', styles.preview, aspectClass === 'aspect-[2/3]' ? 'h-40 w-28' : 'h-24 w-40']">
        <img :src="modelValue" :alt="label" class="h-full w-full object-cover" @error="error = 'No se pudo cargar la imagen desde esa URL.'" />
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-md border px-2.5 py-1 text-xs font-medium"
            :class="styles.btnChange"
            @click="pick"
          >
            Cambiar
          </button>
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-xs font-medium"
            :class="styles.btnRemove"
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
          dragOver ? styles.dropZoneDragOver : styles.dropZoneIdle,
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
          <span class="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" :class="styles.spinner" />
          <p class="text-xs" :class="styles.progressText">Subiendo… {{ progress }}%</p>
          <div class="h-1 w-full max-w-[12rem] overflow-hidden rounded-full" :class="styles.progressTrack">
            <div class="h-full transition-all" :class="styles.progressBar" :style="{ width: progress + '%' }" />
          </div>
        </template>
        <template v-else>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-8 w-8" :class="styles.iconUpload">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          <p class="text-sm" :class="styles.dropMainText">Arrastrá una imagen o tocá</p>
          <p class="text-xs" :class="styles.dropSubText">PNG, JPG o WebP · máx 5MB</p>
        </template>
      </div>

      <!-- Modo URL: input + apply -->
      <div v-else class="flex flex-col gap-2 rounded-lg border p-3" :class="styles.urlPanel">
        <input
          v-model="urlDraft"
          type="url"
          placeholder="https://…"
          class="h-10 rounded-md border px-3 text-sm focus:outline-none focus:ring-1"
          :class="styles.urlInput"
          @keydown.enter.prevent="applyUrl"
        />
        <div class="flex justify-end gap-2">
          <button type="button" class="text-xs" :class="styles.urlCancel" @click="urlMode = false">
            Cancelar
          </button>
          <button type="button" class="rounded-md px-3 py-1 text-xs font-semibold" :class="styles.urlApply" @click="applyUrl">
            Usar esta URL
          </button>
        </div>
      </div>

      <!-- Toggle a modo URL -->
      <button
        v-if="!urlMode && !uploading"
        type="button"
        class="self-start text-xs underline-offset-2"
        :class="styles.urlToggle"
        @click="urlMode = true; urlDraft = ''"
      >
        o pegá una URL externa
      </button>
    </template>

    <p v-if="error" class="text-xs" :class="styles.errorText">{{ error }}</p>
    <p v-if="!cloudinaryReady" class="text-xs" :class="styles.warnText">
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
