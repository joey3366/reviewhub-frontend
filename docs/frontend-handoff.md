# Frontend handoff — ReviewHub Vue 3 client

> **Para quién es este documento:** la próxima sesión que vaya a arrancar
> el frontend. Vivís en `Nueva carpeta\Proyect\` (backend AdonisJS). El
> frontend va a vivir o en `frontend/` adentro de este repo, o en
> `Nueva carpeta\frontend\` al lado, según lo que elijas en §3.
>
> Este doc es self-contained — leelo de punta a punta y tenés contexto
> completo del backend para arrancar el frontend sin necesidad de
> mirar otros archivos (aunque tenerlos a mano ayuda).

---

## 0 · Estado actual del backend (lo que vas a consumir)

**Repo:** `C:\Users\Valentina\Desktop\Nueva carpeta\Proyect`
**Stack:** AdonisJS 6 + Lucid (ORM) + MySQL en Docker (puerto **3307**)
**Tag actual:** `v0.10.0-admin` (35 endpoints REST)
**API base path:** `http://localhost:3333/api/v1`
**Auth scheme:** Bearer tokens (Adonis access_tokens). El token se devuelve en `data.token` al hacer signup/login. Se manda en el header `Authorization: Bearer <token>`.

**Para levantar el backend en dev:**

```bash
docker compose up -d      # arranca MySQL en localhost:3307
npm run dev               # node ace serve --hmr en localhost:3333
```

**Variables de entorno del backend que importan al frontend:**

- `CORS_ORIGIN` — allowlist comma-separated. Si está vacío en dev, es wildcard (acepta todo). En prod debe tener tu URL del frontend.
- `APP_URL` — URL pública del backend.

### Los 35 endpoints disponibles

| Método | Ruta                                          | Auth   | Qué hace                                                                           |
| ------ | --------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| POST   | `/auth/signup`                                | —      | Crea user + devuelve `{token, user}`                                               |
| POST   | `/auth/login`                                 | —      | Login con email+password → `{token, user}`                                         |
| POST   | `/account/logout`                             | ✅     | Revoca el token actual                                                             |
| GET    | `/account/profile`                            | ✅     | Devuelve el user actual                                                            |
| GET    | `/contents`                                   | —      | Listado público (paginated, `?genre=`, `?sort=recent\|top`)                        |
| GET    | `/contents/:slug`                             | —      | Detalle de un content                                                              |
| POST   | `/movies`                                     | 👑     | Crear movie (admin only)                                                           |
| POST   | `/series`                                     | 👑     | Crear series (admin only)                                                          |
| GET    | `/genres`                                     | —      | Lista 12 géneros                                                                   |
| GET    | `/contents/:slug/reviews`                     | —      | Reviews paginadas de un content (`?sort=recent\|top`)                              |
| GET    | `/users/:id/reviews`                          | —      | Reviews paginadas de un user                                                       |
| POST   | `/contents/:slug/reviews`                     | ✅     | Crear review (unique por user+content)                                             |
| PATCH  | `/reviews/:id`                                | ✅     | Editar mi review                                                                   |
| DELETE | `/reviews/:id`                                | ✅     | Borrar mi review (admin: borra cualquiera)                                         |
| POST   | `/watchlists`                                 | ✅     | Crear watchlist `{name, isPublic?}`                                                |
| GET    | `/watchlists`                                 | ✅     | Mis watchlists (con itemsCount)                                                    |
| GET    | `/watchlists/:id`                             | silent | 200 si owner o `is_public`, else 404                                               |
| PATCH  | `/watchlists/:id`                             | ✅     | Editar (solo owner)                                                                |
| DELETE | `/watchlists/:id`                             | ✅     | Borrar (cascade items)                                                             |
| POST   | `/watchlists/:id/items`                       | ✅     | Agregar `{contentId, durationSeconds?, episodesWatched?, startedAt?, finishedAt?}` |
| PATCH  | `/watchlists/:id/items/:itemId`               | ✅     | Editar item                                                                        |
| DELETE | `/watchlists/:id/items/:itemId`               | ✅     | Quitar item                                                                        |
| GET    | `/account/pace-settings`                      | ✅     | Mi ritmo (404 si no configurado)                                                   |
| PATCH  | `/account/pace-settings`                      | ✅     | Upsert `{dailyMinutes?, dailyEpisodes?, skipWeekdays?}`                            |
| GET    | `/account/holidays`                           | ✅     | Mis feriados                                                                       |
| POST   | `/account/holidays`                           | ✅     | Agregar `{date, name?}`                                                            |
| DELETE | `/account/holidays/:date`                     | ✅     | Eliminar (date en yyyy-MM-dd)                                                      |
| GET    | `/watchlists/:id/items/:itemId/forecast`      | silent | `?startDate=` + overrides opcionales                                               |
| GET    | `/watchlists/:id/items/:itemId/retrospective` | silent | Compara real vs esperado                                                           |
| GET    | `/admin/users`                                | 👑     | Paginated `?role=`, `?search=`                                                     |
| GET    | `/admin/users/:id`                            | 👑     | Detalle con counts                                                                 |
| PATCH  | `/admin/users/:id/role`                       | 👑     | `{role: 'user'\|'admin'}` (no auto-mod → 403)                                      |
| GET    | `/admin/reviews`                              | 👑     | Todas las reviews paginadas                                                        |
| GET    | `/admin/watchlists`                           | 👑     | Todas las watchlists (incluso privadas)                                            |

**Leyenda:**

- — sin auth
- ✅ requiere `Authorization: Bearer <token>`
- 👑 requiere auth + `role === 'admin'`
- silent = silent auth (responde diferente con o sin token, sin tirar 401)

### Status codes que vas a ver

| Status | Cuándo                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------ |
| 200    | OK con body                                                                                            |
| 201    | OK + created                                                                                           |
| 204    | OK sin body (DELETEs)                                                                                  |
| 400    | Body mal formado                                                                                       |
| 401    | Token ausente o inválido (NO en silent auth)                                                           |
| 403    | Auth ok pero permiso denegado                                                                          |
| 404    | No existe (o no es visible para vos en recursos privados)                                              |
| 409    | Conflicto (duplicate review por user+content, duplicate item en watchlist, etc.)                       |
| 422    | Validation error de Vine (body inválido) o regla de negocio (date range invertido, all-7 skipWeekdays) |
| 429    | Rate limit en `/auth/signup` y `/auth/login` (5 por minuto)                                            |

### Convención de respuestas

**Single resource:**

```json
{ "data": { ...fields } }
```

**Paginated list:**

```json
{
  "data": [{...}, {...}],
  "meta": {
    "total": 156,
    "perPage": 20,
    "currentPage": 1,
    "lastPage": 8,
    "firstPage": 1
  }
}
```

**Error:**

```json
{ "errors": [{ "message": "..." }] }
```

o

```json
{ "message": "..." }
```

Inconsistencia leve histórica — el frontend debería leer ambos.

---

## 1 · Stack recomendado

| Pieza      | Elección                                       | Por qué                                                                                                                            |
| ---------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | **Vue 3** (`<script setup>` + Composition API) | Lo que querías originalmente. Reactivo, simple, gran ecosistema.                                                                   |
| Build      | **Vite**                                       | Dev server instantáneo, HMR, defaults sanos.                                                                                       |
| Lenguaje   | **TypeScript**                                 | Tipa las respuestas de la API; cazás bugs al cambiar shape.                                                                        |
| Estado     | **Pinia**                                      | Sucesor oficial de Vuex, mucho más simple. Stores como composables.                                                                |
| Router     | **Vue Router 4**                               | Estándar de facto.                                                                                                                 |
| HTTP       | **axios**                                      | Interceptors limpios, recibe/parsea JSON automático, errores estructurados. Alternativa: `fetch` nativo (más código, menos magia). |
| Styling    | **Tailwind CSS** (opcional)                    | Si querés diseñar rápido. Alternativa: CSS plain + módulos Vue.                                                                    |
| Validación | **Vee-Validate** o validación a mano           | Para forms que reflejen las reglas de Vine del backend.                                                                            |

> **Sobre el cliente "tuyau" del backend:** el repo del backend genera
> automáticamente un cliente TypeScript tipado en
> `.adonisjs/client/registry/`. Podrías importarlo en el frontend si los
> dos proyectos viven en el mismo monorepo (`package.json` ya lo expone
> via `exports.["./registry"]`). Pero usar tuyau implica configurar el
> client + plugin Vite + entender el modelo de routes/schemas. **Para
> aprender, recomiendo axios con tipos a mano.** Tuyau queda para
> después si querés simplificar.

---

## 2 · Mapping de features → endpoints → pages

### Públicas (sin login)

| Página                     | Endpoints                                             | Notas                                                                                             |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Home / catálogo**        | `GET /contents?page&genre&sort` + `GET /genres`       | Listado de movies/series. Filtro por genre (chips), sort dropdown (recientes vs top), paginación. |
| **Content detail**         | `GET /contents/:slug` + `GET /contents/:slug/reviews` | Show poster, sinopsis, géneros, rating promedio, reviews list.                                    |
| **User profile (público)** | `GET /users/:id/reviews`                              | Si querés perfiles públicos. Opcional MVP.                                                        |
| **Login**                  | `POST /auth/login`                                    | Guarda token + redirige.                                                                          |
| **Signup**                 | `POST /auth/signup`                                   | Idem.                                                                                             |

### Autenticadas (cualquier user)

| Página                       | Endpoints                                               | Notas                                                                                        |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Mi cuenta**                | `GET /account/profile`                                  | Datos básicos del user.                                                                      |
| **Crear review**             | `POST /contents/:slug/reviews`                          | Form modal o página, validación 1≤rating≤10, title 3-200, body 10-10000.                     |
| **Editar review**            | `PATCH /reviews/:id`                                    | Mismo form.                                                                                  |
| **Mis watchlists**           | `GET /watchlists`                                       | Lista con `itemsCount`. CTA "crear nueva".                                                   |
| **Crear watchlist**          | `POST /watchlists`                                      | Form con name + toggle público.                                                              |
| **Watchlist detail**         | `GET /watchlists/:id`                                   | Lista de items, `totalDurationFormatted`, botón "agregar item" que busca contents.           |
| **Agregar item**             | `POST /watchlists/:id/items`                            | Modal que busca content por slug o navega desde catálogo.                                    |
| **Editar item**              | `PATCH /watchlists/:id/items/:itemId`                   | Editar duration, episodes, dates.                                                            |
| **Mi ritmo**                 | `GET/PATCH /account/pace-settings`                      | Form con dailyMinutes, dailyEpisodes, checkboxes para weekdays.                              |
| **Mis feriados**             | `GET/POST/DELETE /account/holidays`                     | Tabla con date + name + acciones.                                                            |
| **Forecast de un item**      | `GET /watchlists/:id/items/:itemId/forecast?startDate=` | Form con date picker. Display: "termina el 2026-06-09 después de 2 días saltando 1 domingo". |
| **Retrospective de un item** | `GET /watchlists/:id/items/:itemId/retrospective`       | Cards: actualValidDays vs expectedDays, badge onPace.                                        |

### Solo admin

| Página                    | Endpoints                                                    | Notas                                                   |
| ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| **Admin dashboard**       | varios                                                       | Layout aparte. Solo visible si `user.role === 'admin'`. |
| **Users management**      | `GET /admin/users` + filtros + `PATCH /admin/users/:id/role` | Tabla paginada.                                         |
| **Reviews moderation**    | `GET /admin/reviews` + `DELETE /reviews/:id`                 | Tabla con preview del body, botón delete.               |
| **Watchlists moderation** | `GET /admin/watchlists`                                      | Read-only por ahora.                                    |
| **Crear content**         | `POST /movies` o `POST /series`                              | Formulario con campos del catálogo.                     |

---

## 3 · Decisión: ¿monorepo o repo separado?

### Opción A — Monorepo (carpeta `frontend/` dentro del repo backend)

```
Nueva carpeta\Proyect\
├── app/                     ← backend
├── config/
├── ...
├── frontend/                ← Vue app
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
└── package.json             ← backend
```

**Pros:**

- Un solo `git clone` para todo.
- El frontend puede importar `data.d.ts` del backend directamente (tipos compartidos sin publicar paquete).
- Más fácil orquestar dev: `concurrently "npm run dev" "cd frontend && npm run dev"`.

**Contras:**

- Dos `package.json` separados (uno arriba, otro en `frontend/`).
- Si después querés CI/CD separado por servicio, hay que distinguir.

### Opción B — Carpetas hermanas

```
Nueva carpeta\
├── Proyect\                 ← backend (este repo)
└── frontend\                ← nuevo repo Vue
```

**Pros:**

- Separación total — cada uno tiene su git, su CI, su deploy.
- Más limpio si pensás liberar el backend como servicio público.

**Contras:**

- Para compartir tipos hay que publicar un paquete o copiar a mano.
- Dos clones, dos deploys.

**Mi recomendación: Opción A (monorepo, carpeta `frontend/`).** Estás
aprendiendo; tener todo a la vista ayuda. Migrar a B después es
trivial: `git subtree split` o copiar la carpeta a un repo nuevo.

---

## 4 · Setup inicial (asumiendo opción A)

```bash
# Desde Nueva carpeta\Proyect\
npm create vite@latest frontend -- --template vue-ts
cd frontend
npm install
npm install vue-router pinia axios
npm install -D @types/node

# Opcional: Tailwind
npm install -D tailwindcss@latest postcss autoprefixer
npx tailwindcss init -p
```

**Estructura sugerida adentro de `frontend/src/`:**

```
src/
├── main.ts                  ← bootstrap app + router + pinia
├── App.vue                  ← layout raíz (nav + <RouterView/>)
├── api/
│   ├── client.ts            ← instancia axios con interceptors
│   ├── auth.ts              ← signup, login, logout, profile
│   ├── content.ts           ← contents, movies, series, genres
│   ├── reviews.ts
│   ├── watchlists.ts
│   ├── playback.ts          ← pace-settings, holidays, forecast, retrospective
│   ├── admin.ts
│   └── types.ts             ← shapes de respuestas del backend
├── stores/
│   ├── auth.ts              ← Pinia: user + token + actions
│   ├── content.ts
│   ├── watchlists.ts
│   └── ...
├── router/
│   └── index.ts             ← routes + guards
├── pages/
│   ├── HomePage.vue
│   ├── ContentDetailPage.vue
│   ├── LoginPage.vue
│   ├── SignupPage.vue
│   ├── MyWatchlistsPage.vue
│   ├── WatchlistDetailPage.vue
│   ├── PaceSettingsPage.vue
│   ├── HolidaysPage.vue
│   ├── ForecastPage.vue
│   └── admin/
│       ├── DashboardPage.vue
│       ├── UsersPage.vue
│       └── ReviewsPage.vue
├── components/
│   ├── NavBar.vue
│   ├── ContentCard.vue
│   ├── ReviewItem.vue
│   ├── WatchlistItem.vue
│   ├── PaginationControls.vue
│   ├── RatingStars.vue
│   └── ...
├── composables/
│   ├── useAuth.ts
│   ├── useForm.ts
│   └── ...
└── utils/
    ├── formatSeconds.ts     ← portear el helper del backend (HH:MM:SS)
    └── formatDate.ts
```

---

## 5 · Setup CORS (backend) y env (frontend)

### Backend — agregar el origen del frontend

Editar `.env` del backend:

```
CORS_ORIGIN=http://localhost:5173
```

(Vite usa 5173 por default. Si Vite te asigna otro puerto, ajustá.)

Para múltiples orígenes en prod:

```
CORS_ORIGIN=https://reviewhub.app,https://staging.reviewhub.app
```

Reiniciar el backend después de cambiar `.env`.

### Frontend — `.env` del frontend

`frontend/.env.development`:

```
VITE_API_BASE_URL=http://localhost:3333/api/v1
```

`frontend/.env.production`:

```
VITE_API_BASE_URL=https://api.reviewhub.app/api/v1
```

Vite expone solo las que empiezan con `VITE_`.

---

## 6 · El cliente axios — `api/client.ts`

```ts
import axios, { type AxiosError } from 'axios'
import { useAuthStore } from '@/stores/auth'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Inject Bearer token into every request
client.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

// On 401, clear auth state and redirect to login
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const auth = useAuthStore()
      auth.clear()
      // window.location.href = '/login'  ← o usá router.push si tenés el router
    }
    return Promise.reject(error)
  }
)

export default client
```

---

## 7 · Tipos de la API — `api/types.ts`

Declaración manual (recomendada para aprender). Una alternativa más
mágica: importar de `#client/data` del backend si estás en monorepo,
pero requiere config en Vite.

```ts
// Auth
export interface AuthUser {
  id: string
  email: string
  fullName: string | null
  role: 'user' | 'admin'
  initials: string
  createdAt: string
  updatedAt: string | null
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

// Pagination meta
export interface PaginationMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage: number
}

// Content
export interface Genre {
  id: string
  slug: string
  name: string
}

export interface Content {
  id: string
  type: 'movie' | 'series'
  slug: string
  title: string
  originalTitle: string | null
  synopsis: string | null
  releaseYear: number | null
  posterUrl: string | null
  backdropUrl: string | null
  avgRating: number | null
  reviewCount: number
  genres: Genre[]
  movie?: {
    id: string
    runtimeMinutes: number | null
    director: string | null
    country: string | null
  }
  series?: {
    id: string
    seasonsCount: number | null
    episodesCount: number | null
    broadcastStatus: string
  }
  createdAt: string
}

// Review
export interface Review {
  id: string
  contentId: string
  rating: number
  title: string
  body: string
  createdAt: string
  updatedAt: string | null
  user?: { id: string; fullName: string | null; initials: string }
  content?: Pick<Content, 'id' | 'slug' | 'title' | 'type'>
}

// Watchlist
export interface WatchlistItem {
  id: string
  watchlistId: string
  contentId: string
  durationSeconds: number
  durationFormatted: string
  episodesWatched: number | null
  startedAt: string | null
  finishedAt: string | null
  daysElapsed: number | null
  avgDaysPerEpisode: number | null
  content?: {
    id: string
    slug: string
    title: string
    type: 'movie' | 'series'
    posterUrl: string | null
  }
  createdAt: string
}

export interface Watchlist {
  id: string
  name: string
  isPublic: boolean
  userId: string
  itemsCount?: number
  items?: WatchlistItem[]
  totalDurationSeconds?: number
  totalDurationFormatted?: string
  createdAt: string
  updatedAt: string | null
}

// Playback
export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface PaceSettings {
  dailyMinutes: number | null
  dailyEpisodes: number | null
  skipWeekdays: Weekday[]
  updatedAt: string | null
}

export interface Holiday {
  date: string
  name: string | null
}

export interface ForecastResult {
  mode: 'time' | 'episodes'
  requiredDays: number
  startDate: string
  finishDate: string
  skippedDays: number
  totalCalendarDays: number
  pace: {
    dailyMinutes: number | null
    dailyEpisodes: number | null
    skipWeekdays: Weekday[]
    skipHolidays: boolean
  }
}

export interface RetrospectiveResult {
  mode: 'time' | 'episodes'
  startedAt: string
  finishedAt: string
  expectedDays: number
  actualValidDays: number
  actualSkippedDays: number
  actualCalendarDays: number
  deviationDays: number
  toleranceDays: number
  onPace: boolean
  pace: ForecastResult['pace']
}

// Admin
export interface AdminUser extends AuthUser {
  reviewsCount?: number
  watchlistsCount?: number
}

export interface AdminWatchlist {
  id: string
  name: string
  isPublic: boolean
  itemsCount: number
  owner: { id: string; email: string; fullName: string | null }
  createdAt: string
  updatedAt: string | null
}
```

> **Nota:** las fechas vienen como **strings ISO 8601** desde el backend
> (Luxon las serializa). Si querés `Date` en el frontend, convertí en el
> consumo. Para watchlist items, `startedAt`/`finishedAt` vienen como
> `"2026-04-01"` (sin hora).

---

## 8 · Auth store con Pinia — `stores/auth.ts`

```ts
import { defineStore } from 'pinia'
import client from '@/api/client'
import type { AuthUser } from '@/api/types'

const TOKEN_KEY = 'reviewhub_token'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) as string | null,
    user: null as AuthUser | null,
  }),
  getters: {
    isAuthenticated: (s) => s.token !== null,
    isAdmin: (s) => s.user?.role === 'admin',
  },
  actions: {
    async signup(email: string, password: string, fullName: string) {
      const { data } = await client.post('/auth/signup', {
        email,
        password,
        passwordConfirmation: password,
        fullName,
      })
      this.setSession(data.data.token, data.data.user)
    },
    async login(email: string, password: string) {
      const { data } = await client.post('/auth/login', { email, password })
      this.setSession(data.data.token, data.data.user)
    },
    async logout() {
      try {
        await client.post('/account/logout')
      } catch {}
      this.clear()
    },
    async refreshProfile() {
      const { data } = await client.get('/account/profile')
      this.user = data.data
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

**Bootstrap del store en `main.ts`:**

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// Si hay token guardado, refrescá el user antes de montar
const auth = useAuthStore()
if (auth.token) {
  auth.refreshProfile().catch(() => auth.clear())
}

app.mount('#app')
```

---

## 9 · Router con guards — `router/index.ts`

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('@/pages/HomePage.vue') },
  { path: '/login', component: () => import('@/pages/LoginPage.vue'), meta: { guest: true } },
  { path: '/signup', component: () => import('@/pages/SignupPage.vue'), meta: { guest: true } },
  { path: '/contents/:slug', component: () => import('@/pages/ContentDetailPage.vue') },
  {
    path: '/watchlists',
    component: () => import('@/pages/MyWatchlistsPage.vue'),
    meta: { requiresAuth: true },
  },
  { path: '/watchlists/:id', component: () => import('@/pages/WatchlistDetailPage.vue') },
  {
    path: '/account/pace-settings',
    component: () => import('@/pages/PaceSettingsPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/account/holidays',
    component: () => import('@/pages/HolidaysPage.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin',
    component: () => import('@/pages/admin/DashboardPage.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/users',
    component: () => import('@/pages/admin/UsersPage.vue'),
    meta: { requiresAdmin: true },
  },
  {
    path: '/admin/reviews',
    component: () => import('@/pages/admin/ReviewsPage.vue'),
    meta: { requiresAdmin: true },
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
  if (to.meta.requiresAdmin && !auth.isAdmin) return '/'
  if (to.meta.guest && auth.isAuthenticated) return '/'
})

export default router
```

---

## 10 · Módulos de API — patrón estable

Ejemplo `api/watchlists.ts`:

```ts
import client from './client'
import type { Watchlist, WatchlistItem } from './types'

export const watchlistsApi = {
  listMine: async () => {
    const { data } = await client.get<{ data: Watchlist[] }>('/watchlists')
    return data.data
  },
  show: async (id: string) => {
    const { data } = await client.get<{ data: Watchlist }>(`/watchlists/${id}`)
    return data.data
  },
  create: async (input: { name: string; isPublic?: boolean }) => {
    const { data } = await client.post<{ data: Watchlist }>('/watchlists', input)
    return data.data
  },
  update: async (id: string, input: { name?: string; isPublic?: boolean }) => {
    const { data } = await client.patch<{ data: Watchlist }>(`/watchlists/${id}`, input)
    return data.data
  },
  destroy: async (id: string) => {
    await client.delete(`/watchlists/${id}`)
  },
  addItem: async (
    id: string,
    input: {
      contentId: string
      durationSeconds?: number
      episodesWatched?: number | null
      startedAt?: string | null
      finishedAt?: string | null
    }
  ) => {
    const { data } = await client.post<{ data: WatchlistItem }>(`/watchlists/${id}/items`, input)
    return data.data
  },
  updateItem: async (
    id: string,
    itemId: string,
    input: Partial<{
      durationSeconds: number
      episodesWatched: number | null
      startedAt: string | null
      finishedAt: string | null
    }>
  ) => {
    const { data } = await client.patch<{ data: WatchlistItem }>(
      `/watchlists/${id}/items/${itemId}`,
      input
    )
    return data.data
  },
  removeItem: async (id: string, itemId: string) => {
    await client.delete(`/watchlists/${id}/items/${itemId}`)
  },
}
```

Replicá el patrón para `auth`, `content`, `reviews`, `playback`, `admin`.

---

## 11 · Manejo de errores 422 (validation)

Cuando el backend rechaza un body, devuelve:

```json
{
  "errors": [
    { "message": "The email field is required", "rule": "required", "field": "email" },
    { "message": "The rating must be a number", "rule": "number", "field": "rating" }
  ]
}
```

Helper para transformar a un map `{ field: message }`:

```ts
export function extractFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error)) return {}
  const errs = error.response?.data?.errors
  if (!Array.isArray(errs)) return {}
  return Object.fromEntries(errs.filter((e) => e.field).map((e) => [e.field, e.message]))
}
```

Usalo en componentes:

```ts
const fieldErrors = ref<Record<string, string>>({})

async function submit() {
  try {
    await reviewsApi.create(slug, form.value)
  } catch (e) {
    fieldErrors.value = extractFieldErrors(e)
  }
}
```

Y en el template:

```html
<input v-model="form.title" />
<p v-if="fieldErrors.title" class="text-red-500">{{ fieldErrors.title }}</p>
```

---

## 12 · Reglas de validación para replicar en el frontend

Para feedback inmediato sin esperar al server:

| Campo                         | Regla                              |
| ----------------------------- | ---------------------------------- |
| `email`                       | required, formato email            |
| `password`                    | required, min 8 chars              |
| `fullName`                    | optional, max 255                  |
| Review `rating`               | required, integer 1-10             |
| Review `title`                | required, 3-200 chars              |
| Review `body`                 | required, 10-10000 chars           |
| Watchlist `name`              | required, 3-120 chars              |
| Item `durationSeconds`        | integer >= 0                       |
| Item `episodesWatched`        | integer >= 0 o null                |
| Item `startedAt`/`finishedAt` | yyyy-MM-dd; startedAt ≤ finishedAt |
| Pace `dailyMinutes`           | integer 1-1440 o null              |
| Pace `dailyEpisodes`          | integer 1-100 o null               |
| Pace `skipWeekdays`           | array, no puede tener los 7        |
| Holiday `date`                | yyyy-MM-dd                         |
| Holiday `name`                | optional, 1-120 chars              |

---

## 13 · Componentes clave que te van a salvar

### `PaginationControls.vue`

Recibe `meta` del backend y emite `update:page`. Reusable en todos los listados.

### `RatingStars.vue`

Display + edit de rating 1-10. Pasale `:value` y `@update:value`.

### `WatchlistDurationDisplay.vue`

Llamá `formatSeconds(item.durationSeconds)` y mostrá `2:30:00`. El helper:

```ts
export function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
```

(Idéntico al del backend en `app/modules/watchlists/utils/duration.ts`.)

### `ForecastForm.vue`

Date picker para `startDate` + opcional overrides de pace. Llama
`GET /watchlists/:id/items/:itemId/forecast` y muestra el resultado.

### `RetrospectiveCard.vue`

Llama `GET .../retrospective`, muestra `actualValidDays vs expectedDays`
con badge `onPace`. Si el item no tiene fechas, deshabilitá y mostrá
"agregá fechas para ver retrospective".

### `AdminGuard.vue` (HOC pattern)

Wrapper que solo renderea su slot si `auth.isAdmin`. Para esconder
botones admin del navbar.

---

## 14 · Plan de implementación sugerido (orden)

Si arrancás de cero, este orden te da algo usable rápido y vas
agregando complejidad:

1. **Setup + layout básico**: NavBar, RouterView, HomePage placeholder. (1h)
2. **Auth flow completo**: signup, login, logout, profile, persistir token, interceptor 401. Validar contra `/account/profile`. (2-3h)
3. **Catálogo**: HomePage con `GET /contents`, paginación, sort, filter por genre. Card con poster + rating. (2-3h)
4. **Content detail**: page con sinopsis + géneros + reviews list. (1-2h)
5. **Reviews CRUD**: crear, editar, borrar mi review. Manejo de 409 (duplicate). (2-3h)
6. **Watchlists CRUD**: lista, crear, detail, agregar items, editar items. (3-4h)
7. **Playback features**: pace-settings page, holidays page, forecast/retrospective UI. (2-3h)
8. **Admin dashboard**: users list + role mutation + reviews moderation + watchlists view. (2-3h)
9. **Polish**: loading states, empty states, error toasts, responsive design. (open)

**Total realista**: 15-25h de trabajo enfocado para algo presentable.

---

## 15 · Build + deploy del frontend

```bash
cd frontend
npm run build           # genera dist/
```

`dist/` es estático puro (HTML + JS + CSS). Subir a cualquier static host:

- **Cloudflare Pages** — gratis ilimitado, HTTPS automático, CDN global.
- **Vercel** — gratis con límites generosos.
- **Netlify** — gratis con límites razonables.
- **GitHub Pages** — gratis, solo si el repo es público.

Más detalles en `docs/deployment-options.md`.

---

## 16 · Cosas que NO te recomiendo hacer al arrancar

- **No empieces con tuyau** — extra setup, magia, debug más difícil
  cuando algo falla. Axios primero, tuyau después si simplifica.
- **No intentes SSR / Nuxt** — Adonis ya es backend; sumar Nuxt sería
  otro server. SPA con Vite es suficiente.
- **No mezcles axios y fetch** — elegí uno.
- **No guardes el token en cookies sin `HttpOnly`** — si lo hacés sin
  HttpOnly, no ganás nada vs localStorage. Para HttpOnly el backend
  tendría que setear cookies (cambio mayor en auth).
- **No hagas componentes God** — separá NavBar, ContentCard,
  ReviewItem desde el día uno.
- **No persistas todo el store** — `pinia-plugin-persistedstate` es
  fácil de abusar. Por ahora solo el token (manual con localStorage).
- **No copies todas las shapes del backend** — copiá solo lo que
  consumís. Si después agregás un campo, lo agregás al type.
- **No te preocupes por accesibilidad / i18n al principio** — primero
  que funcione end-to-end.

---

## 17 · Checklist para arrancar la próxima sesión

Cuando arranques:

- [ ] Backend levantado (`docker compose up -d && npm run dev` en `Proyect/`)
- [ ] CORS configurado para `http://localhost:5173` en `.env` del backend
- [ ] Decidiste opción A (monorepo) o B (carpetas hermanas)
- [ ] Ejecutaste `npm create vite@latest frontend -- --template vue-ts`
- [ ] Instalaste vue-router, pinia, axios
- [ ] Decidiste si usás Tailwind o CSS plano
- [ ] Tenés a mano este doc + el doc 14 del backend (`docs/learning/14-roles-y-autorizacion.md`) si querés repasar cómo funciona el auth en el server

**Primer prompt sugerido para la nueva sesión:**

> "Estoy en `C:\Users\Valentina\Desktop\Nueva carpeta\Proyect`. Leé
> `docs/frontend-handoff.md` completo. Mi plan: arrancar el frontend
> Vue 3 con la opción A (monorepo, carpeta `frontend/`). Empezá por el
> setup inicial + auth flow (pasos 1 y 2 del orden sugerido). Antes
> de tocar archivos mostrame el plan."

---

> **Última cosa:** este doc es snapshot del 2026-05-12. Si después
> agregamos endpoints nuevos (ban users, comentarios, audit log), el
> mapping de §0 queda desactualizado. Para la verdad viva, mirá
> `start/routes.ts` del backend o corré `node ace list:routes`.
