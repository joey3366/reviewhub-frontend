<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { extractFieldErrors, extractErrorMessage } from '@/utils/extractFieldErrors'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const auth = useAuthStore()
const router = useRouter()

const fullName = ref('')
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
    await auth.signup(email.value, password.value, fullName.value || undefined)
    router.push('/')
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
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Crear cuenta</h1>
      <p class="text-sm text-ink-muted">
        ¿Ya tenés cuenta?
        <RouterLink to="/login" class="font-medium text-accent hover:text-accent-hover">
          Iniciá sesión
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
        v-model="fullName"
        label="Nombre completo (opcional)"
        autocomplete="name"
        :error="fieldErrors.fullName"
      />
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
        autocomplete="new-password"
        required
        :error="fieldErrors.password"
        hint="Mínimo 8 caracteres."
      />

      <BaseButton type="submit" :loading="loading" class="mt-2 w-full">
        Crear cuenta
      </BaseButton>
    </form>
  </div>
</template>
