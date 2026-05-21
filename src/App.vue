<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import NavBar from '@/components/layout/NavBar.vue'

const route = useRoute()
const isFullBleed = computed(() => route.meta.fullBleed === true)
</script>

<template>
  <div class="min-h-screen bg-surface">
    <NavBar />
    <main :class="isFullBleed ? '' : 'mx-auto max-w-7xl px-6 py-10'">
      <RouterView />
    </main>
  </div>
</template>
