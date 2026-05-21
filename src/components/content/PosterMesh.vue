<script setup lang="ts">
import { shallowRef } from 'vue'
import { useLoop } from '@tresjs/core'
import type { Mesh, Texture } from 'three'

const props = defineProps<{
  texture: Texture | null
  isHovering: boolean
  mouseX: number
  mouseY: number
}>()

const meshRef = shallowRef<Mesh | null>(null)
let elapsed = 0

const { onBeforeRender } = useLoop()
onBeforeRender(({ delta }: { delta: number; elapsed: number }) => {
  const mesh = meshRef.value
  if (!mesh) return
  elapsed += delta

  if (props.isHovering) {
    const targetY = props.mouseX * 0.4
    const targetX = -props.mouseY * 0.25
    mesh.rotation.y += (targetY - mesh.rotation.y) * 0.12
    mesh.rotation.x += (targetX - mesh.rotation.x) * 0.12
  } else {
    const targetY = Math.sin(elapsed * 0.9) * 0.09
    mesh.rotation.y += (targetY - mesh.rotation.y) * 0.04
    mesh.rotation.x += (0 - mesh.rotation.x) * 0.04
  }
})
</script>

<template>
  <TresMesh ref="meshRef">
    <TresPlaneGeometry :args="[2, 3]" />
    <TresMeshBasicMaterial
      :key="texture ? 'tex' : 'fallback'"
      :map="texture"
      :color="texture ? 0xb8b8b8 : 0x2a2a2a"
      :transparent="true"
    />
  </TresMesh>
</template>
