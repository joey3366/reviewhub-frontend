# Handoff — sesión frontend (2026-05-19) → próxima sesión

> **Para quién es este doc:** la próxima sesión de Claude Code (u otro
> agente) que vaya a continuar el frontend de ReviewHub. Vivís en
> `C:\Users\Valentina\Desktop\Nueva carpeta\frontend\` (este repo) y el
> backend está en `..\Proyect\` (carpeta hermana, repo separado).
>
> Leelo de punta a punta y tenés todo el contexto sin necesidad de
> reconstruir la conversación previa.

---

## 0 · Primer prompt sugerido para arrancar la nueva sesión

> "Estoy en `C:\Users\Valentina\Desktop\Nueva carpeta\frontend`. Leé
> `docs/session-2-handoff.md` completo. Después chequeá si backend y
> frontend están corriendo (`http://localhost:3333/api/v1/contents` y
> `http://localhost:5174`). Si no, levantalos. Después me decís qué
> querés que sigamos: la verification E2E pendiente, o saltar directo
> a ContentDetailPage."

---

## 1 · Estado al cierre

### Lo hecho

- **Scaffold Vite + Vue 3 + TypeScript** en `Nueva carpeta\frontend\`
  (carpeta hermana del backend, **NO monorepo**).
- **Design system editorial moderno** (Linear/Notion-like): paleta
  neutra + Inter + bordes 1px sin sombras.
- **5 componentes UI base** en `src/components/ui/`: `BaseButton`,
  `BaseInput`, `BaseSelect`, `BaseBadge`, `BaseCard`.
- **API layer** en `src/api/`: axios client + types + módulos
  `authApi` y `contentApi`.
- **Pinia auth store** (Options API) con token persistido en
  `localStorage`.
- **Vue Router 4** con lazy loading + guards (`guest`,
  `requiresAuth`, `requiresAdmin`).
- **3 pages funcionales:** HomePage (catálogo con 4 estados,
  filtros, paginación), LoginPage, SignupPage (con manejo de 422
  field errors + 429 rate limit).
- **NavBar** sticky reactivo al auth store.
- **7 learning docs** en `docs/learning/` siguiendo el formato del
  backend.
- **Backend CORS** actualizado: `CORS_ORIGIN=http://localhost:5173,http://localhost:5174`.
- **Repo GitHub creado y pusheado**:
  https://github.com/joey3366/reviewhub-frontend (público, branch
  `main`, commit inicial `9f61f82`).

### Lo pendiente

| # | Tarea | Notas |
|---|-------|-------|
| 1 | **Verification E2E** | 10 pasos en `C:\Users\Valentina\.claude\plans\robust-yawning-petal.md`. No se completaron en la sesión. |
| 2 | **ContentDetailPage** (`/contents/:slug`) | El click en cards lleva a esta ruta y hoy queda en blanco (`Vue Router warn: No match found`). Primer paso natural a continuar. |
| 3 | Reviews CRUD | `POST/PATCH/DELETE /reviews` + listing en detail. |
| 4 | Watchlists CRUD | Lista + items + management. |
| 5 | Playback features | Pace settings, holidays, forecast, retrospective. |
| 6 | Admin dashboard | Users management, reviews moderation, watchlists view. |
| 7 | Tests | Vitest + Vue Test Utils. |
| 8 | Build prod + deploy | Cloudflare Pages / Vercel para el frontend. |

---

## 2 · Estructura

### Carpetas en disco

```
Nueva carpeta\
├── Proyect\           ← backend AdonisJS 6 (tag v0.10.0-admin)
│   └── docs\learning\ ← 18 docs del backend
└── frontend\          ← este repo
    ├── docs\
    │   ├── learning\  ← 7 docs (README + 01-07)
    │   └── session-2-handoff.md   ← este archivo
    ├── src\
    │   ├── api\         (client.ts, types.ts, auth.ts, content.ts)
    │   ├── assets\      (base.css + scaffold svgs)
    │   ├── components\
    │   │   ├── ui\      (BaseButton, BaseInput, BaseSelect, BaseBadge, BaseCard)
    │   │   ├── layout\  (NavBar)
    │   │   ├── content\ (ContentCard)
    │   │   └── PaginationControls.vue
    │   ├── pages\       (HomePage, LoginPage, SignupPage)
    │   ├── router\      (index.ts)
    │   ├── stores\      (auth.ts)
    │   ├── utils\       (extractFieldErrors.ts)
    │   ├── App.vue
    │   └── main.ts
    ├── tailwind.config.js
    ├── vite.config.ts
    ├── tsconfig.app.json
    ├── package.json
    └── .env.development
```

### Repos

- **Frontend:** https://github.com/joey3366/reviewhub-frontend (público,
  commit `9f61f82`).
- **Backend:** local-only por ahora (no pusheado). El user puede subirlo
  más adelante.

---

## 3 · Stack y decisiones cerradas (no reabrir sin pedido)

| Decisión | Elección | Por qué |
|----------|----------|---------|
| Framework | **Vue 3 + `<script setup>`** | Pedido del usuario; alineado con backend AdonisJS |
| Build tool | **Vite** | Velocidad de HMR para aprender iterando |
| Lenguaje | **TypeScript** | Tipa respuestas del backend |
| State | **Pinia (Options API)** | Más estructurado que Setup API para alguien que está aprendiendo |
| Router | **Vue Router 4** + lazy loading + guards | Estándar |
| HTTP | **axios** (NO fetch, NO tuyau) | Mejor DX, interceptors limpios |
| CSS | **Tailwind v3.4** (NO v4) | v4 cambió todo el install flow; v3 es estable y bien documentado |
| Fuente | **`@fontsource/inter`** | Self-hosted, no Google Fonts CDN |
| Layout | **Opción B (carpetas hermanas)** | NO monorepo. El user lo eligió en conversación, contra la recomendación del handoff original |
| Estética | **Editorial moderno** (Linear/Notion) | Elegido por preview ASCII. Ver §5 |
| Auth storage | **`localStorage`** | Bearer tokens en header; HttpOnly cookies serían cambio mayor |
| Token en interceptor | **Lee de `localStorage` directo** | NO usa Pinia (evita dependencia circular `client→store→authApi→client`) |
| Port Vite | **5174** (locked con `strictPort`) | MorphoFront ocupa 5173 |

### Lo que NO usamos (anti-patterns para esta sesión)

- ❌ Tuyau (cliente tipado del backend AdonisJS) — más simple axios.
- ❌ Tailwind v4.
- ❌ Cookies HttpOnly para el token.
- ❌ SSR / Nuxt — SPA pura con Vite.
- ❌ `pinia-plugin-persistedstate` — el token a mano alcanza.
- ❌ `vue-i18n` ni accesibilidad fina por ahora.

---

## 4 · Cómo arrancar todo desde cero

### Pre-requisitos

- Node 20+, npm, Docker Desktop.

### Levantar el backend

```powershell
Set-Location 'C:\Users\Valentina\Desktop\Nueva carpeta\Proyect'
docker compose up -d        # MySQL en localhost:3307
npm run dev                 # Adonis en localhost:3333
```

**Verificá:** `curl http://localhost:3333/api/v1/contents` devuelve JSON.

### Levantar el frontend

```powershell
Set-Location 'C:\Users\Valentina\Desktop\Nueva carpeta\frontend'
npm run dev                 # Vite en localhost:5174 (port locked)
```

**Verificá:** abrir `http://localhost:5174` muestra el catálogo.

### Si no levanta el frontend

- **Error de port:** matá lo que esté en 5174 (`Get-NetTCPConnection
  -LocalPort 5174` para identificar). El `strictPort: true` en
  `vite.config.ts` lo obliga a fallar si está ocupado.
- **Error de deps:** `npm install` desde `frontend\`.

### Si no levanta el backend

- **Docker apagado:** abrir Docker Desktop manualmente y esperar 1-2 min.
- **CORS:** revisar que `Proyect\.env` tenga
  `CORS_ORIGIN=http://localhost:5173,http://localhost:5174`.

---

## 5 · Design system — reglas del canon

Toda UI nueva debe pasar el test "¿se ve coherente al lado de
`HomePage` / `ContentCard` / `NavBar`?"

### Tokens (en `tailwind.config.js`)

```js
colors: {
  surface: { DEFAULT: '#ffffff', subtle: '#fafafa', muted: '#f5f5f5' },
  outline: { DEFAULT: '#e5e5e5', strong: '#d4d4d4' },
  ink:     { DEFAULT: '#0a0a0a', muted: '#525252', subtle: '#a3a3a3' },
  accent:  { DEFAULT: '#2563eb', hover: '#1d4ed8', soft: '#eff6ff' },
  success: '#16a34a',
  error:   '#dc2626',
  warning: '#ca8a04',
}
fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'] }
```

### Sí

- Bordes `1px solid #e5e5e5` (`border-outline`).
- Hover sutiles (`hover:bg-surface-subtle`, `hover:opacity-95`).
- `rounded-md` (6px) en botones/inputs, `rounded-lg` (8px) en cards.
- Tracking tight en headings (`tracking-tight`).
- Inter con OpenType features (`cv02 cv03 cv04 cv11`).
- Sticky NavBar con `bg-surface/95 backdrop-blur`.

### NO

- ❌ `shadow-*` clases (sombras).
- ❌ Gradientes en backgrounds.
- ❌ Glassmorphism (transparent + heavy blur).
- ❌ Animaciones grandes (`scale-110`, transiciones > 300ms).
- ❌ Paletas vibrantes (`purple-500`, `pink-500`, etc.).

---

## 6 · Verification E2E pendiente

Los 10 pasos para confirmar que todo anda. **No se completaron** —
el usuario los iba a recorrer solo pero la sesión terminó antes.

1. **Catálogo carga** — grid de cards con poster + título + rating.
2. **Skeleton aparece** brevemente al refrescar (`Ctrl+Shift+R`).
3. **Filtro de género** — click chip → grid filtra.
4. **Sort dropdown** — cambiar → orden cambia.
5. **Click en card** — URL cambia a `/contents/<slug>` (la página queda
   en blanco; route detail no implementada todavía).
6. **Signup nuevo** — `/signup` con `test@test.com` / `Test1234` →
   redirige a `/` y aparece avatar con iniciales.
7. **Logout** — botón "Salir" → estado público + localStorage limpio.
8. **Login admin** — `/login` con `admin@reviewhub.local` /
   `Admin1234`. (Si no existe el admin, crearlo desde backend:
   `node ace make:admin admin@reviewhub.local`.)
9. **Refresh con sesión** — `F5` mantiene login.
10. **DevTools → Network** — requests llevan `Authorization: Bearer ...`
    cuando autenticado.

### Warns esperados (no son bugs)

- `[Vue Router warn]: No match found for location with path "/contents/..."`
  — click en cards. Esperado hasta que se arme ContentDetailPage.

---

## 7 · Próximos pasos sugeridos (orden)

### Inmediato: ContentDetailPage

Implementar `/contents/:slug`:

- **Endpoint:** `GET /api/v1/contents/:slug` + `GET /api/v1/contents/:slug/reviews`.
- **Patrón:** clonar el state machine de `HomePage` (loading/error/empty/content).
- **Layout sugerido:**
  - Header con poster + título + meta + géneros (chips) + rating
    grande.
  - Sinopsis.
  - Sección "Reseñas" con `<ReviewItem>` repetido + paginación.
  - CTA "Escribir reseña" si autenticado (lleva a modal o página
    aparte).
- **Componentes a crear:** `ReviewItem`, `RatingStars` (display +
  edit), `ContentDetailHeader`.
- **Doc nuevo:** `docs/learning/08-content-detail-y-reviews.md`.

### Después: Reviews CRUD

- `POST /contents/:slug/reviews`, `PATCH /reviews/:id`,
  `DELETE /reviews/:id`.
- Manejo del 409 (duplicate review por user+content).
- Reusar `extractFieldErrors` para validaciones 422.

### Después: Watchlists, Playback, Admin (orden flexible)

Ver `Proyect/docs/frontend-handoff.md` §14 para el plan completo.

---

## 8 · Gotchas conocidos

### Privacidad: rutas absolutas en docs

Los docs `01-decisiones-y-scaffold.md` y otros mencionan
`C:\Users\Valentina\Desktop\Nueva carpeta\...` en ejemplos de comandos.
**El repo es público en GitHub**, así que el primer nombre "Valentina"
queda visible. Opciones:

- Dejarlo (no es info sensible).
- Editar para usar placeholders genéricos (`<tu-carpeta>\frontend\`).
- Reescribir historia (más invasivo).

### Token vs Pinia: orden de lectura

El interceptor de axios lee `localStorage.getItem('reviewhub_token')`
**directo**, no usa el Pinia store. Es a propósito — evita dep
circular. Si necesitás modificar el flow de auth, mantené esa
separación o vas a tener un dolor de cabeza.

### Vite port locked

`vite.config.ts` tiene `port: 5174, strictPort: true`. Si está
ocupado, Vite falla en vez de saltar a 5175. Es deliberado para no
romper CORS silenciosamente.

### MorphoFront ocupa 5173

Es otro proyecto del usuario en
`Nueva carpeta\MorphoFront\`. Si querés correrlo en paralelo,
funciona porque CORS del backend de ReviewHub acepta ambos puertos.
Si MorphoFront no está corriendo, igual mantenemos 5174 — la
configuración no cambia.

### `src/style.css` y `HelloWorld.vue` huérfanos

Los dejó el scaffold de Vite. No se importan en ningún lado pero
están en el repo. Limpiar es opcional.

### Refresh con sesión expirada

Si el token está en localStorage pero el backend ya no lo reconoce
(server reiniciado, token expirado), el flow es:

1. `main.ts` llama `auth.refreshProfile()`.
2. Backend responde 401.
3. Interceptor de axios detecta el 401, borra el token de
   localStorage, hace `window.location.href = '/login'` (hard redirect).
4. Página recarga, `auth.token` ya es null, va a `/login` limpio.

No es bug — es lo correcto.

---

## 9 · Docs ya escritos en `docs/learning/`

| Archivo | Tema | Líneas approx |
|---------|------|---------------|
| `README.md` | Índice + cómo usar los docs | 50 |
| `01-decisiones-y-scaffold.md` | Stack, Opción B, scaffolding Vite | 280 |
| `02-design-system-tailwind.md` | Tokens, extend vs replace, Inter, base.css | 320 |
| `03-componentes-ui-base.md` | Base* patterns, props TS, v-model custom | 360 |
| `04-cliente-http-axios.md` | axios + interceptors + CORS + 422 helper | 420 |
| `05-pinia-auth-store.md` | Pinia Options API + localStorage + circular dep | 350 |
| `06-router-y-guards.md` | vue-router 4 + lazy + guards + redirect | 370 |
| `07-pages-y-forms.md` | HomePage states + Login/Signup 422/429 | 480 |

**Estilo:** copia del backend (`Proyect/docs/learning/14-...md`):
pre-requisitos → objetivo → conceptos clave → implementación
paso a paso → verificación → errores comunes → recap. Tutorial
replicable desde cero.

**Próximos docs a escribir** (cuando se agreguen las pages):

- `08-content-detail-y-reviews.md`
- `09-watchlists-y-items.md`
- `10-playback-pace-y-forecast.md`
- `11-admin-dashboard.md`
- `12-tests-con-vitest.md`
- `13-build-y-deploy.md`

---

## 10 · Archivos de memoria de Claude relevantes

Si seguís en Claude Code, estas memories ya están guardadas y se
cargan automáticamente:

- `MEMORY.md` — índice de todas las memories del proyecto.
- `project_status_fase2_frontend_scaffold_done.md` — este mismo
  resumen en formato memoria.
- `design_direction_editorial_moderno.md` — reglas del canon visual.
- `infra_gotchas.md` — puertos (MySQL 3307, Vite 5174, MorphoFront 5173).
- `fase2_handoff_docs.md` — handoff original del backend
  (`Proyect/docs/frontend-handoff.md`) — sigue siendo útil para mapping
  endpoint → page de features no implementadas.

---

## 11 · Endpoints del backend que ya consumimos vs los que faltan

### Consumidos en esta sesión

- `POST /auth/signup`
- `POST /auth/login`
- `POST /account/logout`
- `GET /account/profile`
- `GET /contents` (con `?page`, `?genre`, `?sort`)
- `GET /genres`

### Mapeados en tipos pero no llamados todavía

- `GET /contents/:slug` (lista `contentApi.show`).

### Pendientes (35 - 7 = 28)

Ver `Proyect/docs/frontend-handoff.md` §0 para la tabla completa con
auth requirements (—, ✅, 👑, silent).

Resumido por módulo:

- **Reviews:** `GET /contents/:slug/reviews`, `GET /users/:id/reviews`,
  `POST /contents/:slug/reviews`, `PATCH/DELETE /reviews/:id`.
- **Watchlists:** `POST/GET/PATCH/DELETE /watchlists/[:id]`,
  `POST/PATCH/DELETE /watchlists/:id/items/[:itemId]`.
- **Playback:** `GET/PATCH /account/pace-settings`,
  `GET/POST/DELETE /account/holidays/[:date]`,
  `GET /watchlists/:id/items/:itemId/{forecast,retrospective}`.
- **Admin:** `GET /admin/users[/:id]`, `PATCH /admin/users/:id/role`,
  `GET /admin/reviews`, `GET /admin/watchlists`.
- **Content (admin):** `POST /movies`, `POST /series`.

---

## 12 · Snapshot del 2026-05-19

Si después de varias sesiones se agregan endpoints, módulos o pages
nuevas, este doc va a quedar desactualizado. Para la verdad viva:

- **Frontend:** `git log` del repo + `docs/learning/` actualizados.
- **Backend:** `Proyect/start/routes.ts` + `node ace list:routes` para
  la lista canónica de endpoints.
- **Memorias:** `MEMORY.md` y archivos linkeados — siempre reflejan
  el último cierre de sesión.
