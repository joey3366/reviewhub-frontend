<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import NavBar from '@/components/layout/NavBar.vue'

const route = useRoute()
const isFullBleed = computed(() => route.meta.fullBleed === true)

watchEffect(() => {
  document.documentElement.classList.toggle('full-bleed', isFullBleed.value)
})
</script>

<template>
  <div :class="isFullBleed ? 'min-h-screen bg-black' : 'min-h-screen bg-surface'">
    <NavBar />
    <main :class="isFullBleed ? '' : 'mx-auto max-w-7xl px-6 py-10'">
      <RouterView />
    </main>
  </div>
</template>
