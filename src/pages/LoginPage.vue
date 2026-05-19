<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { extractFieldErrors, extractErrorMessage } from '@/utils/extractFieldErrors'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const fieldErrors = ref<Record<string, string>>({})
const generalError = ref<string | null>(null)
const loading = ref(false)

async function handleSubmit() {
  loading.value = true
  fieldErrors.value = {}
  generalError.value = null
  try {
    await auth.login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch (e) {
    fieldErrors.value = extractFieldErrors(e)
    if (Object.keys(fieldErrors.value).length === 0) {
      generalError.value = extractErrorMessage(e)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Iniciar sesión</h1>
      <p class="text-sm text-ink-muted">
        ¿No tenés cuenta?
        <RouterLink to="/signup" class="font-medium text-accent hover:text-accent-hover">
          Creá una
        </RouterLink>
      </p>
    </header>

    <div
      v-if="generalError"
      class="rounded-md border border-error/30 bg-red-50 px-3 py-2 text-sm text-error"
    >
      {{ generalError }}
    </div>

    <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
      <BaseInput
        v-model="email"
        label="Email"
        type="email"
        autocomplete="email"
        required
        :error="fieldErrors.email"
      />
      <BaseInput
        v-model="password"
        label="Contraseña"
        type="password"
        autocomplete="current-password"
        required
        :error="fieldErrors.password"
      />

      <BaseButton type="submit" :loading="loading" class="mt-2 w-full">
        Iniciar sesión
      </BaseButton>
    </form>
  </div>
</template>
