<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const initials = computed(() => auth.user?.initials ?? '?')

async function handleLogout() {
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <header
    class="sticky top-0 z-40 border-b border-outline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80"
  >
    <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
      <RouterLink
        to="/"
        class="flex items-center gap-2 text-base font-semibold tracking-tight text-ink"
      >
        <span class="inline-block h-6 w-6 rounded bg-ink" />
        ReviewHub
      </RouterLink>

      <nav class="hidden items-center gap-1 md:flex">
        <RouterLink
          to="/"
          class="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
          active-class="text-ink"
        >
          Catálogo
        </RouterLink>
        <span
          v-if="auth.isAuthenticated"
          class="cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-ink-subtle"
          title="Próximamente"
        >
          Mis listas
        </span>
        <span
          v-if="auth.isAdmin"
          class="cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-ink-subtle"
          title="Próximamente"
        >
          Admin
        </span>
      </nav>

      <div class="flex items-center gap-2">
        <template v-if="!auth.isAuthenticated">
          <RouterLink
            to="/login"
            class="rounded-md px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle"
          >
            Iniciar sesión
          </RouterLink>
          <RouterLink
            to="/signup"
            class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Crear cuenta
          </RouterLink>
        </template>
        <template v-else>
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold uppercase text-white"
            :title="auth.user?.email ?? ''"
          >
            {{ initials }}
          </div>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
            @click="handleLogout"
          >
            Salir
          </button>
        </template>
      </div>
    </div>
  </header>
</template>
