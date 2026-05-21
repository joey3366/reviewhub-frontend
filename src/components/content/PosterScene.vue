<script setup lang="ts">
import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { TresCanvas, useLoop } from '@tresjs/core'
import { TextureLoader, type Texture, type Mesh } from 'three'

const props = defineProps<{
  posterUrl: string | null
  title: string
}>()

const meshRef = shallowRef<Mesh | null>(null)
const texture = shallowRef<Texture | null>(null)
const isHovering = ref(false)
const mouseX = ref(0)
const mouseY = ref(0)
let elapsed = 0

watch(
  () => props.posterUrl,
  (url) => {
    texture.value?.dispose()
    texture.value = null
    if (!url) return
    const loader = new TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      url,
      (tex) => {
        texture.value = tex
      },
      undefined,
      () => {
        texture.value = null
      }
    )
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  texture.value?.dispose()
})

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }: { delta: number; elapsed: number }) => {
  const mesh = meshRef.value
  if (!mesh) return
  elapsed += delta

  if (isHovering.value) {
    const targetY = mouseX.value * 0.4
    const targetX = -mouseY.value * 0.25
    mesh.rotation.y += (targetY - mesh.rotation.y) * 0.12
    mesh.rotation.x += (targetX - mesh.rotation.x) * 0.12
  } else {
    const targetY = Math.sin(elapsed * 0.9) * 0.09
    mesh.rotation.y += (targetY - mesh.rotation.y) * 0.04
    mesh.rotation.x += (0 - mesh.rotation.x) * 0.04
  }
})

function handleMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  mouseX.value = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouseY.value = ((e.clientY - rect.top) / rect.height) * 2 - 1
}
</script>

<template>
  <div
    class="relative aspect-[2/3] w-full overflow-hidden rounded-md border border-outline bg-surface-muted"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
    @mousemove="handleMouseMove"
  >
    <TresCanvas v-if="posterUrl" :alpha="true" :antialias="true" :clear-color="'#00000000'">
      <TresPerspectiveCamera :position="[0, 0, 4]" :fov="50" />
      <TresMesh ref="meshRef">
        <TresPlaneGeometry :args="[2, 3]" />
        <TresMeshBasicMaterial v-if="texture" :map="texture" :transparent="true" />
        <TresMeshBasicMaterial v-else :color="'#e5e5e5'" />
      </TresMesh>
    </TresCanvas>
    <div
      v-else
      class="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center"
    >
      <span class="text-xs uppercase tracking-wide text-ink-subtle">Sin poster</span>
      <span class="line-clamp-3 text-sm font-medium text-ink-muted">{{ title }}</span>
    </div>
  </div>
</template>
