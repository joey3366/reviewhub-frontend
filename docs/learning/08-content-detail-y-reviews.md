# 08 — Content detail page cinemática + reviews lectura

> **Pre-requisitos:** docs 01-07. Tenés el catálogo funcionando con
> filtros, sort y paginación; el cliente HTTP + interceptor; el router
> con guards; las pages de auth.
>
> **Objetivo:** convertir el `click en card` (que llevaba a
> `/contents/:slug` y quedaba en blanco) en una página completa,
> oscura y cinematográfica con tres partes: un **hero con backdrop
> animado**, el bloque de **metadatos** y un **listado de reseñas**
> paginado. El form para crear/editar reseñas queda para el doc 09.

Al terminar este doc vas a entender:

- El patrón de **state machine doble** (un fetch para el detail, otro
  para las reviews) y por qué cada uno necesita su propio
  `loading/error/content` independiente.
- Cómo leer un **route param dinámico** (`:slug`) y reaccionar cuando
  cambia (navegación entre dos detail pages distintas sin recargar).
- Cómo declarar **rutas full-bleed** (que escapan del container
  global) usando `route.meta` y reaccionar desde `App.vue`.
- Cómo armar un **hero cinematográfico** sólo con CSS:
  `background-image` + gradientes de máscara + animación Ken Burns +
  parallax al scroll.
- El truco del **stagger fade-in** con `animation-delay` para que la
  metadata aparezca escalonada.
- Por qué el **rubber-band scroll** muestra el fondo del `<body>` y
  cómo pintarlo del color correcto solo en rutas específicas.
- Por qué necesitamos un **proxy de imágenes** (`images.weserv.nl`)
  para evitar problemas de CORS con backdrops/posters de terceros.

> **Nota histórica:** la primera iteración usaba TresJS / Three.js
> para renderizar el poster como un plano 3D con rotación y
> mouse-follow. Quedó lindo técnicamente pero pesaba 800KB+ y no se
> alineaba con el look editorial cinemático que terminamos eligiendo.
> Lo desarmamos pero dejé el aprendizaje en el **Apéndice A** al
> final — sirve para entender cómo se mete WebGL en una app Vue si
> en el futuro querés volver al ruedo.

---

## 1 · Por qué dos state machines en una sola page

La HomePage tenía un solo estado (`loading/error/empty/content`)
porque carga un solo recurso (`GET /contents`). La ContentDetailPage
necesita **dos recursos independientes**:

1. `GET /contents/:slug` → el contenido en sí (título, sinopsis,
   poster, backdrop, géneros…).
2. `GET /contents/:slug/reviews` → las reseñas, paginadas y ordenadas.

**¿Por qué no un solo loading?** Porque la UX colapsa si esperás todo
para mostrar algo. Si el detail tarda 100ms y las reviews 2s, mostrarle
al user "Cargando…" durante 2s cuando el header ya podría estar
visible es malo. Cargar en paralelo y mostrar cada parte cuando llega
es mucho mejor.

**¿Por qué no recargar reviews cuando cambia el detail?** Porque
cambia el slug (navegación de una página a otra), no porque cambien
las reviews. Mantener los dos estados separados deja claro qué
disparó qué re-render.

**Regla:** una page con N fetches independientes debe tener N tuplas
de `loading / error / data` separadas.

---

## 2 · Tipos y API client

### 2.1 · Agregar el tipo `Review`

En `src/api/types.ts` ya teníamos `Content`, `Genre`, `AuthUser`.
Agregamos:

```ts
export interface ReviewAuthor {
  id: string
  fullName: string | null
  initials: string
}

export interface Review {
  id: string
  contentId: string
  rating: number          // 1-10 según validación del backend
  title: string
  body: string
  createdAt: string       // ISO 8601
  updatedAt: string | null
  user?: ReviewAuthor     // opcional: viene en list pero no siempre en mutations
}
```

### 2.2 · Nuevo módulo `reviewsApi`

`src/api/reviews.ts`:

```ts
import client from './client'
import type { Paginated, Review } from './types'

export interface ReviewListParams {
  page?: number
  perPage?: number
  sort?: 'recent' | 'top'
}

export const reviewsApi = {
  listByContent: async (slug: string, params: ReviewListParams = {}) => {
    const { data } = await client.get<Paginated<Review>>(
      `/contents/${slug}/reviews`,
      { params }
    )
    return data
  },
}
```

Mismo patrón que `contentApi`. Si después agregamos `create`,
`update`, `destroy`, crecen como métodos del mismo objeto (eso es el
doc 09).

---

## 3 · `RatingStars` y `ReviewItem` con variantes de tema

Antes de armar el hero necesitamos las piezas atómicas. Como la
detail page es oscura pero el resto del sitio es claro, los
componentes que se usan en ambos lados aceptan una prop
`theme?: 'light' | 'dark'` con default `'light'`.

### 3.1 · `RatingStars`

El backend devuelve `rating: 1-10`, pero visualmente queremos
**5 estrellas** (es más fácil de mapear: 8/10 = 4 estrellas
rellenas).

```ts
const filledStars = computed(() => {
  if (props.value === null) return 0
  return Math.round(props.value / 2)
})
```

Los colores se derivan del tema:

```ts
const colors = computed(() => {
  if (props.theme === 'dark') {
    return { filled: 'text-amber-400', empty: 'text-white/20', ... }
  }
  return { filled: 'text-ink', empty: 'text-ink-subtle/40', ... }
})
```

Tres tamaños (`sm` / `md` / `lg`) y opt-out del número (`showNumber=false`).

### 3.2 · `ReviewItem`

Una `<article>` con avatar de iniciales, nombre del autor, fecha
formateada en español (`toLocaleDateString('es-AR')`), marca
`· editada` si `updatedAt !== createdAt`, título y body
(`whitespace-pre-line` para respetar saltos del usuario), y el
rating arriba a la derecha.

Igual que `RatingStars`, recibe `theme` y aplica clases distintas:
fondo `bg-white/[0.03]` con borde `border-white/10` en dark, o
`bg-surface` con `border-outline` en light.

---

## 4 · Full-bleed routes — escape del container global

Antes de tocar el hero, hay un problema estructural. `App.vue` tiene
siempre el mismo wrapper:

```vue
<main class="mx-auto max-w-7xl px-6 py-10">
  <RouterView />
</main>
```

Eso es perfecto para HomePage y demás (deja gutters laterales y un
ancho máximo legible), pero para el hero cinemático queremos que el
backdrop se vea **de borde a borde de la viewport** y sin padding.

### 4.1 · Declarar la ruta como "full-bleed"

En `router/index.ts` agregamos `meta`:

```ts
{
  path: '/contents/:slug',
  name: 'content-detail',
  component: () => import('@/pages/ContentDetailPage.vue'),
  meta: { fullBleed: true },
}
```

### 4.2 · App.vue reacciona

```ts
const route = useRoute()
const isFullBleed = computed(() => route.meta.fullBleed === true)

watchEffect(() => {
  document.documentElement.classList.toggle('full-bleed', isFullBleed.value)
})
```

```vue
<div :class="isFullBleed ? 'min-h-screen bg-black' : 'min-h-screen bg-surface'">
  <NavBar />
  <main :class="isFullBleed ? '' : 'mx-auto max-w-7xl px-6 py-10'">
    <RouterView />
  </main>
</div>
```

Tres cosas pasan al entrar a la ruta:

1. El wrapper de `App.vue` se pinta de negro.
2. El `<main>` pierde sus constraints (full-width, sin padding).
3. La clase `.full-bleed` se agrega al `<html>` — esto se usa en CSS
   global (ver §7 sobre overscroll).

Al salir, todo vuelve. **Es declarativo: cualquier ruta futura puede
optar-in con una sola línea de meta.**

### 4.3 · NavBar adaptativo

`NavBar.vue` también lee `route.meta.fullBleed` y aplica un set de
clases distinto: fondo `bg-black/40 backdrop-blur-md` (en vez del
blanco), texto blanco con hover `bg-white/10`, logo invertido. Toda
la lógica de auth/links queda igual; solo cambia la paleta.

---

## 5 · El hero cinemático sin librerías 3D

Es solo CSS bien armado. Tres capas apiladas con `absolute`:

```
┌─ section (relative, min-h-[720px], overflow-hidden) ────┐
│  ┌─ wrapper backdrop (absolute, inset-0) ──────────────┐│
│  │  ┌─ image div (background-image, ken-burns anim) ──┐││
│  │  │                                                 │││
│  │  └─────────────────────────────────────────────────┘││
│  │  ┌─ gradient L→R (from-black via-black/85) ────────┐││
│  │  │                                                 │││
│  │  └─────────────────────────────────────────────────┘││
│  │  ┌─ gradient bottom (from-black to-transparent) ──┐││
│  │  └─────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────┘│
│  ┌─ content (relative, max-w-7xl, mx-auto) ──────────┐ │
│  │  [Volver]                                          │ │
│  │  ┌─ Poster ─┐   ┌─ Metadata ──────────┐           │ │
│  │  │          │   │ Year · Type · IMDb  │           │ │
│  │  │  <img>   │   │ Title (huge)        │           │ │
│  │  │          │   │ ★★★★★ · reseñas    │           │ │
│  │  │          │   │ Chips de género     │           │ │
│  │  │          │   │ Synopsis            │           │ │
│  │  │          │   │ Director            │           │ │
│  │  └──────────┘   └─────────────────────┘           │ │
│  │  [Ver tráiler] [+ Mi lista] [Share]               │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 5.1 · Backdrop como `background-image`

```vue
<div
  v-if="content.backdropUrl"
  class="ken-burns absolute inset-0 bg-cover bg-center"
  :style="{ backgroundImage: `url(${content.backdropUrl})` }"
/>
```

Si no hay `backdropUrl` (mucha data del seed lo tiene `null`),
caemos en un fallback con `bg-gradient-to-br from-zinc-900 via-zinc-950 to-black`.

### 5.2 · Tres gradientes apilados encima

```vue
<div class="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-transparent" />
<div class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent" />
<div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
```

- El primero (L→R) hace legible el texto de la metadata sobre el
  backdrop. Sin él la columna izquierda compite con la imagen.
- El segundo (bottom) suaviza la transición a la sección de reseñas
  abajo.
- El tercero (top) le da peso al NavBar y evita que la imagen lo
  "ataque".

### 5.3 · Animación Ken Burns en CSS puro

"Ken Burns" es el clásico zoom + pan lento que usan los documentales.
13 líneas de keyframes:

```css
@keyframes kenBurns {
  0%   { transform: scale(1.05) translate(0, 0); }
  50%  { transform: scale(1.18) translate(-2%, -1.5%); }
  100% { transform: scale(1.05) translate(0, 0); }
}
.ken-burns {
  animation: kenBurns 32s ease-in-out infinite;
  transform-origin: center;
}
```

Ciclo de 32s — lento adrede. Si el ciclo fuera 8s, marearía.

### 5.4 · Stagger fade-in con `animation-delay`

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
.fade-up { animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
```

Y en cada elemento del template asignamos un delay distinto:

```vue
<p class="fade-up" style="animation-delay: 60ms">{{ metaLine }}</p>
<h1 class="fade-up" style="animation-delay: 120ms">{{ title }}</h1>
<div class="fade-up" style="animation-delay: 240ms">stars</div>
<div class="fade-up" style="animation-delay: 300ms">chips</div>
<p class="fade-up" style="animation-delay: 360ms">{{ synopsis }}</p>
```

`backwards` en la animación es clave: hace que el estado inicial
(opacity 0) se aplique antes de que arranque el delay, así no ves un
flash del texto antes de empezar.

### 5.5 · Parallax al scrollear

```ts
const backdropOffset = ref(0)

function handleScroll() {
  backdropOffset.value = window.scrollY * 0.35
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
})
```

```vue
<div
  class="absolute inset-0"
  :style="{ transform: `translate3d(0, ${backdropOffset}px, 0)` }"
>
```

El multiplicador `0.35` controla la intensidad — el backdrop se mueve
35% de lo que se mueve la página. `passive: true` en el listener es
importante: le dice al browser que no vas a hacer `preventDefault`, y
el scroll se mantiene fluido. `translate3d` con z=0 fuerza GPU
acceleration en la transformación.

### 5.6 · Respect `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  .ken-burns,
  .fade-up { animation: none; }
}
```

User con preferencia "reduce motion" ve el hero estático. No es
deal-breaker, es lo correcto.

---

## 6 · Los botones de acción

Ver tráiler / Mi lista / Share son visuales por ahora (no hay backend
para tráiler ni share, y "Mi lista" depende de watchlists que arman
en Fase 3). Están `disabled` con `title="Próximamente"` para que se
vean en su contexto. Tres patrones distintos:

- **Botón círculo + label** (Ver tráiler): un `<span>` redondo con un
  `<svg>` de triángulo play, seguido del texto. El hover scale-105
  vive en el círculo, no en el label.
- **Pill con icono** (+ Mi lista): pill grande con icono SVG plus +
  texto.
- **Icon-only círculo** (Share): solo `<svg>` adentro, sin label.

Los SVG van inline con `viewBox` y `stroke="currentColor"` — así
heredan el color del padre y no tenemos que instalar una librería
de iconos para 3 íconos.

---

## 7 · El bug del overscroll blanco

Cuando hacés trackpad pull o rubber-band scroll en la detail page,
el browser "tira" el contenido y deja ver el fondo del `<body>`. Si
ese fondo es blanco (`bg-surface`), aparecen franjas blancas a los
costados que rompen la inmersión.

Solución: pintamos el `<html>` y `<body>` de negro **solo** cuando
estás en una ruta full-bleed. La clase `.full-bleed` se agrega al
`<html>` desde `App.vue` (§4.2) y `base.css` hace el resto:

```css
@layer base {
  html.full-bleed,
  html.full-bleed body {
    background-color: #000;
  }
}
```

Al salir de la ruta, la clase se saca y el body vuelve a `bg-surface`.

**Por qué no `overscroll-behavior: none`:** funciona pero desactiva
el bounce que algunos users encuentran natural. Pintar el body es
menos invasivo.

---

## 8 · CORS para imágenes externas — `images.weserv.nl`

Si pasás una URL de TMDB / IMDb / cualquier CDN externo al
`backdrop` o `poster`, el browser puede o no aceptarla según los
headers `Access-Control-Allow-Origin` que sirva. La realidad es que
los CDNs grandes son inconsistentes (cache edge variable). Resultado:
funciona en producción pero falla en dev, o al revés.

**Solución pragmática:** envolvemos la URL externa en un proxy:

```
https://images.weserv.nl/?url=image.tmdb.org/t/p/w500/<id>.jpg
```

`images.weserv.nl` es un proxy gratuito que:

- Re-sirve cualquier imagen pública con CORS `*` consistente.
- Permite resize on-the-fly (`?w=500&h=750`).
- Acepta el `url=` sin protocolo (formato corto).

Para Fase 5 (admin) tenemos que decidir si:

- El admin pega la URL ya wrappeada manualmente.
- O el frontend envuelve automáticamente al guardar.

Ver `docs/fase-0-verification-2026-05-20.md` para más contexto sobre
de dónde salió este problema.

---

## 9 · `ContentDetailPage` — la orquestación

### 9.1 · Leer el slug y reaccionar al cambio

```ts
const route = useRoute()
const slug = computed(() => route.params.slug as string)

watch(slug, async () => {
  reviewsPage.value = 1
  reviewsSort.value = 'recent'
  await loadContent()
  if (content.value) await loadReviews()
})
```

**Por qué `watch(slug)` y no solo `onMounted`:** Vue Router reutiliza
el componente si solo cambia el param. Si vas de `/contents/inception`
a `/contents/interstellar`, `onMounted` NO se vuelve a disparar. El
`watch` sí.

### 9.2 · Dos state machines, dos templates condicionados

El template tiene tres ramas top-level:

```vue
<div v-if="loading"> skeleton dark </div>
<div v-else-if="error"> mensaje + botón volver </div>
<template v-else-if="content">
  <ContentDetailHeader :content />
  <section> reseñas (con su propio loading/error/empty/content) </section>
</template>
```

Las reseñas tienen su `v-if/v-else-if/v-else` propio adentro del
`<section>`. Esto permite que el header esté visible mientras las
reseñas todavía cargan.

### 9.3 · El CTA "Escribir reseña"

Botón disabled con texto "(próximamente)". Solo se renderiza si
`auth.isAuthenticated`. En el doc 09 le agregamos el form de
verdad, pero dejarlo visible (aunque deshabilitado) le dice al user
"esto va a estar acá pronto".

---

## 10 · Verificación

1. Click en cualquier card del home → URL cambia a
   `/contents/<slug>` y aparece el detail dark cinemático.
2. Para contenidos con backdrop seteado (Interstellar, Inception),
   ves el fondo animado con Ken Burns y al scrollear se mueve
   parallax.
3. La metadata aparece con stagger sutil al cargar.
4. Sin poster/backdrop, ves fallbacks limpios.
5. Navegá entre dos detail pages distintas — el contenido y las
   reseñas se recargan, no quedan los de la página anterior.
6. Hacé pull con trackpad en cualquier dirección — todo negro, sin
   blanco asomando.
7. Click en "Volver" → vuelve al home (que sigue editorial light).
8. Si tu OS tiene preferencia "reduce motion", el Ken Burns y los
   stagger se desactivan.

---

## 11 · Errores comunes

### "El backdrop no aparece, solo veo el gradiente fallback"

- ¿`content.backdropUrl` es null? Es esperado — fallback intencional.
- ¿La URL es de un CDN sin CORS? Wrappeala con `images.weserv.nl`
  (ver §8).
- ¿Estás haciendo HMR y solo cambiaste vite.config? Necesitás
  restartear el dev server, HMR no lo agarra.

### "Las animaciones se ven trabadas en mobile"

- ¿Tenés `passive: true` en el listener de scroll? Sin él, el browser
  asume que vas a `preventDefault()` y bloquea el scroll suave.
- ¿Estás usando `translate3d` en vez de `translateY` para el parallax?
  El 3d fuerza GPU acceleration.

### "Aparecen franjas blancas al overscroll"

- Verificá que `.full-bleed` se esté agregando al `<html>`. Abrí
  DevTools y mirá la clase del elemento root.
- Verificá que `base.css` tenga la regla `html.full-bleed body`.

### "El NavBar queda blanco en la detail page"

- `NavBar.vue` lee `route.meta.fullBleed` — verificá que la ruta
  tenga `meta: { fullBleed: true }` en `router/index.ts`.

---

## 12 · Recap

- Una page con dos fetches debe tener dos state machines
  independientes — nunca un único `loading` global.
- `watch(route.params...)` es necesario cuando navegás entre
  variantes de la misma ruta; `onMounted` solo dispara la primera vez.
- `route.meta.fullBleed` es la forma declarativa de decir "esta ruta
  rompe el container global". Cualquier futura ruta opt-in con una
  línea.
- Un hero cinemático no necesita WebGL — `background-image` +
  gradientes + Ken Burns + parallax dan el 90% del efecto con 50
  líneas de CSS.
- `animation-delay` + `backwards` = stagger fade-in sin librerías
  de animación.
- El bug del overscroll blanco es real y se resuelve pintando el
  `<body>` desde una clase global, no parcheando overflow.
- Para imágenes externas, usá `images.weserv.nl` como proxy de CORS.

**Próximo doc** — `09-reviews-crud.md`: el form para crear/editar/
borrar reseñas (Fase 2 del plan), con manejo de 409 (duplicate review
por user+content) y reuso de `extractFieldErrors` para los 422.

---

## Apéndice A — Lo que probamos con TresJS y por qué cambiamos

La primera iteración de la detail page renderizaba el poster como un
plano 3D con TresJS (wrapper Vue de Three.js). Idle wobble + magnetic
hover. Quedó bien pero terminamos descartándolo. Vale la pena tenerlo
documentado por dos razones: el aprendizaje sigue siendo útil si en
el futuro querés meter 3D en otra parte, y los problemas que
encontramos son los típicos que cualquiera se choca al arrancar.

### A.1 · Cuándo conviene WebGL/Three.js en una app Vue

- **Sí:** efectos no replicables con CSS (deformaciones de textura
  reales, partículas físicas, escenas 3D verdaderas).
- **No:** rotaciones planas, parallax, hover tilts — todo eso CSS lo
  resuelve mejor y más liviano.

Nosotros estábamos en el segundo grupo, ahí estaba el error de
selección.

### A.2 · Las cuatro piezas mínimas de una escena TresJS

```vue
<TresCanvas :alpha="true" :antialias="true">
  <TresPerspectiveCamera :position="[0, 0, 4]" :fov="50" />
  <TresMesh ref="meshRef">
    <TresPlaneGeometry :args="[2, 3]" />
    <TresMeshBasicMaterial :map="texture" :transparent="true" />
  </TresMesh>
</TresCanvas>
```

- Canvas → Cámara → Mesh (Geometría + Material) → loop de animación.

### A.3 · Gotcha #1: `useLoop` solo dentro del canvas

Si llamás `useLoop()` en el mismo `<script setup>` que monta
`<TresCanvas>`, te explota con
`useTresContext must be used together with useTresContextProvider`.

Solución: dividir en dos componentes. El padre maneja el DOM +
mouse + textura, el hijo (que sí está adentro de `<TresCanvas>`)
llama `useLoop()`.

### A.4 · Gotcha #2: `templateCompilerOptions` en `vite.config.ts`

Sin esto, Vue trata los `<TresMesh>` y compañía como custom elements
desconocidos y emite warnings + no renderiza:

```ts
import { templateCompilerOptions } from '@tresjs/core'

export default defineConfig({
  plugins: [vue({ ...templateCompilerOptions })],
})
```

### A.5 · Gotcha #3: `shallowRef` para texturas

Los objetos de Three son enormes y tienen referencias circulares.
Si los wrappeás con `ref`, Vue intenta hacerlos reactive profundo y
te rompe la performance. Siempre `shallowRef`.

### A.6 · Por qué lo descartamos

- **Bundle:** `three` + `@tresjs/core` agregan ~700KB al chunk del
  detail. Tree-shaking ayuda poco porque son monolíticos.
- **Estética:** el plano 3D oscilando se sentía "showcase-y", no
  cinematográfico. Cuando comparamos contra el mockup definitivo
  (poster flat con backdrop animado atrás) el 3D perdía por
  irrelevante.
- **Mantenimiento:** dos componentes (PosterScene + PosterMesh), un
  watcher de textura, un loop con damping, un `dispose()` manual.
  Mucho código para algo que CSS resuelve con un `<img>`.

Si en el futuro querés meter 3D en otra parte (campo de estrellas
animado, modelo 3D de un personaje, deformación de imagen), volvé
a este apéndice — los tres gotchas siguen vigentes.
