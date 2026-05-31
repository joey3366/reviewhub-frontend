# Frontend — docs de aprendizaje

> Esta carpeta replica el formato de `Proyect/docs/learning/` del backend.
> Cada doc es **paso a paso, replicable**, con explicaciones del _por qué_
> de cada decisión — no solo del _qué_ hacemos.

## Para quién es esto

Si arrancás de cero un frontend Vue 3 conectado a un backend AdonisJS (o
cualquier API REST con auth por Bearer tokens y respuestas JSON paginadas),
estos docs te llevan desde "no hay carpeta `frontend/`" hasta "el catálogo
carga y el login funciona", explicando cada decisión de arquitectura,
tooling y UX que tomamos en el camino.

## Pre-requisitos generales

- Conocer JavaScript moderno (ES2020+: `async/await`, destructuring, modules).
- Idea básica de TypeScript (tipos, interfaces, generics). No hace falta ser
  experto — los docs explican lo no obvio.
- Backend levantado en `http://localhost:3333` siguiendo `Proyect/docs/learning/`.

## Mapa de docs

| # | Doc | De qué se trata |
| - | --- | --------------- |
| 01 | [Decisiones iniciales y scaffold](01-decisiones-y-scaffold.md) | Por qué Vue 3 + Vite + TS + Pinia; monorepo vs carpetas hermanas; comandos para arrancar |
| 02 | [Design system con Tailwind](02-design-system-tailwind.md) | Tokens semánticos, extend vs replace, carga de Inter, `base.css`, `@apply` |
| 03 | [Componentes UI base](03-componentes-ui-base.md) | `BaseButton`, `BaseInput`, `BaseSelect`, `BaseBadge`, `BaseCard` — patterns reutilizables con `<script setup>` + tipos |
| 04 | [Cliente HTTP con axios + CORS](04-cliente-http-axios.md) | Instancia axios, interceptors de request/response, env vars `VITE_*`, manejo de 401/422, CORS desde el browser |
| 05 | [Estado con Pinia](05-pinia-auth-store.md) | Pinia options API, state/getters/actions, persistencia con localStorage, evitar dependencias circulares con el cliente HTTP |
| 06 | [Vue Router 4 y guards](06-router-y-guards.md) | Routes con lazy loading, `meta` flags, `beforeEach` para `guest` / `requiresAuth` / `requiresAdmin`, redirect query param |
| 07 | [Pages y forms](07-pages-y-forms.md) | `HomePage` con loading/empty/error states; `LoginPage`/`SignupPage` con manejo de 422 field errors y 429 rate limit |
| 08 | [Content detail + reviews (lectura)](08-content-detail-y-reviews.md) | Detail page cinemática: doble state machine, rutas full-bleed, hero con Ken Burns + parallax, listado de reseñas, proxy de CORS para imágenes |
| 09 | [Reviews CRUD](09-reviews-crud.md) | Create/update/delete de reseñas: backend rate-only (VineJS `.optional()` + migración `ALTER`), modal con `<Teleport>`, quick-rate, refetch vs optimistic |
| 10 | [Watchlists](10-watchlists.md) | Listas: popover "Mi lista", página cinematográfica (fondo + Ken Burns + partículas), portada por calificación, drag-reorder persistido (columna `position`), slideshow de fondos, y el bug del `DECIMAL` como string |
| 11 | [Playback](11-playback.md) | Ritmo + días libres, seguimiento por título (duración con segundos, episodios, fechas solo-series), pronóstico ("terminás el X") y retrospectiva; el footgun de `v-model` + `type="number"`, y el acoplamiento modo↔ritmo |
| 12 | [Progreso, anidación y tabs](12-progreso-anidacion-y-tabs.md) | "¿Cómo voy?" (mid-flight check con campo nuevo en el item + endpoint dedicado), listas anidadas (many-to-many auto-referencial + dedupe BFS + anti-ciclo DFS) y tabs por tipo (subqueries raw + localStorage); bugs de Luxon/MySQL DATETIME y `<select>` en dark |

## Cómo usar estos docs

- **Lectura lineal:** si arrancás de cero, leelos en orden. Cada uno asume
  lo que está antes.
- **Lectura por tema:** si solo querés entender (por ejemplo) por qué el
  token vive en `localStorage` y no en una cookie HttpOnly, andá directo al
  doc 05.
- **Replicar en otro proyecto:** los pasos numerados son replicables sobre
  cualquier proyecto Vue 3 + Vite con TypeScript. Cambiá los nombres del
  dominio y listo.

## Convenciones que vas a ver

- Comandos en bloque ```` ```powershell ```` para Windows / `bash` para POSIX.
- Paths absolutos cuando hace falta evitar confusión; relativos cuando es
  obvio dónde estamos.
- **"Lo importante:"** y **"Líneas clave explicadas:"** — secciones donde
  bajamos a entender qué hace cada pieza del código y por qué.
- **Callout en blockquote** (`> **Cuidado:**`) — marca errores típicos que
  cuestan tiempo de debugging.
