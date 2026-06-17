# 17 · Deploy gratis: Render + TiDB Cloud + Cloudflare Pages

> Guía paso a paso para deployar Kairos a producción sin pagar nada
> y sin migrar de MySQL. Backend en Render free, base MySQL en
> TiDB Cloud Serverless (forever free), frontend en Cloudflare Pages.

## Por qué este stack

| Pieza | Servicio | Trade-off |
|---|---|---|
| Frontend | Cloudflare Pages | $0 forever, CDN edge, dominio HTTPS gratis |
| Backend | Render (web service free) | $0 forever, **duerme tras 15 min sin tráfico**. Workaround abajo. |
| MySQL | TiDB Cloud Serverless | $0 forever, 5 GB storage, **100% MySQL compatible** — sin cambios al código |
| Imágenes | Cloudinary (ya configurado) | Ya andaba en dev, no se toca |

**Lo único pago es opcional**: un dominio custom (~$10/año si quieres
algo distinto a `kairos.pages.dev`).

## Pre-requisitos

- Repos pusheados a GitHub.
- `.env.example` con notas `[PROD]` (ya hecho en pre-deploy).
- `public/_redirects` en frontend (ya hecho).
- `config/database.ts` con `buildSsl()` para TLS (ya hecho).
- Builds production funcionando: `npm run build` en ambos.

---

## Parte 1: TiDB Cloud (la base de datos)

### 1a. Alta de cuenta

1. https://tidbcloud.com/ → **Sign up free** (Google o email).
2. Verificación de email.

### 1b. Crear cluster Serverless

1. Dashboard → **Create cluster**.
2. **Cluster type**: **Serverless** (esto es el tier free forever).
3. Configurar:
   - **Cluster name**: `kairos-prod`
   - **Cloud Provider**: AWS (más estable; GCP a veces tiene quirks)
   - **Region**: la más cercana — Singapore es buena desde Sudamérica
     si São Paulo no está disponible.
   - **Plan**: **Free** (5 GB storage, 50M RU/mes).
4. **Create** → ~30s y queda listo.

### 1c. Generar password y obtener connection string

1. Una vez creado, click en el cluster → **Connect**.
2. **Generate password** → guardala (no se vuelve a mostrar).
3. Te muestra una connection string tipo:
   ```
   mysql -u 2NxxxxxxxxxA.root -h gateway01.ap-southeast-1.prod.aws.tidbcloud.com -P 4000 -D test --ssl-ca=... --ssl-verify-server-cert
   ```
4. Anotar:
   - **Host**: `gateway01.ap-southeast-1.prod.aws.tidbcloud.com`
   - **Port**: `4000` (no 3306)
   - **User**: `2Nxxxxx.root`
   - **Password**: la que generaste
   - **Database**: vamos a crear `kairos_prod` en el paso siguiente.

### 1d. Crear la base de datos

TiDB Cloud Serverless da una DB default llamada `test`. Creamos la nuestra.

Desde tu compu (necesitás cliente `mysql` instalado):

```bash
mysql -u '2Nxxxxx.root' -h gateway01....aws.tidbcloud.com -P 4000 -p
```

Adentro:

```sql
CREATE DATABASE kairos_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

> **Si no tenés `mysql` cliente en Windows**: instalá MySQL Workbench
> (gratis, https://dev.mysql.com/downloads/workbench/). Permite crear
> la BD y correr el import con UI.

### 1e. Exportar dump local

Desde la carpeta del backend en tu compu:

```bash
mysqldump -h 127.0.0.1 -P 3307 -u reviewhub -p reviewhub_dev \
  --routines --triggers --single-transaction \
  --no-tablespaces \
  > kairos-dump.sql
```

Flags importantes:
- `--single-transaction`: dump consistente sin lockear tablas
- `--no-tablespaces`: necesario, TiDB no soporta `PROCESS` privilege
- `--routines --triggers`: incluye stored procs y triggers (no usamos
  pero por las dudas)

### 1f. Importar a TiDB Cloud

```bash
mysql -u '2Nxxxxx.root' -h gateway01....aws.tidbcloud.com -P 4000 -p kairos_prod < kairos-dump.sql
```

Toma ~1-2 min para nuestra DB. Verificar:

```bash
mysql -u '2Nxxxxx.root' -h gateway01....aws.tidbcloud.com -P 4000 -p kairos_prod \
  -e "SHOW TABLES; SELECT COUNT(*) FROM contents;"
```

> **Si tirá error con `FOREIGN_KEY_CHECKS`**: TiDB tiene FK checks
> deshabilitados por default en algunos planes. Las migraciones de
> Adonis ya crean tablas en el orden correcto (parent antes que child),
> así que el import no debería fallar. Si pasa: agregar
> `SET FOREIGN_KEY_CHECKS=0;` al principio del dump y `SET
> FOREIGN_KEY_CHECKS=1;` al final.

---

## Parte 2: Render (backend)

### 2a. Alta de cuenta

1. https://render.com → **Get Started**, login con GitHub (más simple).
2. Autorizar acceso al repo `reviewhub-backend`.

### 2b. Crear Web Service

1. Dashboard → **New** → **Web Service**.
2. **Connect repository** → `joey3366/reviewhub-backend` → **Connect**.
3. Configurar:

   | Campo | Valor |
   |---|---|
   | Name | `kairos-api` |
   | Region | Oregon (o la más cercana — no hay opción de Latam en free) |
   | Branch | `main` |
   | Root Directory | (vacío) |
   | Runtime | Node |
   | Build Command | `npm ci && npm run build` |
   | Start Command | `cd build && npm ci --omit=dev && node bin/server.js` |
   | Plan | **Free** |

### 2c. Environment Variables

En la misma página, **Environment** → agregar una por una:

```
NODE_ENV=production
TZ=America/Argentina/Buenos_Aires
PORT=10000
HOST=0.0.0.0
LOG_LEVEL=warn

APP_NAME=kairos-api
APP_KEY=<generar abajo>
APP_URL=https://kairos-api.onrender.com

SESSION_DRIVER=cookie

CORS_ORIGIN=https://kairos.pages.dev

DB_CONNECTION=mysql
DB_HOST=gateway01.ap-southeast-1.prod.aws.tidbcloud.com
DB_PORT=4000
DB_DATABASE=kairos_prod
DB_USER=2Nxxxxx.root
DB_PASSWORD=<la que generaste en TiDB>
DB_SSL=true

LIMITER_STORE=database
```

**Generar APP_KEY:** desde tu compu:

```bash
cd "C:/Users/Valentina/Desktop/Nueva carpeta/Proyect"
node ace generate:key
# Copiá la salida (~64 caracteres hex) y pegala en APP_KEY
```

> **PORT=10000:** Render espera que el backend escuche en el puerto
> que viene en `$PORT`. Por convención usan 10000. NO usar 3333.

> **HOST=0.0.0.0:** sin esto, Adonis escucha en localhost (loopback)
> y Render no puede llegarle. Es el equivalente de `--host 0.0.0.0`
> en otros frameworks.

### 2d. Deploy

1. **Create Web Service** → Render arranca el build.
2. Logs en vivo aparecen en la pantalla. Toma ~3-5 min la primera vez
   (npm install completo).
3. Cuando aparece `Server started on port 10000` y status → "Live",
   funcionó.

### 2e. Smoke test

```bash
curl https://kairos-api.onrender.com/api/v1/contents
# Debería devolver JSON con la paginación
```

Si tarda 30s la primera vez, es el cold start típico — funciona.

---

## Parte 3: Cloudflare Pages (frontend)

### 3a. Alta de cuenta

1. https://dash.cloudflare.com/sign-up → crear cuenta (free).
2. Confirmar mail.

### 3b. Conectar el repo

1. Dashboard → **Workers & Pages** → **Create application** → **Pages**
   → **Connect to Git**.
2. Autorizar GitHub → seleccionar `reviewhub-frontend`.
3. Configurar build:

   | Campo | Valor |
   |---|---|
   | Project name | `kairos` (queda `kairos.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | **Vue** |
   | Build command | `npm run build` |
   | Build output | `dist` |
   | Root directory | (vacío) |

4. **Environment variables**:

   ```
   VITE_API_BASE_URL=https://kairos-api.onrender.com/api/v1
   VITE_CLOUDINARY_CLOUD_NAME=ddi0npc6d
   VITE_CLOUDINARY_UPLOAD_PRESET=reviewhub_covers
   NODE_VERSION=24
   ```

5. **Save and Deploy** → ~2 min y queda live en `kairos.pages.dev`.

### 3c. Verificar CORS

El `CORS_ORIGIN` del backend ya debería tener `https://kairos.pages.dev`
de la Parte 2c. Si no, editar la env var en Render y **Manual Deploy**
para reiniciar.

### 3d. Test end-to-end

1. Abrir `https://kairos.pages.dev`.
2. Signup con un usuario nuevo.
3. Login con el admin que tenías en local (la pass no cambió porque
   importamos el hash).
4. Verificar catálogo, búsqueda, watchlists.
5. Abrir DevTools → Network → ver que las requests van a
   `kairos-api.onrender.com` con status 200.

---

## Parte 4: Mantener el backend vivo (keep-alive)

Render free hace **spin-down** del backend después de 15 min sin
requests. Cuando llega la próxima, despierta en 30-60s (cold start).
Para evitar esto, ping cada 14 min.

### 4a. UptimeRobot (recomendado, free)

1. https://uptimerobot.com → free signup.
2. **Add New Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `kairos-api keepalive`
   - URL: `https://kairos-api.onrender.com/api/v1/contents?page=1`
   - Monitoring Interval: **5 minutes** (free tier mínimo, suficiente)
3. **Create Monitor**.

UptimeRobot pinguea cada 5 min, el backend nunca se duerme.

> **Bonus:** UptimeRobot te avisa por mail si el sitio se cae (5xx,
> timeout, etc.). Gratis hasta 50 monitores.

### 4b. Alternativa: cron-job.org

Si UptimeRobot no te gusta, https://cron-job.org/ hace lo mismo.
También free.

---

## Parte 5: Custom domain (opcional)

### Para el frontend

1. Cloudflare Pages → tu proyecto → **Custom domains** → **Set up a
   custom domain**.
2. Si comprás el dominio en Cloudflare Registrar (precio costo, sin
   markup, ~$10/año `.com`), queda configurado automático.
3. Otros registrars: te dan instrucciones de DNS para agregar al panel
   donde tengas el dominio.

### Para el backend

Render free **no soporta custom domains** (es feature de los planes
pagos $7/mes). Si querés tu backend en `api.kairos.app`:

- Opción A: pagar Render Starter ($7/mes) — ahí podés agregar custom
  domain en Web Service.
- Opción B: usar **Cloudflare Workers** como proxy: creás un Worker
  en `api.kairos.app` que hace fetch a `kairos-api.onrender.com`. Free,
  unos ~100KB de código. (Si te interesa, te armo el snippet.)
- Opción C: dejar el backend en `kairos-api.onrender.com` y solo poner
  custom domain al frontend. Lo más simple.

---

## Patrones aprendidos

- **TiDB Cloud Serverless = MySQL drop-in.** Cambia el driver a usar
  TLS y listo. Las queries, los DECIMAL-como-string, las JSON columns,
  los ALTER ENUM raw — todo funciona idéntico a MySQL nativo.
- **HOST=0.0.0.0 en cualquier hosting que no sea tu PC.** Render,
  Railway, Fly, Oracle, todos lo necesitan.
- **PORT desde env var.** Render asigna el puerto dinámicamente, no
  podés hardcodear 3333.
- **CORS fail-closed en prod** (ya estaba en `config/cors.ts`): sin
  `CORS_ORIGIN`, niega todo. Te obliga a setearlo bien y evita una
  API abierta al mundo por descuido.
- **Keep-alive con UptimeRobot** es un patrón aceptado para Render
  free. No te bloquean por pinguear cada 5 min — al contrario, es lo
  que recomiendan si querés evitar cold starts.
- **`--no-tablespaces` en mysqldump** para TiDB / cualquier MySQL
  gestionado sin privilegio `PROCESS`. Sin este flag el dump falla
  con `Access denied`.
- **`npm ci --omit=dev` en el start command**, no en el build, para
  que devDependencies (vue-tsc, etc.) estén disponibles durante el
  build pero se descarten al runtime — bundle más liviano.

## Troubleshooting

### "Connection refused" desde Render hacia TiDB
- Verificar `DB_SSL=true`.
- Verificar puerto `4000` (no 3306).
- Verificar que el user de TiDB incluye el sufijo `.root` (ej.
  `2Nxxxx.root`, no solo `root`).

### CORS error en el browser
- Revisar `CORS_ORIGIN` en Render incluye **exactamente** el dominio
  de Cloudflare (con `https://`, sin `/` al final).
- Después de cambiar, **Manual Deploy** en Render (no toma efecto solo).

### Cold start eterno (>60s)
- Verificar UptimeRobot está pingueando (logs en su dashboard).
- Si pingó pero igual cold start: Render a veces hace deploys que
  rompen el keep-alive. Trigger un Manual Deploy y volver a probar.

### "Mixed content" warning
- `VITE_API_BASE_URL` debe ser `https://` (no `http://`). CF Pages
  sirve por HTTPS y bloquea requests HTTP.

### `Error: APP_KEY is required`
- Generar con `node ace generate:key` y pegarla en la env var de Render.
- Después de cambiarla, **Manual Deploy** y todos los usuarios se
  deslogean (es esperado, la APP_KEY firma los tokens).

## Próximos pasos opcionales

- **GitHub Actions CI**: workflow que corra `lint + typecheck + build`
  en cada PR.
- **Backups TiDB**: tier free no incluye backups automáticos, pero podés
  correr `mysqldump` desde tu compu cada tanto y guardar.
- **Migrar a Oracle Cloud / Hetzner**: si el cold start molesta y no
  querés pagar Render, ver el doc 17b (TODO si la usuaria lo pide).
