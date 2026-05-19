# 06 — Vue Router 4 y guards

> **Pre-requisitos:** doc 05 (auth store con `isAuthenticated` e `isAdmin`
> funcionando). Vamos a usar el store para decidir si dejar pasar a cada
> ruta.
>
> **Objetivo:** definir el sistema de routing del frontend: rutas con
> **lazy loading**, **guards** para `guest` / `requiresAuth` /
> `requiresAdmin`, y manejo del `redirect` después del login. Al final,
> un click en `<RouterLink to="/admin">` con un user no-admin va a
> redirigir a `/` automáticamente, y un click en `/login` siendo ya admin
> también va a `/`.

Al terminar este doc vas a entender:

- La diferencia entre **`createWebHistory`** (URLs limpias) y
  **`createWebHashHistory`** (con `#`), y cuándo elegir cada una.
- Cómo funciona el **lazy loading** de rutas (`() => import('@/pages/...')`)
  y qué hace Vite con esos imports en build.
- Qué es el objeto **`meta`** de las rutas y por qué es el lugar correcto
  para flags como `guest` o `requiresAuth`.
- Cómo escribir un **`beforeEach`** guard que sea expresivo, mantenible,
  y no se rompa con edge cases (rutas con `redirect` query, rutas que no
  declaran meta, etc.).
- Por qué `<RouterLink>` es mejor que un `<a href>` para navegación
  interna.
- Cómo manejar el **redirect después del login** (`?redirect=/watchlists`).

---

## 1 · El problema: SPAs no recargan la página

Una app Vue es **una sola página HTML**. Toda la "navegación" entre
secciones es JS cambiando lo que se renderiza, sin recargas. Necesitamos:

- Un mecanismo para **mapear URL → componente** (cuál mostrar para `/login`,
  `/watchlists/123`, etc.).
- Que el **botón "atrás" del browser funcione** sin recargar la página.
- **Protección de rutas:** si un user no logueado intenta `/watchlists`,
  redirigirlo a `/login`.
- **Mantenibilidad:** poder cambiar `auth.isAuthenticated` y que **todas
  las rutas protegidas** lo respeten sin tener que pegar el check en cada
  componente.

Vue Router 4 es la respuesta oficial.

---

## 2 · Conceptos clave

### 2.1 · `createWebHistory` vs `createWebHashHistory`

Hay dos modos de "URL":

**`createWebHistory`** (lo que vamos a usar):

```
https://reviewhub.app/watchlists/123
```

URLs limpias. Requiere que el server devuelva `index.html` para cualquier
ruta no encontrada (sino refresh en `/watchlists/123` da 404). Soportado
en Vite dev por defecto, y en hosts modernos (Cloudflare Pages, Vercel,
Netlify) automáticamente.

**`createWebHashHistory`:**

```
https://reviewhub.app/#/watchlists/123
```

El `#` separa lo que el server ve (`/`) de lo que el JS ve (`/watchlists/123`).
Funciona en cualquier server estático sin config especial. Pros: zero
config. Contras: las URLs feas, peor SEO.

**¿Cuándo hash?** Solo si vas a desplegar en algo medieval (Apache sin
mod_rewrite, GitHub Pages con limitaciones de rewrite). Para Cloudflare /
Vercel / Netlify, history mode siempre.

### 2.2 · Lazy loading de componentes

Si importás todos los componentes de página al arranque:

```ts
import HomePage from '@/pages/HomePage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import WatchlistsPage from '@/pages/WatchlistsPage.vue'
// ... 20 más

const routes = [
  { path: '/', component: HomePage },
  { path: '/login', component: LoginPage },
  // ...
]
```

Vite los mete todos en el bundle inicial. Cuanto más páginas, más pesa el
JS que el browser tiene que parsear antes de mostrar la home.

**Solución: lazy loading.**

```ts
const routes = [
  { path: '/', component: () => import('@/pages/HomePage.vue') },
  { path: '/login', component: () => import('@/pages/LoginPage.vue') },
]
```

Vite ve los `() => import(...)` como **dynamic imports** y los empaqueta
en **chunks separados**. El bundle inicial es chico; cuando el user
navega a `/login`, Vite descarga el chunk de `LoginPage` on-demand.

> **¿Y la latencia del fetch del chunk?** Casi nula. Vite ya tiene el
> chunk listo en el `<head>` con un `<link rel="modulepreload">` cuando
> sabe que es probable que se use.

### 2.3 · El objeto `meta` de las rutas

Cada ruta puede tener un campo `meta` con datos arbitrarios:

```ts
{
  path: '/login',
  component: () => import('@/pages/LoginPage.vue'),
  meta: { guest: true },
}
```

`meta` es legible desde los guards y desde los componentes. Es el lugar
correcto para **declarar características** de cada ruta:

- `meta.guest: true` → solo accesible sin sesión.
- `meta.requiresAuth: true` → solo accesible con sesión.
- `meta.requiresAdmin: true` → además, role admin.
- `meta.title: 'Mi cuenta'` → para setear `<title>` automáticamente.

La filosofía: las rutas se declaran data-first, los guards consumen esos
datos. Si mañana agregás 20 rutas con `requiresAuth: true`, no tocás el
guard — el guard ya las cubre.

### 2.4 · `beforeEach` guard global

`router.beforeEach(callback)` registra una función que corre **antes de
cada navegación**. Decide qué hacer:

- **Devolver `true` o nada (`undefined`)** — la navegación procede.
- **Devolver un objeto/string de ruta** — redirige a esa ruta.
- **Devolver `false`** — cancela la navegación (rara vez se usa).

```ts
router.beforeEach((to, from) => {
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login' }
  }
  // Sino, pasa
})
```

Vue Router espera el resultado (puede ser async) antes de renderizar el
componente.

### 2.5 · `<RouterLink>` vs `<a href>`

```vue
<a href="/login">Login</a>             ❌ recarga la página
<RouterLink to="/login">Login</RouterLink>  ✅ navegación SPA
```

`<RouterLink>` renderiza un `<a>` con los handlers correctos para
interceptar el click, prevenir el reload del browser, y delegar al
router. Además agrega clases automáticas (`router-link-active`) que podés
estilar.

### 2.6 · Redirect query param después del login

UX típica: si un user no logueado pidió `/watchlists`, lo mandamos a
`/login?redirect=/watchlists`. Cuando se loguea, lo devolvemos a
`/watchlists`.

Patrón:

```ts
// En el guard:
return { path: '/login', query: { redirect: to.fullPath } }

// En el LoginPage:
const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
router.push(redirect)
```

> **Cuidado:** validá que `redirect` sea una ruta interna de tu app. Si
> aceptás `?redirect=https://evil.com`, un atacante podría usar esa
> URL en un email para phishing (usuario hace login real → es enviado a
> evil.com). Para el ejemplo de este proyecto, asumimos que solo se
> usan paths internos.

---

## 3 · Implementación paso a paso

### Paso 1 — Crear los componentes de página vacíos (placeholders)

Antes de armar el router necesitamos páginas a las cuales rutear. Para el
doc 06 alcanza con placeholders.

**Archivo nuevo:** `src/pages/HomePage.vue`

```vue
<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Home</h1>
  </div>
</template>
```

**Archivo nuevo:** `src/pages/LoginPage.vue`

```vue
<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Login</h1>
  </div>
</template>
```

**Archivo nuevo:** `src/pages/SignupPage.vue`

```vue
<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-ink">Signup</h1>
  </div>
</template>
```

En el doc 07 los rellenamos con la lógica real.

### Paso 2 — Definir las rutas

**Archivo nuevo:** `src/router/index.ts`

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/LoginPage.vue'),
    meta: { guest: true },
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('@/pages/SignupPage.vue'),
    meta: { guest: true },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.guest && auth.isAuthenticated) return { path: '/' }
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) return { path: '/' }
})

export default router
```

**Líneas clave explicadas:**

- **`RouteRecordRaw[]`** — el tipo del array de rutas. Te ayuda el
  autocompletado en VSCode.

- **`name: 'home'`** — opcional pero útil. Permite navegar con
  `router.push({ name: 'home' })` en vez de path string, y si en el
  futuro cambias el path (`'/'` → `'/catalogo'`), no rompés referencias.

- **`component: () => import('@/pages/HomePage.vue')`** — lazy loading.

- **`meta: { guest: true }`** — bandera leída por el guard.

- **`createWebHistory()`** — sin argumento, asume base `'/'`. Si tu app
  va a vivir en `https://example.com/reviewhub/`, pasás
  `createWebHistory('/reviewhub/')`.

- **`scrollBehavior() { return { top: 0 } }`** — al navegar entre rutas,
  scrollea al tope. Sin esto, el browser intenta mantener la posición de
  scroll, lo que es raro al cambiar de página completa.

- **El guard global** corre antes de cada navegación. Lee `auth`
  fresco de Pinia (sin cachear en variable de módulo). Las condiciones
  son ordenadas: primero "ya logueado intentando entrar a guest",
  después "no logueado intentando algo que requiere auth", después "no
  admin intentando admin". El primero que matchea redirige.

- **`return undefined`** implícito al final (no hay `return`). Vue Router
  interpreta eso como "navegación permitida, seguí".

### Paso 3 — Montar el router en `main.ts`

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
import router from './router'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)

const auth = useAuthStore()
if (auth.token) {
  auth.refreshProfile().catch(() => auth.clear())
}

app.mount('#app')
```

Diferencia clave con el doc 05: agregamos `app.use(router)` después de
`createPinia()`.

**¿Importa el orden?** Sí. El router puede acceder al store (vía
`useAuthStore()` en el guard), pero el store debe estar registrado
**antes** o se rompe.

### Paso 4 — Actualizar `App.vue` para usar `<RouterView>`

**Archivo a modificar:** `src/App.vue`

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
import NavBar from '@/components/layout/NavBar.vue'
</script>

<template>
  <div class="min-h-screen bg-surface">
    <NavBar />
    <main class="mx-auto max-w-7xl px-6 py-10">
      <RouterView />
    </main>
  </div>
</template>
```

**Pieza por pieza:**

- **`<RouterView />`** — el "agujero" donde el router inyecta el
  componente que matchea la ruta actual.
- **`<NavBar />`** — va FUERA del RouterView porque es persistent entre
  rutas (no se vuelve a montar en cada navegación).
- **`max-w-7xl mx-auto px-6 py-10`** — container centrado de ancho máximo
  fijo. El NavBar usa el mismo `max-w-7xl` adentro para que se alineen.

### Paso 5 — Crear el NavBar con `<RouterLink>`

**Archivo nuevo:** `src/components/layout/NavBar.vue`

```vue
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
  <header class="sticky top-0 z-40 border-b border-outline bg-surface/95 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
      <RouterLink to="/" class="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
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
```

**Decisiones notables:**

- **`sticky top-0 z-40`** — el header queda fijo al hacer scroll.
- **`bg-surface/95 backdrop-blur`** — fondo translúcido con blur. Linear
  / Vercel usan este patrón para que el contenido se "vea" debajo del
  header al scrollear, sin solaparse incómodo.
- **`active-class="text-ink"`** — Vue Router agrega esta clase al
  `<RouterLink>` que matchea la ruta actual. Hacemos que el texto se
  vea negro fuerte vs el gris de los inactivos.
- **`md:flex hidden`** — los links del centro solo aparecen en
  pantallas medianas+ (≥768px). En mobile, ocultos (para mantener el
  header limpio). Para mobile completo armarías un menú hamburguesa,
  que dejamos para otra sesión.
- **`router.push('/')`** después de logout — UX cómoda. Si estabas en
  una página protegida, no querés que el guard te tire un redirect feo.

### Paso 6 — Probar el routing y los guards

1. **`http://localhost:5174`** → ves "Home".
2. **Click "Crear cuenta"** → vas a `/signup`, ves "Signup".
3. **Click "Iniciar sesión"** → vas a `/login`, ves "Login".
4. **Probar el guest guard:** hacé un login válido desde DevTools console:

   ```js
   const { useAuthStore } = await import('/src/stores/auth.ts')
   const auth = useAuthStore()
   await auth.login('admin@reviewhub.local', 'Admin1234')
   ```

5. **Click "Iniciar sesión" otra vez** → el guard te redirige automático
   a `/` (porque `meta.guest && auth.isAuthenticated`).
6. **Click "Salir"** en el NavBar → quedás sin sesión, "Iniciar sesión"
   te vuelve a dejar entrar.

---

## 4 · Verificación

1. **URLs limpias:** `localhost:5174/login` muestra el LoginPage, sin
   `#` en la URL.
2. **Lazy loading:** abrir DevTools → Network → JS. Al cargar la home,
   solo aparece el chunk principal. Al navegar a `/login`, aparece un
   chunk nuevo (típicamente `LoginPage-XXX.js`).
3. **Back button funciona:** click "Login", click "Signup", botón "atrás"
   del browser → vuelve a Login. Otro "atrás" → vuelve a Home. Otro →
   sale de la app.
4. **Guard funciona:** estando logueado, escribir `localhost:5174/login`
   en la URL → automáticamente te lleva a `/`.

---

## 5 · Errores comunes

### "Page not found" cuando refresco

Estás usando `createWebHistory` y el server no está sirviendo `index.html`
para rutas SPA. Solución:

- **En dev:** Vite lo hace por defecto. Si pasa en dev es bug.
- **En producción:** depende del host. Para Cloudflare Pages / Vercel,
  funciona out of the box. Para Apache/nginx custom, agregás una rewrite
  rule.

### `<RouterLink>` no aplica `active-class`

Vue Router usa **matching parcial** por defecto: `to="/"` matchea todas
las rutas porque todas empiezan con `/`. Para matching estricto:

```vue
<RouterLink to="/" active-class="text-ink" exact-active-class="..." />
```

O agregás `:strict="true"` si querés exactitud total.

### "Cannot read properties of undefined (reading 'meta')"

El guard intenta leer `to.meta.foo` pero `to.meta` es `undefined`. Si tu
TS está configurado loose, esto pasa silencioso. Solución: definir
default en el guard:

```ts
const meta = to.meta || {}
if (meta.requiresAuth ...) { ... }
```

O, mejor, no declarar rutas sin `meta` y dejar que Vue Router lo inicialice
en `{}`.

### El guard se ejecuta dos veces

Pasa cuando el `beforeEach` retorna una redirección. Vue Router corre
el guard una vez para la ruta original (devuelve redirect), y otra vez
para la ruta destino. Es esperado — no es bug.

---

## 6 · Recap

Lo que hicimos:

- Creamos placeholders de `HomePage`, `LoginPage`, `SignupPage` en
  `src/pages/`.
- Definimos `src/router/index.ts` con `createWebHistory`, rutas
  **lazy-loaded** (chunks separados), y `meta` flags para `guest`.
- Implementamos el guard global con tres reglas (`guest`,
  `requiresAuth`, `requiresAdmin`) ordenadas, que leen `auth` del store.
- Soportamos el patrón `?redirect=/path` para volver al destino original
  después del login.
- Montamos el router en `main.ts` y reemplazamos `App.vue` con
  `<NavBar />` + `<RouterView />`.
- Hicimos el NavBar con `<RouterLink>` reactivo al auth store, con
  `active-class` para resaltar la sección activa.

**Próximo doc:** [07 — Pages y forms](07-pages-y-forms.md). Rellenamos los
placeholders: `HomePage` con loading/error/empty states + paginación,
`LoginPage` y `SignupPage` con manejo de 422 (field errors) y 429
(rate limit).
