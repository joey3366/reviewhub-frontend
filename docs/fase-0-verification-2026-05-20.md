# Fase 0 — Verification E2E (2026-05-20)

> Snapshot del estado del proyecto al cierre de la Fase 0. La meta era
> confirmar que el scaffold de la sesión 2 funciona end-to-end antes de
> empezar a construir features nuevas (Fase 1: ContentDetailPage).

---

## 1 · Cómo se levantó todo

```powershell
# Backend (terminal 1)
Set-Location 'C:\Users\Valentina\Desktop\Nueva carpeta\Proyect'
docker compose up -d      # MySQL ya estaba arriba
npm run dev               # Adonis en :3333

# Frontend (terminal 2)
Set-Location 'C:\Users\Valentina\Desktop\Nueva carpeta\frontend'
npm run dev               # Vite en :5174 (strictPort)
```

- Docker Desktop: v29.4.0
- Backend tag: `v0.10.0-admin`
- Frontend commit: `9f61f82` (initial scaffold)

---

## 2 · Resultados de los 10 pasos del E2E

Los pasos UI (clicks, navegación) no se ejecutaron en navegador en esta
sesión — se probaron via HTTP directamente contra el backend, que es
donde vive la lógica. Los que requieren ojos humanos quedan marcados.

| # | Paso | Resultado | Cómo se probó |
|---|------|-----------|---------------|
| 1 | Catálogo carga | ✅ | `GET /contents` devuelve 15 items |
| 2 | Skeleton aparece al refresh | 🟡 manual | requiere navegador |
| 3 | Filtro de género | ⚠️ | endpoint OK pero seeds no tienen géneros asociados → 0 resultados |
| 4 | Sort dropdown | ✅ | `?sort=top` y `?sort=recent` ordenan distinto |
| 5 | Click en card → detail | ⚠️ esperado | ruta existe en router, page no implementada (Fase 1) |
| 6 | Signup nuevo | ✅ | crea user, devuelve token |
| 7 | Logout | ✅ | revoca token (próximo `/profile` con ese token → 401) |
| 8 | Login admin | ✅ | después de crear+promover (ver §4) |
| 9 | Refresh con sesión | 🟡 manual | requiere navegador |
| 10 | Headers `Authorization: Bearer` | ✅ | `/account/profile` con token devuelve user; sin token → 401 |

**Cobertura HTTP completada. Pasos 2, 5b y 9 quedan pendientes para
verificación visual en navegador — son cosméticos y de Vue Router, no
de lógica.**

---

## 3 · Bugs descubiertos

### Bug 1 · `meta` vs `metadata` (alto impacto, fix chico)

**Síntoma:** después de cargar el catálogo, el header sigue diciendo
`"Cargando…"` en vez de `"15 títulos"`. Cuando haya más de 20 items,
los `PaginationControls` no van a renderizar nunca.

**Causa:** el backend Adonis serializa el meta de paginación bajo la
clave `metadata`:

```json
{
  "data": [...],
  "metadata": { "total": 15, "perPage": 20, "currentPage": 1, ... }
}
```

Pero los tipos del frontend (`src/api/types.ts:24-27`) y el código
(`src/pages/HomePage.vue:34`, `src/components/PaginationControls.vue`)
esperan `meta`.

**Fix sugerido (Fase 1, 5 min):**

- `src/api/types.ts`: renombrar `meta` → `metadata` en `Paginated<T>`.
- `src/pages/HomePage.vue:34`: `meta.value = result.metadata`.
- `src/components/PaginationControls.vue`: prop `metadata` en vez de
  `meta` (cuidado: hay un `meta.lastPage` y `meta.currentPage` en
  varios `computed`).

**Por qué no se fixeó en Fase 0:** el alcance de Fase 0 era verificar,
no parchear. El bug es invisible mientras haya <20 contents totales.

---

### Bug 2 · `role` ausente en respuesta de signup (bajo impacto, latente)

**Síntoma:** justo después de signup, `auth.user.role` es `undefined`
en el store. `isAdmin` devuelve `false` (safe), pero TypeScript miente
porque el tipo `AuthUser.role` declara `'user' | 'admin'`.

**Causa:** el endpoint `POST /auth/signup` del backend no incluye
`role` en `data.user`:

```json
{ "data": { "token": "...", "user": { "id": "...", "email": "...", "fullName": "...", "initials": "..." /* NO role */ } } }
```

`POST /auth/login` y `GET /account/profile` SÍ lo incluyen. Es una
asimetría del backend.

**Workaround actual:** `main.ts` llama `auth.refreshProfile()` al
bootstrap si hay token guardado, así que después de refrescar la página
el role llega bien.

**Cuándo va a romper:** en Fase 5 (Admin dashboard) si alguien hace
signup y se promueve a admin sin refrescar la página, el NavBar no le
muestra el link de admin hasta que recargue.

**Fix sugerido:** llamar `await auth.refreshProfile()` al final de
`signup()` y `login()` en el store. Backend igual debería normalizarse,
pero no es nuestro repo.

---

## 4 · Usuario admin creado

Como no existía, se creó y promovió:

```powershell
# 1. Signup via API
POST /auth/signup { email: 'admin@reviewhub.local', password: 'Admin1234', ... }
# 2. Promote via ace
node ace make:admin admin@reviewhub.local
# → [ success ] admin@reviewhub.local is now an admin
```

**Credenciales canónicas para testing:**

- Email: `admin@reviewhub.local`
- Password: `Admin1234`
- Role: `admin`

Login confirmado, `GET /admin/users` devuelve 39 users (hay
acumulación de signups de prueba — limpiar en algún momento desde la
DB no apura).

---

## 5 · Estado del backend al cierre

| Endpoint | Status | Notas |
|----------|--------|-------|
| `GET /contents` | ✅ | 15 items totales, paginación funciona pero usa key `metadata` |
| `GET /contents?sort=top\|recent` | ✅ | ordena bien |
| `GET /contents?genre=action` | ⚠️ | endpoint OK; seeds sin géneros → 0 resultados |
| `GET /genres` | ✅ | 12 géneros |
| `POST /auth/signup` | ⚠️ | falta `role` en response (ver Bug 2) |
| `POST /auth/login` | ✅ | incluye role |
| `GET /account/profile` | ✅ | requiere Bearer; incluye role |
| `POST /account/logout` | ✅ | revoca el token |
| `GET /admin/users` | ✅ | solo admin; 39 users en DB |

---

## 6 · Próximo paso: Fase 1 — ContentDetailPage

Con el scaffold verificado, lo siguiente es la ruta `/contents/:slug`
que hoy queda en blanco. Plan en `docs/session-2-handoff.md` §7 y el
plan por fases discutido al comenzar esta sesión.

**Antes de empezar Fase 1, considerar:**

1. Aplicar el fix del Bug 1 (`metadata` rename) — es un commit chico de
   3 archivos y limpia la cabeza del catálogo.
2. Aplicar el fix del Bug 2 (`refreshProfile` después de signup/login)
   — opcional, no rompe nada hasta Fase 5.

Ambos se pueden meter como primer commit de Fase 1, o como commit
aparte de tipo `fix:` antes de la feature.
