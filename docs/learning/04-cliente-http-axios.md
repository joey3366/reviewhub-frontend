# 04 — Cliente HTTP con axios + CORS

> **Pre-requisitos:** docs 01-03. El frontend está scaffolded, con design
> system y componentes base, pero todavía no llamó al backend. Asumimos
> que el backend AdonisJS está corriendo en `http://localhost:3333` con
> CORS configurado.
>
> **Objetivo:** crear una capa HTTP reutilizable. Al final, vas a tener:
> una instancia `axios` central, interceptors que inyectan el Bearer
> token, manejo automático de 401, tipos TypeScript de las respuestas, y
> helpers para extraer errores de validación 422. También vas a entender
> CORS lo suficiente como para no asustarte cuando el browser te tire un
> "blocked by CORS policy".

Al terminar este doc vas a entender:

- Cómo funciona **same-origin policy** del browser y qué es **CORS**.
- Por qué para `Authorization: Bearer …` el browser manda un **preflight
  OPTIONS** y qué hace el server para autorizarlo.
- La diferencia entre **`cors.origin: '*'`**, allowlist específica, y
  cuándo `credentials: true` cambia las reglas.
- Por qué tener **una sola instancia axios** vale más que importar
  `axios` directo en cada módulo.
- Cómo funcionan **interceptors de request y response** y dónde meter el
  token / manejar el 401.
- Qué son las **`import.meta.env.VITE_*`** vars y por qué solo las que
  empiezan con `VITE_` son visibles en el cliente.
- Cómo desestructurar respuestas paginadas (`{ data, meta }`) y respuestas
  de error 422 del backend (`{ errors: [{ field, message }] }`).

---

## 1 · El problema: el browser no deja al JS hacer lo que quiere

Si en una página servida por `http://localhost:5174` hacés:

```js
fetch('http://localhost:3333/api/v1/contents')
```

El browser **prohíbe la respuesta** por defecto. Aunque el server
responda OK, tu JS ve un error genérico de tipo "Failed to fetch" y la
consola dice algo así:

```
Access to fetch at 'http://localhost:3333/api/v1/contents' from origin
'http://localhost:5174' has been blocked by CORS policy: No
'Access-Control-Allow-Origin' header is present on the requested resource.
```

Esto **no es un bug** — es el browser haciendo su trabajo de seguridad.

---

## 2 · Conceptos clave: CORS desde el lado del browser

### 2.1 · Same-origin policy

Por defecto, JS en una página solo puede hacer requests al **mismo origin**
que sirvió la página. "Origin" = protocolo + host + puerto. Estos son
**orígenes distintos**:

- `http://localhost:5174` vs `http://localhost:3333` (puerto distinto)
- `http://localhost:5174` vs `https://localhost:5174` (protocolo distinto)
- `https://app.foo.com` vs `https://api.foo.com` (host distinto)

Sin esto, cualquier página que visitás podría hacerle requests autenticados
a `gmail.com` con tus cookies y leer tu inbox. Same-origin es la primera
defensa contra eso.

### 2.2 · Qué es CORS

CORS (Cross-Origin Resource Sharing) es un mecanismo para que un server
explícitamente diga: "**este otro origin puede pedirme cosas**".

El server lo dice con headers de respuesta:

```
Access-Control-Allow-Origin: http://localhost:5174
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Authorization
```

El browser ve esos headers y permite la lectura del response. Si no
están, bloquea.

### 2.3 · Preflight: OPTIONS antes del request real

Para requests "simples" (GET/POST sin headers custom), el browser manda
el request directo. Para requests "complejos" (PUT/PATCH/DELETE, o
cualquier request con header `Authorization`), el browser primero manda
un **preflight OPTIONS**:

```
OPTIONS /api/v1/contents HTTP/1.1
Origin: http://localhost:5174
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Authorization, Content-Type
```

El server tiene que responder OK con los headers `Access-Control-Allow-*`.
Si todo cuadra, el browser entonces hace el request real.

Esto pasa **automáticamente** — no programás el OPTIONS. Pero si ves un
error de CORS en DevTools y un OPTIONS rojo, sabés que el preflight
falló.

### 2.4 · `credentials: true` cambia las reglas

Si necesitás que el browser mande **cookies o headers de autorización**,
hay condiciones extras:

1. El server debe responder con `Access-Control-Allow-Credentials: true`.
2. El server **no puede** responder con `Access-Control-Allow-Origin: *`
   — debe ser un origin específico.
3. El cliente debe configurar `withCredentials: true` en su request.

Para nuestro caso, **usamos Bearer tokens en header (no cookies)**, así
que técnicamente `credentials` no aplicaría. Pero el backend lo deja en
`true` por flexibilidad futura, y nosotros NO ponemos `withCredentials` en
axios.

### 2.5 · Por qué una instancia axios y no `axios.get(...)` directo

Cada vez que escribís:

```ts
import axios from 'axios'
axios.get('http://localhost:3333/api/v1/contents', {
  headers: { Authorization: 'Bearer ' + token },
})
```

estás repitiendo el `baseURL` y los headers en N lugares.

**Solución:** crear **una instancia con `axios.create({...})`** que ya
tiene la `baseURL`, los headers default, y los interceptors. Después
importás esa instancia (`import client from '@/api/client'`) y llamás
`client.get('/contents')` — corto y consistente.

### 2.6 · Interceptors

Una instancia axios permite registrar funciones que corren
**automáticamente antes de cada request o después de cada response**.

```
request → interceptor request → server → interceptor response → tu código
```

Casos típicos:

| Interceptor | Para qué |
| --- | --- |
| **Request** | Inyectar `Authorization: Bearer <token>` |
| **Request** | Loggear cada request en dev |
| **Response** | Catchear 401 globalmente y redirigir a `/login` |
| **Response** | Catchear 5xx y mostrar un toast genérico |

Sin interceptors, repetís ese código en cada llamada.

### 2.7 · `import.meta.env.VITE_*`

Vite expone variables de entorno al código del cliente, **pero solo las
que empiezan con `VITE_`**. Por seguridad: no querés que un `DB_PASSWORD`
o `JWT_SECRET` accidentalmente termine en el bundle del browser.

`.env.development`:

```
VITE_API_BASE_URL=http://localhost:3333/api/v1
```

Y en código:

```ts
const baseURL = import.meta.env.VITE_API_BASE_URL
```

Vite las **inyecta en tiempo de build**, así que cambiar `.env.development`
requiere reiniciar `npm run dev`.

> **Otros archivos `.env`:** `.env`, `.env.local`, `.env.production`. Vite
> los carga según el modo. `.env.local` está en `.gitignore` (no se
> commitea) y sobrescribe el resto — útil para secretos locales o overrides
> de cada developer.

---

## 3 · Implementación paso a paso

### Paso 1 — Configurar la env var del cliente

**Archivo nuevo:** `.env.development`

```
VITE_API_BASE_URL=http://localhost:3333/api/v1
```

Cuando deployees a producción, vas a crear `.env.production` con la URL
real de tu API.

### Paso 2 — Configurar el backend para aceptar el origin del frontend

En el backend, editá `.env` y agregá / descomentá:

```
CORS_ORIGIN=http://localhost:5174
```

Si tu frontend está en otro puerto, ajustá. Si tenés varios entornos:

```
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

**Reiniciar el backend** (`Ctrl+C` + `npm run dev`) para que tome el
cambio.

> **¿Por qué no `*` (wildcard) en dev?** Porque cuando salgas a prod
> querés ser específico, y es mejor descubrir errores de CORS en dev que
> tener `*` "funcionando" y dejar de funcionar al ser estrictos en prod.
> Mismo origin → mismo comportamiento → menos sorpresas.

### Paso 3 — Definir los tipos de respuesta del backend

**Archivo nuevo:** `src/api/types.ts`

```ts
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

export interface PaginationMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage: number
}

export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}

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
```

**Decisiones notables:**

- **Fechas como `string`, no `Date`.** El backend envía ISO 8601 strings
  (`"2026-05-19T12:34:56.000Z"`). JS los parsea con `new Date(str)` cuando
  hace falta, pero en transit son strings. Tiparlos como `string` evita
  conversiones implícitas.
- **`avgRating: number | null`** — el backend devuelve `null` cuando un
  content no tiene reviews. TS te obliga a manejar el null al renderizar.
- **`Paginated<T>` genérico** — lo usamos para listings paginados de
  cualquier resource (contents, reviews, etc.). Una sola interfaz, mil
  usos.
- **`movie?` / `series?`** opcionales — un Content es movie XOR series; el
  backend devuelve solo uno de los dos.

### Paso 4 — Crear la instancia axios con interceptors

**Archivo nuevo:** `src/api/client.ts`

```ts
import axios, { type AxiosError } from 'axios'

const TOKEN_KEY = 'reviewhub_token'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const wasAuthenticated = !!localStorage.getItem(TOKEN_KEY)
      localStorage.removeItem(TOKEN_KEY)
      const pathname = window.location.pathname
      if (wasAuthenticated && pathname !== '/login' && pathname !== '/signup') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
```

**Líneas clave explicadas:**

- **`axios.create({...})`** — crea una instancia independiente. Si en
  otro lugar hacés `import axios from 'axios'` y usás `axios.get(...)`,
  esa llamada NO pasa por estos interceptors. Por eso siempre importamos
  `client` (nuestra instancia) en lugar de `axios` raw.

- **`baseURL: import.meta.env.VITE_API_BASE_URL`** — Vite reemplaza esto
  en build con el string del `.env`. Si después de buildear inspeccionás
  el bundle, ves `http://localhost:3333/api/v1` literal.

- **`headers: { 'Content-Type': 'application/json' }`** — declaramos que
  mandamos JSON. Aunque axios lo agrega automático cuando el `data` es un
  objeto, ser explícito ayuda.

- **El interceptor request** lee el token desde `localStorage`. **No lo
  lee del store de Pinia** — eso causaría una dependencia circular
  (`client.ts` importa `stores/auth.ts` que importa `client.ts`).
  `localStorage` es la fuente de verdad sincrónica y siempre accesible.

- **`config.headers.Authorization = \`Bearer ${token}\``** — formato
  estándar para tokens de acceso. El backend AdonisJS lo parsea con el
  middleware `auth.use(['api'])`.

- **Interceptor response, primer parámetro `(response) => response`** —
  identidad. No hacemos nada con respuestas exitosas, las pasamos tal cual.

- **`error: AxiosError`** — tipo provisto por axios. Tiene `response`,
  `request`, `config`, `code`. Usamos `error.response?.status`.

- **`if (error.response?.status === 401)`** — solo redirigimos a /login si
  era una auth real (token expirado, inválido). 401 con token vacío en
  rutas públicas no debería pasar pero si pasara, no querríamos
  redirigir.

- **`wasAuthenticated = !!localStorage.getItem(TOKEN_KEY)`** — chequeamos
  ANTES de borrar el token, para saber si era una sesión que se cayó. Si
  no había token (user no logueado, request a recurso protegido sin
  intención), no redirigimos — el componente que pidió maneja el error.

- **`window.location.href = '/login'`** — navegación dura, no
  `router.push`. Razón: queremos que se reinicie el estado de Vue/Pinia
  por completo. Si usáramos `router.push`, el store de auth (que tiene
  `user` cargado) seguiría en memoria hasta que el guard lo limpiara.
  Más simple: hard reload.

### Paso 5 — Módulos de API por feature

En vez de tener `client.get('/contents')` desperdigado por la app, lo
encapsulamos en módulos por feature.

**Archivo nuevo:** `src/api/auth.ts`

```ts
import client from './client'
import type { AuthResponse, AuthUser } from './types'

export const authApi = {
  signup: async (input: {
    email: string
    password: string
    passwordConfirmation: string
    fullName?: string
  }) => {
    const { data } = await client.post<{ data: AuthResponse }>('/auth/signup', input)
    return data.data
  },
  login: async (input: { email: string; password: string }) => {
    const { data } = await client.post<{ data: AuthResponse }>('/auth/login', input)
    return data.data
  },
  logout: async () => {
    await client.post('/account/logout')
  },
  profile: async () => {
    const { data } = await client.get<{ data: AuthUser }>('/account/profile')
    return data.data
  },
}
```

**Archivo nuevo:** `src/api/content.ts`

```ts
import client from './client'
import type { Content, Genre, Paginated } from './types'

export interface ContentListParams {
  page?: number
  perPage?: number
  genre?: string
  sort?: 'recent' | 'top'
}

export const contentApi = {
  list: async (params: ContentListParams = {}) => {
    const { data } = await client.get<Paginated<Content>>('/contents', { params })
    return data
  },
  show: async (slug: string) => {
    const { data } = await client.get<{ data: Content }>(`/contents/${slug}`)
    return data.data
  },
  genres: async () => {
    const { data } = await client.get<{ data: Genre[] }>('/genres')
    return data.data
  },
}
```

**Patrones repetidos:**

- **`client.get<...>(...)`** — el genérico le dice a axios qué shape
  esperamos de la respuesta. TS lo propaga al `data` que destructuramos.
- **El doble `data.data`** — el backend envuelve sus respuestas en
  `{ data: <payload> }`. Axios además envuelve TODA respuesta HTTP en
  `{ data: <body>, status, headers, ... }`. Entonces `data.data` es:
  axios.data (body) → .data (envelope del backend). El primer nivel lo
  destructuramos con `const { data } = await ...`, el segundo lo
  retornamos con `data.data`. Pasajes paginated devuelven `{ data, meta }`
  desde el backend, en cuyo caso retornamos `data` completo (no
  `data.data`).
- **No envolvemos errors** — dejamos que axios rechaza la promise y el
  caller maneja con try/catch. Esto separa concerns: el API client no
  conoce los mensajes UX en español.

### Paso 6 — Helper para extraer errores 422

Cuando el backend rechaza un body con validation errors (status 422),
devuelve:

```json
{
  "errors": [
    { "message": "The email field is required", "rule": "required", "field": "email" },
    { "message": "The password must be at least 8 chars", "rule": "minLength", "field": "password" }
  ]
}
```

Útil convertir eso a un map `{ field: message }` para mostrar errores junto
a cada input.

**Archivo nuevo:** `src/utils/extractFieldErrors.ts`

```ts
import axios from 'axios'

interface FieldError {
  field?: string
  message: string
  rule?: string
}

export function extractFieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error)) return {}
  const errs = error.response?.data?.errors as FieldError[] | undefined
  if (!Array.isArray(errs)) return {}
  return Object.fromEntries(
    errs.filter((e) => e.field).map((e) => [e.field as string, e.message])
  )
}

export function extractErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Algo salió mal.'
  if (error.response?.status === 429) {
    return 'Demasiados intentos. Esperá un minuto y volvé a probar.'
  }
  const data = error.response?.data
  if (typeof data?.message === 'string') return data.message
  if (Array.isArray(data?.errors) && typeof data.errors[0]?.message === 'string') {
    return data.errors[0].message
  }
  return 'Algo salió mal. Intentá de nuevo.'
}
```

**Líneas clave:**

- **`axios.isAxiosError(error)`** — TS type guard. Confirma que el error
  viene de axios y nos da acceso a `.response.data`. Sin esto, `error` es
  `unknown` y TS no nos deja acceder a campos.
- **`error.response?.data?.errors as FieldError[] | undefined`** — usar
  `as` aquí es necesario porque axios tipa `error.response.data` como
  `any` por default. Sabemos por el contrato del backend qué shape tiene.
- **`Object.fromEntries(...)`** — convierte un array de tuplas a objeto.
  Es la forma moderna de hacer `{ [field]: message }` desde un array.
- **`extractErrorMessage`** maneja el caso "no fue un 422, fue otra cosa"
  — 429 (rate limit), 500 (server crash), etc. Devuelve un mensaje
  legible para mostrar al usuario.

### Paso 7 — Smoke test desde la consola del browser

Levantá el dev server y abrí DevTools en `http://localhost:5174`. En la
consola:

```js
const { contentApi } = await import('/src/api/content.ts')
const result = await contentApi.list()
console.log(result)
```

Si ves `{ data: [...], meta: {...} }` con la lista de contents del
backend, todo funciona. Si ves un error de CORS, revisá el paso 2.

> **Por qué con `await import`** — los módulos ES no son globales en la
> consola. `import` dinámico te los trae.

---

## 4 · Verificación

Después de los 7 pasos:

1. **`npm run dev`** levanta el frontend en `localhost:5174` sin
   errores de compilación.
2. **DevTools → Network**: cuando hacés el smoke test del Paso 7, ves un
   request **OPTIONS** a `/contents` con status 204, seguido del **GET**
   real con status 200.
3. **DevTools → Response Headers del OPTIONS**: tiene
   `Access-Control-Allow-Origin: http://localhost:5174`.
4. **Después de loguearte (lo haremos en doc 05)**, el request lleva el
   header `Authorization: Bearer eyJ...` automáticamente. Lo verificás en
   DevTools → Request Headers.
5. **Forzando un 401** (modificá el token en localStorage a basura,
   refrescá): la app debería redirigir a `/login` automáticamente. Hoy
   `/login` no existe — lo armamos en el doc 06.

---

## 5 · Errores comunes

### "CORS policy: No 'Access-Control-Allow-Origin' header is present"

El backend no está respondiendo con los headers de CORS. Causas:

1. El `CORS_ORIGIN` del `.env` no incluye tu origin (ej. está en `5173`
   pero vos corrés en `5174`).
2. No reiniciaste el backend después de cambiar `.env`.
3. El middleware de CORS no está registrado en `start/kernel.ts`.

### "Network Error" sin más detalle

Casi siempre es:

1. El backend no está corriendo. Probá `curl http://localhost:3333/api/v1/contents`
   desde otra terminal — si falla acá también, el problema no es CORS.
2. El backend devolvió un crash 500 ANTES de procesar los headers de CORS,
   entonces el browser no ve los headers y reporta "Network Error" en
   vez de un 500. Revisá los logs del backend.

### "Property 'data' does not exist on type 'unknown'"

Te olvidaste el `<T>` genérico en `client.get<T>(...)`. Sin el tipo, axios
tipa `response.data` como `any`/`unknown` y TS protesta.

### El interceptor de request no se ejecuta

Verificá que estás importando `client` (nuestra instancia) y no `axios`
directo. `axios.get(...)` no pasa por nuestros interceptors.

---

## 6 · Recap

Lo que hicimos:

- Entendimos CORS desde el lado del browser: same-origin policy,
  preflight OPTIONS, headers `Access-Control-Allow-*`.
- Configuramos el backend para aceptar `http://localhost:5174` como origin
  válido en dev.
- Definimos tipos TypeScript para todas las respuestas del backend en
  `src/api/types.ts`.
- Creamos una instancia `axios` central con interceptors de **request**
  (inyecta `Authorization`) y **response** (catchea 401 y redirige).
- Encapsulamos las llamadas en módulos por feature (`authApi`,
  `contentApi`) para no repetir `client.get(...)` con typing.
- Creamos helpers `extractFieldErrors` y `extractErrorMessage` para los
  errores 422 (validation) y 429 (rate limit).

**Próximo doc:** [05 — Estado con Pinia](05-pinia-auth-store.md). Vamos a
armar el **auth store**: dónde vive el `user`, cómo persiste el token
entre refreshes, y cómo los componentes leen "¿estoy logueado?".
