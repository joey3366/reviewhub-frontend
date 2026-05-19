# 05 — Estado con Pinia (auth store)

> **Pre-requisitos:** doc 04 (`api/client.ts` + `api/auth.ts` + tipos
> listos). Vamos a usar `authApi` para hacer las llamadas reales.
>
> **Objetivo:** crear el **auth store** con Pinia que maneje:
> el `token` (persistido en `localStorage`), el `user` (cargado del backend),
> y los getters `isAuthenticated` / `isAdmin` que cualquier componente
> puede leer reactivamente. Al final, vas a poder hacer `auth.login(email,
> password)` desde cualquier componente y todo el árbol va a re-renderizar
> con el nuevo estado.

Al terminar este doc vas a entender:

- Qué es **Pinia**, por qué reemplazó a Vuex, y la diferencia entre la
  **Options API** y la **Setup API** de stores.
- Cómo persistir un valor entre refreshes con `localStorage` y por qué
  **no necesitás `pinia-plugin-persistedstate`** para esto.
- Por qué el `token` lo leemos desde `localStorage` en el interceptor de
  axios y desde Pinia en los componentes — y cómo evitar la dependencia
  circular.
- Cómo **bootstrappear el user** en `main.ts` (si hay token al cargar la
  página, traer el profile).
- Qué pasa cuando el token es válido pero el server fue reiniciado y los
  tokens están invalidados.
- Por qué `localStorage` está OK para Bearer tokens en este proyecto,
  cuándo conviene **cookies HttpOnly**, y qué trade-offs hay.

---

## 1 · El problema: el user logueado lo necesitan todos los componentes

El `NavBar` necesita saber si mostrar "Login / Signup" o el avatar. Las
páginas protegidas (`/watchlists`) necesitan saber si redirigir al login.
La `HomePage` quizás muestra distinto si sos admin.

Sin store global, terminás pasando `props` user a 5 niveles de componentes
("prop drilling"). O peor: cada componente vuelve a llamar
`GET /account/profile` por su cuenta, con N requests al backend por
montaje.

**Solución:** un **store** — un objeto compartido reactivo. Cuando alguien
modifica el estado, todos los componentes que leen ese estado se
re-renderizan.

---

## 2 · Conceptos clave

### 2.1 · Pinia vs Vuex

**Vuex** fue el state manager oficial de Vue 2. Tenía 4 conceptos:

- `state` (donde vive el dato)
- `mutations` (los únicos lugares que mutan state, deben ser síncronos)
- `actions` (lógica async que termina llamando mutations)
- `getters` (computed sobre state)

**Pinia** (Vue 3, oficial desde 2022) simplifica a 3:

- `state`
- `actions` (síncronas O async — sin distinción)
- `getters`

**No hay `mutations`.** Las actions pueden mutar state directamente. La
distinción entre "lo síncrono" y "lo async" la hace JS (con `async/await`)
sin necesidad de boilerplate.

> **¿Por qué Vuex tenía mutations entonces?** Para que los devtools de Vue
> pudieran trackear cada cambio de estado paso a paso. Pinia logró el
> mismo soporte de devtools sin la separación obligatoria — usa Proxy
> de JS para observar las mutaciones directas.

### 2.2 · Options API vs Setup API en stores

Pinia te deja escribir un store de dos formas:

**Options API (lo que vamos a usar):**

```ts
export const useFooStore = defineStore('foo', {
  state: () => ({ count: 0 }),
  getters: { doubled: (state) => state.count * 2 },
  actions: { increment() { this.count++ } },
})
```

**Setup API:**

```ts
export const useFooStore = defineStore('foo', () => {
  const count = ref(0)
  const doubled = computed(() => count.value * 2)
  function increment() { count.value++ }
  return { count, doubled, increment }
})
```

Las dos son equivalentes. La Options API tiene más estructura visual (con
secciones claras), mientras que Setup API es más libre.

**¿Cuál usar?** En este proyecto, **Options API**. Razones:

1. La estructura `state/getters/actions` mapea 1:1 con cómo razonamos
   sobre el store (state es lo que es, getters son derivados, actions son
   transiciones).
2. En `actions` usás `this.foo` para acceder al state — más natural si
   venís de OOP.
3. En Setup API, tenés que recordar `.value` para acceder a refs y
   `return` todo al final.

### 2.3 · Persistencia: ¿qué se guarda y dónde?

El `user` (objeto con email, role, etc.) **no necesita persistirse**. Si
refrescás la página, lo volvemos a traer del backend con
`GET /account/profile`.

El `token`, sí. Si el user cierra la pestaña y la vuelve a abrir, no
queremos pedirle el password de nuevo. El token tiene que sobrevivir al
refresh.

Tres opciones de persistencia client-side:

| Mecanismo | Capacidad | Pros | Contras |
| --- | --- | --- | --- |
| **`localStorage`** | ~5MB por origin | Simple API síncrona, persiste indefinidamente | Accesible desde JS (vulnerable a XSS) |
| **`sessionStorage`** | ~5MB | Simple, se borra al cerrar la pestaña | No sobrevive al cierre del browser |
| **Cookies HttpOnly** | ~4KB por cookie | Inaccesible desde JS (a salvo de XSS) | Requiere setup del backend para setearlas; CSRF concerns |

Para este proyecto **usamos `localStorage`**. Razones:

1. **Simpleza:** API síncrona, no requiere cambios en el backend.
2. **El backend usa Bearer tokens** (no session cookies). Pasarlo a
   HttpOnly cookies sería un cambio mayor del modelo de auth.
3. **El riesgo de XSS** existe pero es manejable: nuestro proyecto no
   inyecta HTML del usuario sin sanitizar (Vue lo sanitiza por defecto
   con `{{ ... }}`), no usamos `v-html` con contenido user-provided.

**Cuándo migrarías a HttpOnly:**

- Si tu app maneja datos sensibles tipo healthcare, banking, gov.
- Si tenés que cumplir con compliance específico (HIPAA, PCI-DSS).
- Si tu backend ya usa session cookies y querés homogeneizar.

### 2.4 · Por qué `localStorage` para el interceptor y Pinia para los componentes

Recordá del doc 04: el interceptor de axios lee el token desde
`localStorage` directamente, no desde Pinia.

```ts
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)   // ← NO usa Pinia
  ...
})
```

¿Por qué? Porque si el interceptor importara `useAuthStore`, tendríamos:

```
api/client.ts → import useAuthStore → stores/auth.ts → import authApi → api/auth.ts → import client → api/client.ts (loop!)
```

Una dependencia circular. JS/TS puede tolerarlas a veces, pero rompe en
los casos sutiles. **Solución cero-fricción: `localStorage` como fuente
de verdad sincrónica.** Pinia y `localStorage` se mantienen en sync
manualmente (en los métodos `setSession` y `clear` del store).

### 2.5 · Reactivity en Pinia

Cuando hacés `auth.user = { ... }` en una action, **Pinia detecta el
cambio** (vía Proxy) y todos los componentes que leen `auth.user` se
re-renderizan. Lo mismo si usas `auth.user.email = 'foo'` (mutación profunda).

Los **getters** son `computed`s bajo el capó — se recalculan solo cuando
cambian sus dependencias.

```ts
getters: {
  isAdmin: (state) => state.user?.role === 'admin',
}
```

Esto se re-evalúa solo si `state.user` cambia. Si pinia detectara que
`state.user.role` cambió a `'admin'`, `isAdmin` cambia a `true` y la UI
se actualiza.

### 2.6 · `setSession` y `clear`: el contrato del store

Patrones que vamos a respetar:

- **`setSession(token, user)`**: única manera de poner un user logueado.
  Setea state Y `localStorage` en una sola operación. Si te olvidás de
  alguno, hay drift entre Pinia y localStorage.
- **`clear()`**: única manera de desloguear. Limpia state Y
  `localStorage` Y memoria.

Nunca hagas `auth.token = newToken` directo desde fuera del store. Si lo
hacés, te olvidás del `localStorage.setItem` y se pierde al refrescar.

---

## 3 · Implementación paso a paso

### Paso 1 — Instalar Pinia y montarlo

Pinia ya está instalado desde el doc 01. Solo falta montarlo en `main.ts`:

**Archivo a modificar:** `src/main.ts`

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './assets/base.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
```

**Por qué `createPinia()`** y no usar Pinia directamente: cada
instancia es independiente (útil para SSR y para tests con stores
limpios). En una app SPA hay una sola, pero el patrón se preserva.

### Paso 2 — Definir el store de auth

**Archivo nuevo:** `src/stores/auth.ts`

```ts
import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import type { AuthUser } from '@/api/types'

const TOKEN_KEY = 'reviewhub_token'

interface AuthState {
  token: string | null
  user: AuthUser | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
  }),

  getters: {
    isAuthenticated: (state) => state.token !== null,
    isAdmin: (state) => state.user?.role === 'admin',
  },

  actions: {
    async signup(email: string, password: string, fullName?: string) {
      const { token, user } = await authApi.signup({
        email,
        password,
        passwordConfirmation: password,
        fullName,
      })
      this.setSession(token, user)
    },

    async login(email: string, password: string) {
      const { token, user } = await authApi.login({ email, password })
      this.setSession(token, user)
    },

    async logout() {
      try {
        await authApi.logout()
      } catch {
        // ignore; clear local state regardless
      }
      this.clear()
    },

    async refreshProfile() {
      this.user = await authApi.profile()
    },

    setSession(token: string, user: AuthUser) {
      this.token = token
      this.user = user
      localStorage.setItem(TOKEN_KEY, token)
    },

    clear() {
      this.token = null
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
```

**Líneas clave explicadas:**

- **`defineStore('auth', { ... })`** — el primer argumento es un **ID
  único**. Sirve para devtools y para usar el store desde fuera de
  componentes (`useAuthStore()` resuelve por ese id).

- **`state: (): AuthState => ({...})`** — es una **función** que retorna
  el estado inicial. Importante: NO un objeto literal. Cada instancia del
  store tiene su propio state (relevante en SSR / tests).

- **`token: localStorage.getItem(TOKEN_KEY)`** — al crear el store,
  intentamos rehidratar el token desde localStorage. Si no había, queda
  `null`. Si había, ya estamos "autenticados" (al menos según el
  cliente — el server todavía no lo validó).

- **`user: null`** — no rehidratamos el user. El user vive en memoria; si
  refrescás la página, lo volvemos a pedir.

- **Getters como funciones que reciben `state`** — la API arrow function
  permite inferir el tipo de `state` desde la `state()` de arriba. Si
  usaras `function() { this.token }` también podrías, pero perdés
  type inference.

- **`isAuthenticated: (state) => state.token !== null`** — es un
  computed. Si el token cambia, este getter se invalida y los
  componentes que lo leen re-renderizan.

- **`isAdmin: (state) => state.user?.role === 'admin'`** — el `?.` es
  optional chaining; si `user` es null, devuelve `undefined`, que es
  falsy. Equivalente a `state.user && state.user.role === 'admin'`.

- **`actions.signup` retorna `Promise<void>`** — la action es async, pero
  no necesitamos retornar el `{ token, user }`. Los components usan el
  store después de awaitar el signup.

- **`this.setSession(token, user)`** — desde una action, accedés al
  resto del store con `this`. Pinia transforma las arrow functions a
  bound methods.

- **`logout()`** primero intenta avisarle al backend con
  `authApi.logout()` (que invalida el token server-side). Si falla (red
  caída, server reiniciado), lo ignoramos y limpiamos localmente igual.
  El user querría salir, no que vuelva a un estado autenticado por un
  error de red.

- **`refreshProfile`** — útil al bootstrap (paso 4). Llama
  `GET /account/profile` con el token actual y guarda el user.

### Paso 3 — Reflejar el store en el `main.ts` bootstrap

**Archivo a modificar:** `src/main.ts`

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './assets/base.css'
import App from './App.vue'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
app.use(createPinia())

const auth = useAuthStore()
if (auth.token) {
  auth.refreshProfile().catch(() => auth.clear())
}

app.mount('#app')
```

**Por qué este orden importa:**

1. **`createApp(App)`** + **`app.use(createPinia())`** — registramos
   Pinia en la app. Sin esto, `useAuthStore()` lanza error
   ("[🍍]: getActivePinia() was called but there was no active Pinia").

2. **`const auth = useAuthStore()`** — instanciamos el store. Su `state()`
   corre y rehidrata el token desde localStorage.

3. **`if (auth.token)`** — si encontramos un token, probamos si todavía
   sirve llamando `/account/profile`.

4. **`auth.refreshProfile().catch(() => auth.clear())`** — si la llamada
   falla (token inválido, server reiniciado), el catch limpia todo
   localmente. **Nota:** el interceptor de axios ya redirige a `/login`
   en caso de 401, pero el `.catch` acá garantiza que el store quede
   sincronizado aun si el interceptor falla.

5. **`app.mount('#app')`** — al final. Mientras tanto, los componentes
   ven `auth.token` (truthy) pero `auth.user = null`. Es un estado
   transitorio breve.

> **Refinamiento opcional:** si querés evitar el "flash" de estado
> inconsistente, podés awaitar `refreshProfile()` antes de mount.
> Trade-off: el primer paint se retrasa por una request al backend.
> Para este proyecto está OK como está.

### Paso 4 — Usar el store en un componente

**Archivo a modificar:** `src/App.vue` (temporal — vamos a reemplazarlo en
doc 06 cuando arme el router):

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import BaseButton from '@/components/ui/BaseButton.vue'

const auth = useAuthStore()

async function fakeLogin() {
  try {
    await auth.login('admin@reviewhub.local', 'Admin1234')
  } catch (e) {
    console.error('login failed', e)
  }
}

async function fakeLogout() {
  await auth.logout()
}
</script>

<template>
  <div class="min-h-screen bg-surface">
    <main class="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Auth store test</h1>

      <pre class="rounded-md border border-outline bg-surface-subtle p-4 text-xs">
isAuthenticated: {{ auth.isAuthenticated }}
isAdmin:         {{ auth.isAdmin }}
token:           {{ auth.token?.slice(0, 20) ?? 'null' }}…
user.email:      {{ auth.user?.email ?? 'null' }}
user.role:       {{ auth.user?.role ?? 'null' }}
      </pre>

      <div class="flex gap-2">
        <BaseButton v-if="!auth.isAuthenticated" @click="fakeLogin">
          Login con admin@reviewhub.local
        </BaseButton>
        <BaseButton v-else variant="secondary" @click="fakeLogout">
          Logout
        </BaseButton>
      </div>
    </main>
  </div>
</template>
```

> **Reactividad en templates:** `auth.isAuthenticated` en el template es
> reactivo automáticamente. Vue ve que estás leyendo de un store reactivo
> y suscribe el componente a sus cambios.
>
> **Reactividad en script:** si querés leer `auth.token` en una función,
> es reactivo dentro de `computed(() => auth.token)` o si lo accedés
> dentro de un `watchEffect`. Si lo guardás en una variable local fuera
> de `computed`, capturás el valor en ese momento y perdés la
> reactividad.

### Paso 5 — Smoke test

Asegurate de tener un usuario admin creado en el backend. Si no lo tenés,
desde el repo del backend:

```powershell
node ace make:admin admin@reviewhub.local
```

Después en el frontend, click "Login con admin@reviewhub.local". El `<pre>`
debería cambiar a:

```
isAuthenticated: true
isAdmin:         true
token:           eyJhbGciOiJIUzI1NiIsInR5cCI...
user.email:      admin@reviewhub.local
user.role:       admin
```

**Refrescá la página.** El `pre` mantiene `isAuthenticated: true` porque
el token persistió en localStorage y `refreshProfile()` recargó el user.

Click "Logout" — vuelve a `null`/`false`/`null`. Refrescá: sigue
deslogueado. Listo.

---

## 4 · Verificación

1. **Localstorage tiene `reviewhub_token`** después de login (DevTools →
   Application → Local Storage).
2. **Refresh mantiene la sesión.**
3. **El header `Authorization: Bearer ...`** aparece en cada request
   (DevTools → Network → Headers de cualquier request a `/api/v1/*`).
4. **Borrar el token de localStorage a mano + refresh** → vuelve a
   estado deslogueado.
5. **Modificar el token a basura en localStorage + refresh** →
   `refreshProfile()` falla con 401 → el interceptor de axios redirige
   a `/login` (aunque hoy `/login` no exista todavía).

---

## 5 · Errores comunes

### "getActivePinia() was called but there was no active Pinia"

Llamaste `useAuthStore()` antes de `app.use(createPinia())`. Verificá que
los `.use(createPinia())` esté ANTES de cualquier instanciación de stores
en `main.ts`.

### El componente no se re-renderiza al cambiar el state

Verificá que estás leyendo del store, no de una variable local. Por
ejemplo:

```ts
const auth = useAuthStore()
const isLoggedIn = auth.isAuthenticated   // ← capturado, NO reactivo

const isLoggedIn = computed(() => auth.isAuthenticated)   // ← reactivo
```

En templates esto no es problema (Vue suscribe automáticamente). En
script, hay que usar `computed` o `storeToRefs(store)`.

### "Cannot read property 'role' of null" cuando renderizo `auth.user.role`

Usá optional chaining: `auth.user?.role`. Mientras `refreshProfile()` está
en curso, `auth.user` puede ser `null` aunque el token esté seteado.

### Hay drift entre Pinia y localStorage

Te olvidaste de actualizar uno de los dos en un action custom. Regla: solo
`setSession` y `clear` modifican el token, y siempre actualizan los dos a
la vez. Si necesitás otra mutación, agregala como método del store, no
externamente.

---

## 6 · Recap

Lo que hicimos:

- Instalamos y montamos Pinia en `main.ts`.
- Creamos el `auth` store con **Options API** (state/getters/actions).
- Persistimos el token en `localStorage` y rehidrátamos en `state()`.
- Definimos getters reactivos (`isAuthenticated`, `isAdmin`) que los
  componentes consumen.
- Implementamos `signup`, `login`, `logout`, `refreshProfile`,
  `setSession`, `clear` como actions — todas async donde aplica.
- Hicimos el bootstrap en `main.ts`: si hay token al cargar, traemos el
  profile; si falla, limpiamos todo.
- Probamos el flujo end-to-end con un `App.vue` temporal.

**Próximo doc:** [06 — Vue Router 4 y guards](06-router-y-guards.md). Vamos
a definir las rutas, hacer lazy loading de componentes, y armar los
guards `guest` / `requiresAuth` / `requiresAdmin` que protegen lo que
corresponde.
