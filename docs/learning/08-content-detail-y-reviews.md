# 08 — Content detail page + reviews lectura + poster 3D

> **Pre-requisitos:** docs 01-07. Tenés el catálogo funcionando con
> filtros, sort y paginación; el cliente HTTP + interceptor; el router
> con guards; las pages de auth.
>
> **Objetivo:** convertir el `click en card` (que hoy lleva a
> `/contents/:slug` y queda en blanco) en una página completa con tres
> partes: un **hero con el poster renderizado en 3D**, los metadatos
> del contenido, y un **listado de reseñas paginado**. El form para
> crear/editar reseñas queda para el doc 09.

Al terminar este doc vas a entender:

- El patrón de **state machine doble** (un fetch para el detail, otro
  para las reviews) y por qué cada uno necesita su propio
  `loading/error/content` independiente.
- Cómo leer un **route param dinámico** (`:slug`) y reaccionar cuando
  cambia (navegación entre dos detail pages distintas sin recargar).
- Las cuatro piezas mínimas de una escena **TresJS / Three.js**:
  canvas + cámara + mesh (geometría + material) + loop de animación.
- Cómo cargar una **textura desde URL** con `TextureLoader` sin
  reventar la página si la imagen no existe.
- El truco de **lerp damping** para animaciones que se sienten "vivas"
  pero no estridentes.
- Por qué la separación `PosterScene → ContentDetailHeader →
  ContentDetailPage` es importante (cada nivel tiene una sola
  responsabilidad).

---

## 1 · Por qué dos state machines en una sola page

La HomePage tenía un solo estado (`loading/error/empty/content`)
porque carga un solo recurso (`GET /contents`). La ContentDetailPage
necesita **dos recursos independientes**:

1. `GET /contents/:slug` → el contenido en sí (título, sinopsis,
   poster, etc.)
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

**Por qué `user` es opcional:** el endpoint `GET /contents/:slug/reviews`
embebe el author, pero un `POST /reviews` solo devuelve la review nueva.
Marcamos `user?` para que TypeScript te obligue a chequear antes de
acceder.

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

**Mismo patrón que `contentApi`:** thin wrapper, devuelve `data` ya
desempaquetado. Si después agregamos `create`, `update`, `destroy`,
crecen como métodos del mismo objeto.

---

## 3 · `RatingStars` (display) y `ReviewItem`

Antes de armar la page necesitamos las piezas atómicas.

### 3.1 · `RatingStars` en modo display

El backend devuelve `rating: 1-10`, pero visualmente queremos
**5 estrellas** (el doble es más fácil de mapear mentalmente: 8/10
= 4 estrellas rellenas).

```ts
const filledStars = computed(() => {
  if (props.value === null) return 0
  return Math.round(props.value / 2)
})
```

**Tres tamaños** (`sm` / `md` / `lg`) controlados por una sola prop, y
un opt-out del número (`showNumber={false}`) para casos como cards muy
chicas. Para `value === null` mostramos "Sin calificar" — un estado
visible es mejor que un componente vacío.

### 3.2 · `ReviewItem`

Una card con:

- **Avatar de iniciales** (mismo patrón que el NavBar — usamos el
  campo `user.initials` que el backend ya nos da pre-computado).
- Nombre + fecha (`toLocaleDateString('es-AR')`).
- Marca `· editada` si `updatedAt !== createdAt`.
- Título + cuerpo (`whitespace-pre-line` para respetar saltos de
  línea del usuario).
- Rating en la esquina superior derecha (size `sm`).

**Estructura:** `<article>` (semántico — cada review es un contenido
autocontenido). Borde 1px + radius 8px, fiel al canon del doc 02.

---

## 4 · El hero 3D — TresJS desde cero

Este es el punto novedoso del doc. Si nunca tocaste WebGL/Three.js,
acá hay 5 conceptos en 60 líneas.

### 4.1 · Las cuatro piezas mínimas de una escena 3D

Toda escena 3D — sin importar la librería — necesita:

1. **Canvas/Renderer:** el `<canvas>` HTML donde WebGL dibuja.
2. **Cámara:** desde dónde se mira la escena. Posición + tipo
   (perspective vs orthographic) + FOV.
3. **Mesh:** un objeto. Un mesh = geometría (forma) + material
   (cómo se ve la superficie).
4. **Loop de animación:** algo que se ejecute en cada frame
   (`requestAnimationFrame`) para mover/rotar/escalar los meshes.

TresJS abstrae todo esto en componentes Vue. Los nombres de Three.js
clásicos (`Mesh`, `PerspectiveCamera`, `PlaneGeometry`) tienen un
componente Vue equivalente con prefijo `Tres`: `<TresMesh>`,
`<TresPerspectiveCamera>`, `<TresPlaneGeometry>`.

### 4.2 · Gotcha clave: `useLoop` solo dentro del canvas

Antes de la estructura, una regla que rompe la primera vez que la
ignorás: **los composables como `useLoop()`, `useTres()`,
`useTresContext()` solo funcionan en componentes hijos de
`<TresCanvas>`.** Si los llamás en el mismo `<script setup>` que monta
el `<TresCanvas>`, vas a ver este error en consola y la página queda
en blanco:

```
useTresContext must be used together with useTresContextProvider.
You probably tried to use it above or on the same level as a TresCanvas
component. It should be used in child components of a TresCanvas instance.
```

**Por qué pasa:** `<TresCanvas>` instala el contexto de Tres en su
slot por debajo. El `<script setup>` del componente padre corre antes
de mounting children, entonces no hay contexto disponible.

**Solución estándar:** dividir en dos componentes. El padre
(`PosterScene`) maneja el DOM wrapper, listeners del mouse y carga de
textura. Un hijo (`PosterMesh`) vive dentro de `<TresCanvas>` y es
quien llama `useLoop()`.

```
PosterScene.vue
└─ <div @mousemove ...>
   └─ <TresCanvas>
      └─ <PosterMesh :texture :isHovering :mouseX :mouseY />
         └─ <TresMesh ref="meshRef">         ← acá sí useLoop()
            ├─ <TresPlaneGeometry />
            └─ <TresMeshBasicMaterial :map />
```

El estado (texture, hover, mouse) baja por props. Las animaciones
viven en el hijo donde sí hay contexto.

### 4.3 · Estructura mínima del canvas (en `PosterScene.vue`)

```vue
<TresCanvas :alpha="true" :antialias="true">
  <TresPerspectiveCamera :position="[0, 0, 4]" :fov="50" />
  <TresMesh ref="meshRef">
    <TresPlaneGeometry :args="[2, 3]" />
    <TresMeshBasicMaterial :map="texture" :transparent="true" />
  </TresMesh>
</TresCanvas>
```

Línea por línea:

- `<TresCanvas :alpha="true">` — el canvas, con fondo transparente
  para que respete el `bg-surface` del componente padre. `antialias`
  suaviza los bordes del plano.
- `<TresPerspectiveCamera :position="[0, 0, 4]" :fov="50">` — cámara
  4 unidades hacia atrás en el eje Z, mirando al origen. FOV 50° es
  un valor "humano" (no fisheye, no telephoto).
- `<TresPlaneGeometry :args="[2, 3]">` — un rectángulo de 2×3 unidades
  (relación 2:3, idéntica a un poster). `:args` se pasan al constructor
  de `PlaneGeometry` de Three.js tal cual.
- `<TresMeshBasicMaterial :map="texture">` — el material más barato
  (no necesita luces, no calcula sombras). El `map` es la textura.

### 4.4 · Cargar la textura desde URL (en `PosterScene.vue`)

`useTexture` de TresJS necesita Suspense. Para mantenerlo simple
usamos el loader manual de Three:

```ts
import { TextureLoader, type Texture } from 'three'
import { shallowRef, watch } from 'vue'

const texture = shallowRef<Texture | null>(null)

watch(
  () => props.posterUrl,
  (url) => {
    texture.value?.dispose()
    texture.value = null
    if (!url) return
    const loader = new TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      url,
      (tex) => { texture.value = tex },
      undefined,
      () => { texture.value = null }   // onError: silenciosamente al fallback
    )
  },
  { immediate: true }
)
```

**Por qué `shallowRef` y no `ref`:** Three.js objects son enormes
(tienen referencias circulares internas). Si los wrappeás con `ref`,
Vue intenta hacerlos `reactive` profundamente y rompe Three. Con
`shallowRef`, Vue trata el `.value` como inmutable opaque — perfecto.

**Por qué el `dispose()`:** las texturas WebGL viven en memoria de GPU.
Si cambiás de poster sin liberarlas, leak garantizado. `dispose()` lo
libera.

**Por qué `setCrossOrigin('anonymous')`:** sin esto, WebGL refusa
usar imágenes de otro origen como textura ("tainted canvas"). El
servidor del poster tiene que mandar `Access-Control-Allow-Origin`.

### 4.5 · El loop de animación: idle wobble + magnetic hover (en `PosterMesh.vue`)

Queremos dos comportamientos:

- **Idle:** el poster oscila suavemente en Y (`sin(elapsed)`).
- **Hover:** el poster sigue al mouse con un efecto "magnético"
  (lerp damping).

`useLoop` de TresJS te da hooks que corren cada frame. Usamos
`onBeforeRender` para mover los meshes antes del próximo render:

```ts
import { useLoop } from '@tresjs/core'

const { onBeforeRender } = useLoop()
let elapsed = 0

onBeforeRender(({ delta }: { delta: number; elapsed: number }) => {
  const mesh = meshRef.value
  if (!mesh) return
  elapsed += delta

  if (isHovering.value) {
    const targetY = mouseX.value * 0.4       // mouseX normalizado [-1, 1]
    const targetX = -mouseY.value * 0.25
    mesh.rotation.y += (targetY - mesh.rotation.y) * 0.12
    mesh.rotation.x += (targetX - mesh.rotation.x) * 0.12
  } else {
    const targetY = Math.sin(elapsed * 0.9) * 0.09
    mesh.rotation.y += (targetY - mesh.rotation.y) * 0.04
    mesh.rotation.x += (0 - mesh.rotation.x) * 0.04
  }
})
```

**Qué es lerp damping:** en vez de saltar al target instantáneamente,
movés un % de la distancia restante cada frame
(`current += (target - current) * factor`). Factor bajo (0.04) = lento
y suave, factor alto (0.12) = más responsivo. Es la base de cualquier
animación que se sienta "natural" sin tweens manuales.

**Por qué `delta` y no contar frames:** `delta` es segundos desde el
frame anterior. Multiplicarlo por la frecuencia (`* 0.9`) hace que la
oscilación tenga la misma velocidad en una pantalla 60Hz o 144Hz. Si
contás frames, los monitores rápidos animan demasiado rápido.

### 4.6 · Captura del mouse (en `PosterScene.vue`)

El listener va en el contenedor `<div>` (no en el `<canvas>`, así
funciona aunque el canvas no haya inicializado todavía):

```ts
function handleMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  mouseX.value = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouseY.value = ((e.clientY - rect.top) / rect.height) * 2 - 1
}
```

Normalizamos a `[-1, 1]` (clip space) — más fácil de multiplicar por
factores de rotación que píxeles crudos.

### 4.7 · Fallback gracioso

Si `posterUrl === null` (varios seeds del backend lo tienen), no
montamos `<TresCanvas>` en absoluto. Mostramos un div placeholder con
el título — más liviano y evita el flash de "cargando textura".

```vue
<TresCanvas v-if="posterUrl" :alpha="true"> ... </TresCanvas>
<div v-else class="flex h-full w-full items-center justify-center ...">
  <span class="text-xs uppercase ...">Sin poster</span>
  <span>{{ title }}</span>
</div>
```

---

## 5 · `ContentDetailHeader` — composición plana

El header es solo layout: poster a la izquierda (en md+), bloque de
metadatos a la derecha. Computeds para tres líneas derivadas:

- `typeLabel` — `'Película'` vs `'Serie'`.
- `metaLine` — concatena tipo, año, runtime/temporadas separados por
  `·`. Usa los campos opcionales `content.movie?.runtimeMinutes` y
  `content.series?.seasonsCount`.
- `reviewCountLabel` — pluralización en español.

Nada de lógica de negocio acá. Si después querés agregar un botón
"trailer" o "agregar a watchlist", entra en este componente.

---

## 6 · `ContentDetailPage` — orquestación

### 6.1 · Leer el slug y reaccionar al cambio

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

**Por qué resetar `reviewsPage` y `reviewsSort` al cambiar slug:**
porque "estaba en page 3 ordenado por top" de una película es una
preferencia local de esa página, no global. Cambiar de película debe
empezar de cero.

### 6.2 · Dos state machines, dos templates condicionados

El template tiene tres ramas top-level:

```vue
<div v-if="loading"> skeleton del header </div>
<div v-else-if="error"> mensaje + botón volver </div>
<template v-else-if="content">
  <ContentDetailHeader :content />
  <section> reseñas (con su propio loading/error/empty/content adentro) </section>
</template>
```

Las reseñas tienen su `v-if/v-else-if/v-else` propio adentro del
`<section>`. Esto permite que el header esté visible mientras las
reseñas todavía cargan.

### 6.3 · El CTA "Escribir reseña"

Por ahora es un botón disabled con texto "(próximamente)". Solo se
renderiza si `auth.isAuthenticated`. En el doc 09 le agregamos el
form de verdad, pero dejarlo visible (aunque deshabilitado) le dice
al user "esto va a estar acá pronto" en vez de aparecer mágicamente
después.

### 6.4 · Route en el router

```ts
{
  path: '/contents/:slug',
  name: 'content-detail',
  component: () => import('@/pages/ContentDetailPage.vue'),
}
```

Sin `meta` — la ruta es pública. El backend devuelve 404 si el slug
no existe, y la page lo maneja con un mensaje claro.

---

## 7 · Verificación

1. Click en cualquier card del home → URL cambia a
   `/contents/<slug>` y aparece el detail.
2. Si el contenido tiene poster (ninguno de los seeds actuales lo
   tiene), el plano 3D se renderiza y oscila suavemente. Pasar el
   mouse encima lo hace seguirte con damping.
3. Sin poster, ves la card de fallback con el título centrado.
4. La sección de reseñas carga en paralelo. Si hay reviews, listado
   + paginación. Si no, empty state con prompt para login (si no
   estás autenticado).
5. Navegá entre dos detail pages distintas (botón atrás del browser o
   click directo desde el home) — el contenido y las reseñas se
   recargan, no quedan los de la página anterior.
6. Si el slug no existe (URL inventada), aparece "No encontramos
   este contenido" + botón "Volver al catálogo".

---

## 8 · Errores comunes

### "Mi 3D no aparece, solo veo el div gris"

- ¿`posterUrl` es null? Es esperado — fallback intencional.
- ¿La URL es de otro origen sin CORS? Abrí DevTools → Console.
  Vas a ver `Tainted canvas error`. El servidor del poster tiene
  que mandar `Access-Control-Allow-Origin: *` o el origen del frontend.
- ¿`<TresCanvas>` está dentro de un contenedor con `height: 0`?
  El canvas hereda el tamaño del padre. Aseguráte de que el wrapper
  tenga `aspect-[2/3]` o un alto explícito.

### "El poster aparece pero no rota"

- ¿`meshRef` está bien tipado y se asigna? Logueá `meshRef.value` en
  el `onBeforeRender`. Si es `null`, el ref no se está bindeando —
  chequeá que el `ref="meshRef"` esté en el `<TresMesh>` (no en un
  `<TresMesh>` padre si estuvieras anidando).
- ¿`useLoop` está importado de `@tresjs/core`? En TresJS v5 cambió de
  nombre (antes era `useRenderLoop`) — si seguís docs viejos te vas
  a confundir.

### "Vue dice que `<TresMesh>` es desconocido"

- Es un warning de TypeScript del IDE. TresJS provee la augmentación
  de tipos automáticamente al instalarse. Si igual lo ves, agregá
  `"types": ["@tresjs/core"]` al `compilerOptions` de `tsconfig.app.json`.
- En runtime no rompe nada — Vue tiene un escape hatch para
  componentes desconocidos.

### "Cambio de slug y el header de la página anterior queda visible un segundo"

- Estás esperando a que cargue el nuevo `content` sin resetear el
  anterior. Asegurate de hacer `content.value = null` al inicio de
  `loadContent()`. Eso fuerza el branch del skeleton.

### "El bundle creció mucho"

- Three.js solo pesa ~600KB y TresJS le suma ~100KB. Si solo usás 3D
  en una page, hacé import dinámico del componente:
  `const PosterScene = defineAsyncComponent(() => import('@/components/content/PosterScene.vue'))`.
  Así Three.js se descarga solo cuando entrás al detail.

---

## 9 · Recap

- Una page con dos fetches debe tener dos state machines
  independientes — nunca un único `loading` global.
- `watch(route.params...)` es necesario cuando navegás entre
  variantes de la misma ruta; `onMounted` solo dispara la primera vez.
- TresJS te da componentes Vue para Three.js, pero el modelo mental
  es el mismo: canvas → cámara → mesh (geometría + material) → loop.
- `shallowRef` para objetos de Three. Nunca `ref` (rompe la
  reactividad y la performance).
- `delta` del render loop = base para cualquier animación
  framerate-independent.
- Lerp damping (`current += (target - current) * factor`) es la
  fórmula más útil para que algo se sienta "vivo".
- Fallback gracioso = no montar `<TresCanvas>` en absoluto cuando no
  hay textura. Más simple que mostrar un canvas vacío.

**Próximo doc** — `09-reviews-crud.md`: el form para crear/editar/
borrar reseñas (Fase 2 del plan), con manejo de 409 (duplicate review
por user+content) y reuso de `extractFieldErrors` para los 422.
