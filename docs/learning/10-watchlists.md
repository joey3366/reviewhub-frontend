# 10 — Watchlists: CRUD, popover, fondo cinematográfico y reordenar con drag

> **Pre-requisitos:** docs 01-09. Tenés el catálogo, el detalle
> cinematográfico, auth, y las reviews andando. Entendés el patrón
> "componente tonto / page inteligente", el cliente HTTP con token, y
> las rutas `fullBleed`.
>
> **Objetivo:** construir toda la **Fase 3 (watchlists)**: guardar pelis
> y series en listas. A diferencia de las reviews, acá el backend **ya
> estaba hecho** (tag `v0.8.0-watchlists`), así que el foco es el
> frontend que lo consume — más unos retoques chicos de backend que
> aparecieron en el camino (reordenar, exponer campos para portadas).

Al terminar este doc vas a entender:

- Cómo **consumir un backend que ya existe** sin tocarlo (y cuándo sí
  conviene tocarlo).
- El patrón **"agregar desde cualquier lado"**: un popover de "Mi lista"
  en el detalle que crea/agrega/quita sin salir de la página.
- Por qué a veces tenés que hacer un **N+1 de requests** y cuándo está
  bien aceptarlo.
- Cómo posicionar un **popover con `<Teleport>` + posición fija** para
  que no lo recorte ningún `overflow-hidden`.
- Cómo armar **drag-and-drop nativo** (sin librerías) para reordenar, y
  cómo **persistir el orden** en el backend con una columna `position`.
- El bug clásico del **número que llega como string** (`"8.00"`) y por
  qué te deja la página "cargando para siempre".
- Cómo hacer un **slideshow de fondos con crossfade** en CSS.

---

## 1 · El backend ya estaba (y los retoques que sí hicimos)

El módulo de watchlists del backend ya tenía 8 endpoints:

| Método | Ruta | Qué |
|--------|------|-----|
| `GET` | `/watchlists` | Mis listas (con `itemsCount`) |
| `POST` | `/watchlists` | Crear |
| `GET` | `/watchlists/:id` | Detalle + items (público si la lista es pública) |
| `PATCH` | `/watchlists/:id` | Renombrar / cambiar visibilidad |
| `DELETE` | `/watchlists/:id` | Borrar |
| `POST` | `/watchlists/:id/items` | Agregar título |
| `PATCH` | `/watchlists/:id/items/:itemId` | Editar progreso |
| `DELETE` | `/watchlists/:id/items/:itemId` | Quitar título |

**Regla práctica:** si el backend ya hace lo que necesitás, no lo
toques. Acá lo tocamos **solo** cuando el frontend pedía algo que el
backend no exponía:

1. **Exponer `backdropUrl` y `avgRating`** en el contenido embebido del
   item (para portadas — §5).
2. **Reordenar** listas e items: dos columnas `position` + dos endpoints
   `PATCH .../reorder` (§6 y §8).

Cada uno fue una migración chica + transformer/validator/servicio. La
lección: extender un backed existente es barato si respetás sus
patrones (mirás cómo está hecho lo de al lado y copiás el estilo).

---

## 2 · API client y tipos

`src/api/watchlists.ts` — el mismo patrón que `contentApi`/`reviewsApi`:

```ts
export const watchlistsApi = {
  listMine: async () => (await client.get<{ data: Watchlist[] }>('/watchlists')).data.data,
  show: async (id) => (await client.get<{ data: Watchlist }>(`/watchlists/${id}`)).data.data,
  create: async (input) => (await client.post<{ data: Watchlist }>('/watchlists', input)).data.data,
  update: async (id, input) => (await client.patch<{ data: Watchlist }>(`/watchlists/${id}`, input)).data.data,
  destroy: async (id) => { await client.delete(`/watchlists/${id}`) },
  addItem: async (wid, input) => (await client.post(`/watchlists/${wid}/items`, input)).data.data,
  removeItem: async (wid, itemId) => { await client.delete(`/watchlists/${wid}/items/${itemId}`) },
  reorder: async (ids) => { await client.patch('/watchlists/reorder', { ids }) },
  reorderItems: async (wid, itemIds) => { await client.patch(`/watchlists/${wid}/items/reorder`, { itemIds }) },
}
```

Los tipos (`Watchlist`, `WatchlistItem`, `WatchlistItemContent`) espejan
la respuesta. **Detalle clave:** `listMine` (la lista) trae `itemsCount`
pero **no** los items ni la duración total; eso solo viene en `show` (el
detalle), que precarga los items. Ese detalle define toda la UX que
sigue.

---

## 3 · El popover "Mi lista" — agregar desde cualquier lado

El botón "Mi lista" del header del detalle abre un popover con tus
listas (checkboxes) + "crear nueva". Es un componente **autocontenido**
(`WatchlistButton.vue`): hace sus propias llamadas a la API.

### 3.1 · El N+1 de membresía

Para tildar las listas donde **ya está** este contenido, necesito los
items de cada lista. Pero `listMine` no los trae. Solución:

```ts
const lists = await watchlistsApi.listMine()
const details = await Promise.all(lists.map((l) => watchlistsApi.show(l.id)))
rows.value = details.map((wl) => {
  const item = wl.items?.find((it) => it.contentId === props.content.id)
  return { id: wl.id, name: wl.name, inList: Boolean(item), itemId: item?.id ?? null }
})
```

Es un **N+1**: 1 request para la lista + N para los detalles. ¿Está mal?
Acá **no**, porque N = tus listas (poquitas). La regla: un N+1 es
aceptable cuando N es chico y acotado por naturaleza. Si fueran cientos,
pediríamos un endpoint de membresía al backend.

### 3.2 · Posición con `<Teleport>` + fixed

El popover vivía dentro del hero, que tiene `overflow-hidden` (por el
backdrop). Eso lo **recortaba**. La solución no es pelear con z-index
local: es sacarlo del árbol con `<Teleport to="body">` y posicionarlo a
mano desde el rect del botón.

```ts
function positionPanel() {
  const r = rootEl.value!.getBoundingClientRect()
  panelStyle.value = {
    top: `${r.bottom + 8}px`,
    left: `${r.left}px`,
    maxHeight: `${Math.max(180, window.innerHeight - r.bottom - 24)}px`,
  }
}
```

El `maxHeight` se ajusta al espacio disponible abajo; la lista scrollea
internamente (flex column) y el formulario "Nueva lista" queda siempre
visible. Reposicionamos en `scroll` y `resize`.

### 3.3 · Detalles de UX

- **Cerrar al guardar**: tras agregar (o crear+agregar), `open = false`.
- **Botón icono**: si está en alguna lista, el botón muestra solo un ✓
  (con `aria-label`/`title` para accesibilidad); si no, "+ Mi lista".
- **Click-outside**: listener en `document` que se registra recién al
  abrir, así el mismo click que abre no lo cierra.

---

## 4 · La página "Mis listas" cinematográfica

Esta página es **`fullBleed`** (tema oscuro, como el detalle). El navbar
se adapta solo (doc 08). Encima va un fondo de render + acentos dorados.

### 4.1 · El bug del `-z-10`

Primer intento: el fondo era `fixed inset-0 -z-10`. **No aparecía** —
quedaba detrás del `bg-black` del wrapper `fullBleed`. Un z-index
negativo manda el elemento detrás del fondo de su ancestro.

```diff
- <div class="pointer-events-none fixed inset-0 -z-10 ...">  <!-- invisible -->
+ <div class="pointer-events-none fixed inset-0 z-0 ...">    <!-- ok -->
```

Y el contenido va con `relative z-10` arriba. **Regla:** para capas de
fondo, usá `z-0` + contenido `z-10`, no z-index negativos.

### 4.2 · Imagen de fondo + Ken Burns + partículas

La imagen va en `public/watchlists-bg.png` (servida en `/watchlists-bg.png`,
sin imports). Encima: un degradado de fallback (por si la imagen no
está), la imagen con animación **Ken Burns** lenta, máscaras oscuras
para legibilidad, y unas **partículas de polvo dorado** (divs chicos con
`box-shadow` ámbar y una animación `float`). Todo respeta
`prefers-reduced-motion`.

---

## 5 · Portada por calificación (y el bug del string)

La portada de cada card es el **backdrop del título mejor calificado** de
la lista. Como `listMine` no trae items, pedimos `show` por lista (otro
N+1 acotado) y elegimos el de mayor `avgRating`.

### 5.1 · El número que llegaba como string → "cargando para siempre"

El backend devolvía `avgRating` como **`"8.00"` (string)**, no número
(es un `DECIMAL` de MySQL). En el detalle hacíamos:

```ts
rating.toFixed(1)   // 💥 si rating es un string, .toFixed no existe
```

Eso tira `TypeError` **durante el render**. Y acá está lo traicionero:
cuando un render falla, Vue **mantiene el último DOM que sí pudo
pintar** — que era el skeleton de "Cargando". Resultado: la página
parecía colgada cargando, sin ningún error visible en pantalla (sí en la
consola).

**El fix, en dos capas:**

1. **Backend** — el transformer del item castea a número (igual que ya
   hacía el de Content):
   ```ts
   avgRating: content.avgRating !== null ? Number(content.avgRating) : null
   ```
2. **Frontend** — defensa extra: `Number(r).toFixed(1)`.

**Lección:** los `DECIMAL` de SQL suelen llegar como string. Casteá en
el transformer, del lado del servidor, para que el tipo del frontend
(`number | null`) sea verdad. Y nunca confíes en que un "número" de la
API es un número.

---

## 6 · Reordenar las listas con drag (persistido)

Queríamos arrastrar las cards para reordenarlas, **y que se guarde**.

### 6.1 · Backend: columna `position` + endpoint reorder

- Migración `ALTER`: `position` integer default 0 + índice
  `(user_id, position)`.
- `listMine` ordena por `position asc, created_at desc`.
- Endpoint `PATCH /watchlists/reorder` con `{ ids: [...] }`: escribe
  `position = 0..n` en ese orden. Ignora ids que no son del usuario (no
  se puede tocar listas ajenas).

> **Cuidado con el orden de las rutas:** `watchlists/reorder` tiene que
> registrarse **antes** de `watchlists/:id`. Si no, `:id` matchea con
> `id = "reorder"` y nunca llega al handler correcto. En AdonisJS las
> rutas se evalúan en orden de registro.

### 6.2 · Frontend: drag nativo sin librerías

HTML5 drag-and-drop alcanza, no hace falta una lib:

```vue
<article
  :draggable="editingId !== list.id"
  @dragstart="onDragStart(index)"
  @dragenter.prevent="onDragEnter(index)"
  @dragover.prevent
  @dragend="onDragEnd"
>
```

```ts
function onDragEnter(index) {
  if (dragIndex.value === null || dragIndex.value === index) return
  const arr = [...lists.value]
  const [moved] = arr.splice(dragIndex.value, 1)
  arr.splice(index, 0, moved)   // reordenamos en vivo mientras arrastrás
  lists.value = arr
  dragIndex.value = index
}
async function onDragEnd() {
  dragIndex.value = null
  await watchlistsApi.reorder(lists.value.map((l) => l.id))   // persistimos
}
```

Detalles:
- **`localStorage` vs backend:** la primera versión guardaba el orden en
  `localStorage` (rápido, sin backend). Lo cambiamos a backend cuando
  quisiste que persista en tu cuenta / entre dispositivos. El drag (la
  parte difícil) no cambió; solo el "dónde guardo".
- **Drag vs click:** un gesto de drag **no** dispara `click`, así que
  podés tener la card draggable y clickeable a la vez sin que choquen.
- **`draggable="false"`** en imágenes/links internos, para que no
  secuestren el drag con su propio comportamiento nativo.

---

## 7 · La card entera clickeable

Al principio solo el nombre (un link) navegaba; el resto de la card no
hacía nada. Lo arreglamos con `@click` en la `<article>`:

```vue
<article @click="goToDetail(list)" ...>
```

```ts
function goToDetail(list) {
  if (editingId.value === list.id) return   // no navegar si estás renombrando
  router.push(`/watchlists/${list.id}`)
}
```

Para que no navegue desde los controles internos, les ponemos
`@click.stop` (el menú ⋯ y los botones de renombrar). Si no, el click de
"Cancelar" borraría el modo edición y *después* burbujearía a la card →
navegaría sin querer.

---

## 8 · Detalle de lista — slideshow de fondos + reordenar items

`WatchlistDetailPage.vue` (`/watchlists/:id`, también `fullBleed`).

### 8.1 · Slideshow de backdrops con crossfade

En vez de un solo fondo, ciclamos por los backdrops de **todos** los
títulos, con crossfade cada 7s:

```vue
<div
  v-for="(url, i) in backdrops"
  :key="url"
  class="ken-burns absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
  :style="{ backgroundImage: `url(${url})`, opacity: i === currentBg ? 0.6 : 0 }"
/>
```

```ts
bgTimer = setInterval(() => {
  currentBg.value = (currentBg.value + 1) % backdrops.value.length
}, 7000)
```

Apilamos todas las capas y solo la activa tiene `opacity > 0`; la clase
`transition-opacity` hace el fundido. Se apaga con `prefers-reduced-motion`
y si hay un solo backdrop.

### 8.2 · Reordenar items (mismo patrón que §6)

Otra columna `position` (en `watchlist_items`) + endpoint
`PATCH /watchlists/:id/items/reorder`. En el frontend, los items
arrastrables.

> **Sutileza:** mantenemos un `orderedItems` **separado** de
> `watchlist.items`. ¿Por qué? Porque el slideshow del fondo (§8.1)
> depende de `watchlist.items`. Si arrastrar mutara ese mismo array, el
> `watch` del fondo se dispararía y **reiniciaría el slideshow** en cada
> movimiento. Separando las dos fuentes, arrastrás items sin que parpadee
> el fondo.

---

## 9 · Verificación

1. En un detalle de contenido, **"Mi lista"** → popover abre hacia abajo,
   completo. Creá "Ver más tarde" → el título queda guardado, el botón
   pasa a ✓.
2. **Navbar → "Mis listas"**: tema oscuro, fondo del render con Ken Burns
   y partículas, cards con portada (el backdrop del mejor calificado).
3. **Arrastrá** una card → se reacomoda; refrescá → queda en el orden
   nuevo (persistió en tu cuenta).
4. Clic en cualquier parte de la card → entra al **detalle de la lista**.
5. En el detalle: el fondo **cambia cada 7s** con crossfade; arrastrá los
   posters para reordenar; quitá un título con la ✕.
6. Renombrá y cambiá visibilidad desde el menú ⋯.

---

## 10 · Errores comunes

### "La página se queda cargando para siempre, sin error"

- Un número que llega como **string** y le hacés `.toFixed()` → render
  falla → Vue deja el último DOM (el skeleton). Mirá la **consola**:
  vas a ver el `TypeError`. Casteá en el transformer (§5).

### "El fondo no aparece, solo veo negro"

- ¿Usaste `-z-10`? Te queda detrás del `bg-black` del layout. Usá `z-0`
  + contenido `z-10` (§4.1).

### "El popover se corta y no puedo scrollear"

- Lo recorta un `overflow-hidden` ancestro. Teleportalo al `<body>` con
  posición fija (§3.2).

### "El PATCH de reorder me da 404 o toca la lista equivocada"

- La ruta `.../reorder` quedó **después** de `.../:id`. Registrala antes
  (§6.1).

### "Al arrastrar un poster, el fondo parpadea/reinicia"

- Estás mutando el mismo array que alimenta el slideshow. Separá
  `orderedItems` de `watchlist.items` (§8.2).

---

## 11 · Recap

- Si el backend ya hace lo que necesitás, **consumilo**; tocalo solo para
  exponer un campo o agregar una operación puntual, copiando sus patrones.
- Un **N+1** está bien cuando N es chico y acotado (tus listas).
- **`<Teleport>` + posición fija** = popovers/menús que ningún
  `overflow-hidden` recorta.
- **Drag-and-drop nativo** alcanza para reordenar; persistí el orden con
  una columna `position` + endpoint reorder (¡registralo antes de `:id`!).
- Los **`DECIMAL` de SQL llegan como string**: casteá en el transformer.
  Un render que tira error deja la UI "colgada" en su último estado.
- Un **slideshow con crossfade** son capas apiladas + `transition-opacity`
  + un `setInterval` que cambia el índice.
- Separá las **fuentes de estado** cuando dos features leen lo mismo pero
  una lo muta (items reordenables vs fondo).

**Próximo doc** — `11-playback.md` (Fase 4): duraciones y progreso por
título, ritmo de visionado (pace), **forecast** de cuándo terminás una
serie con tus feriados, y la retrospectiva. Los campos de seguimiento de
los items (`startedAt`, `finishedAt`, `episodesWatched`, `daysElapsed`,
`avgDaysPerEpisode`) ya vienen del backend esperando esta fase.
