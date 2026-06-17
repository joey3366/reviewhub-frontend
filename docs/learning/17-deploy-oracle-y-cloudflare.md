# 17 · Deploy a producción (Oracle Cloud + Cloudflare Pages)

> Guía paso a paso para deployar Kairos a producción gratis:
> backend AdonisJS + MySQL en una VM **Oracle Cloud Always Free**
> (gratis para siempre, ARM 24GB RAM) y frontend Vue en
> **Cloudflare Pages** (CDN global, dominio HTTPS gratis).

## Pre-requisitos

- Repos pusheados a GitHub (backend `joey3366/reviewhub-backend`,
  frontend `joey3366/reviewhub-frontend`).
- `.env.example` actualizado en ambos repos (ya hecho en fase 6 pre-deploy).
- `public/_redirects` en frontend para Vue Router history mode (ya hecho).
- Builds production funcionando: `npm run build` en ambos repos.
- Tarjeta de crédito (Oracle la pide para verificar identidad —
  documentado que no cobra en el Always Free tier).

## Por qué Oracle Cloud Always Free

| Lo que ofrece | Cantidad |
|---|---|
| VMs ARM (Ampere A1) | hasta 4 (24GB RAM totales) |
| Block storage | 200 GB |
| Transferencia salida | 10 TB / mes |
| IPv4 pública estática | 2 |
| Duración | **Para siempre**, sin expirar |

Es **la única** opción real en 2026 que combina "gratis para siempre"
+ "MySQL persistente" + "control total de los datos". Railway, Render,
PlanetScale y Heroku rebajaron sus free tiers.

El trade-off es que el setup es manual (no es "subo el repo y listo"),
pero después no lo tocás más. Esta guía cubre todo el setup la primera
vez.

---

## Parte 1: alta de cuenta Oracle Cloud

1. Andá a https://signup.cloud.oracle.com/ y creá cuenta.
2. Elegí la región más cercana donde haya capacidad ARM:
   - **São Paulo (Brasil)** suele tener stock.
   - **Querétaro (México)** también.
   - US-East / EU-Frankfurt suelen estar llenos.
   - ⚠️ La región **no se puede cambiar después** sin crear otra cuenta.
3. Verificación con tarjeta — necesario, no se cobra en Always Free.
4. Confirmación por mail (~10 min).

## Parte 2: crear la VM ARM Always Free

1. Login a https://cloud.oracle.com/ → menú hamburguesa → **Compute** →
   **Instances**.
2. **Create Instance**:
   - Name: `kairos-prod` (o lo que quieras).
   - **Image**: cambiar a **Canonical Ubuntu 22.04** (la default
     puede ser Oracle Linux — Ubuntu es más estándar y los comandos
     de esta guía asumen Ubuntu).
   - **Shape**: cambiar a **Ampere** → elegir **VM.Standard.A1.Flex**
     → 4 OCPUs, 24 GB RAM (entra en Always Free).
   - **Networking**: dejar default (crea VCN automático).
   - **Add SSH keys**: elegir **Generate a key pair for me** y
     **descargar la private key** (`ssh-key-xxx.key`). Guardala en
     `~/.ssh/oracle-kairos.key` y dale permisos `chmod 600`.
3. **Create** → esperar ~1 min hasta que esté "Running".
4. Copiar la **Public IPv4** que aparece (ej. `129.xxx.xxx.xx`).

## Parte 3: abrir puertos en el firewall

Oracle tiene **dos** firewalls: el de la VCN (cloud) y el de Ubuntu
(iptables). Hay que abrir ambos.

### 3a. VCN (Oracle Cloud)

1. Menú → **Networking** → **Virtual Cloud Networks** → click en el
   VCN auto-creado.
2. Click en **Default Security List**.
3. **Add Ingress Rules** dos veces:
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port
     `80` (HTTP).
   - Idem con Destination Port `443` (HTTPS).
4. El puerto 22 (SSH) ya viene abierto por default.

### 3b. iptables en Ubuntu

SSH a la VM y abrir puertos:

```bash
ssh -i ~/.ssh/oracle-kairos.key ubuntu@<PUBLIC_IP>

# Abrir HTTP y HTTPS
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

> **Por qué dos firewalls:** Oracle pone una capa de seguridad cloud
> (VCN) que protege la VM aunque la VM tenga el firewall apagado.
> Ubuntu ARM trae iptables con reglas restrictivas por default. Si
> abrís solo uno, sigue cerrado el otro y nada llega.

## Parte 4: instalar dependencias en la VM

Conectado por SSH, correr:

```bash
# 1. Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# 2. Node.js 24 (LTS) — vía NodeSource (forma estándar)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Debería decir v24.x.x
npm --version

# 3. MySQL 8 server
sudo apt install -y mysql-server
sudo systemctl enable --now mysql

# 4. PM2 (process manager para mantener el backend corriendo)
sudo npm install -g pm2

# 5. nginx (reverse proxy para HTTPS)
sudo apt install -y nginx
sudo systemctl enable --now nginx

# 6. Certbot (Let's Encrypt para SSL gratis)
sudo apt install -y certbot python3-certbot-nginx

# 7. git (probablemente ya está, pero por las dudas)
sudo apt install -y git
```

## Parte 5: configurar MySQL

```bash
# Asegurar MySQL (cambia root password, remueve test db, etc.)
sudo mysql_secure_installation
# Respuestas:
#   Validate password component: NO (más simple, podés activarlo después)
#   New root password: <UNA QUE RECUERDES>
#   Remove anonymous users: Y
#   Disallow root login remotely: Y
#   Remove test database: Y
#   Reload privilege tables: Y

# Crear la base y el usuario de la app
sudo mysql -u root -p
```

Adentro del prompt de MySQL:

```sql
CREATE DATABASE kairos_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kairos'@'localhost' IDENTIFIED BY 'TU-PASSWORD-FUERTE-AQUI';
GRANT ALL PRIVILEGES ON kairos_prod.* TO 'kairos'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Cuidado:** la password del usuario `kairos` la vas a poner en el
> `.env`. Usá una larga y única (gestor de contraseñas), porque
> aunque MySQL solo escucha en localhost, una breach del backend
> daría acceso directo a la BD.

## Parte 6: importar la DB local

Esto se hace desde **tu compu**, no desde la VM.

### 6a. Exportar el dump local

```powershell
# En Windows, desde la carpeta donde tenés el backend
# (ajustar host/puerto/credenciales si tu MySQL local es distinto)
mysqldump -h 127.0.0.1 -P 3307 -u reviewhub -p reviewhub_dev `
  --routines --triggers --single-transaction `
  > kairos-dump.sql
```

Flags importantes:
- `--single-transaction`: hace el dump dentro de una transacción
  (BD consistente sin lockear tablas).
- `--routines --triggers`: incluye stored procedures y triggers si
  hubiera.

### 6b. Subir el dump a la VM

```powershell
scp -i ~/.ssh/oracle-kairos.key kairos-dump.sql ubuntu@<PUBLIC_IP>:~/
```

### 6c. Importar en MySQL de la VM

SSH de vuelta:

```bash
mysql -u kairos -p kairos_prod < ~/kairos-dump.sql
```

Verificar:

```bash
mysql -u kairos -p kairos_prod -e "SHOW TABLES; SELECT COUNT(*) FROM contents;"
```

Tenés que ver las 15 tablas y el conteo de contents.

## Parte 7: clonar y configurar el backend

```bash
# Clonar el repo (público o privado con HTTPS + token; SSH si tenés
# clave pública agregada a GitHub)
cd ~
git clone https://github.com/joey3366/reviewhub-backend.git
cd reviewhub-backend
npm ci
```

Crear el `.env` de producción:

```bash
cp .env.example .env
nano .env
```

Cambios respecto al `.env.example`:

```dotenv
TZ=America/Argentina/Buenos_Aires   # o tu zona
NODE_ENV=production
HOST=0.0.0.0                         # importante: escuchar en todas las interfaces
PORT=3333
LOG_LEVEL=warn                       # menos verbose en prod

APP_NAME=kairos-api
APP_KEY=<GENERAR ABAJO>
APP_URL=https://api.kairos.tu-dominio.com   # o la IP/dominio que tengas

SESSION_DRIVER=cookie

CORS_ORIGIN=https://kairos.pages.dev,https://kairos.tu-dominio.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306                         # MySQL nativo, NO 3307 (eso era Docker)
DB_DATABASE=kairos_prod
DB_USER=kairos
DB_PASSWORD=<LA QUE PUSISTE EN MYSQL>

LIMITER_STORE=database
```

Generar `APP_KEY`:

```bash
node ace generate:key
# Copiá la salida y pegala en APP_KEY=
```

Build:

```bash
npm run build
```

Eso crea `./build/` con el JS compilado.

## Parte 8: arrancar el backend con PM2

```bash
cd ~/reviewhub-backend/build
npm ci --omit=dev   # instala SOLO deps de prod

# Arrancar con PM2 (el .env del padre se hereda)
cp ../.env .
pm2 start bin/server.js --name kairos-api
pm2 save
pm2 startup   # imprime un comando — ejecutar el que te dé para que
              # PM2 arranque automático al reiniciar la VM
```

Test rápido:

```bash
curl http://localhost:3333/api/v1/contents
# Debería devolver JSON con la paginación
```

## Parte 9: nginx reverse proxy

Crear el server block:

```bash
sudo nano /etc/nginx/sites-available/kairos-api
```

Contenido (cambiar `tu-dominio.com` por el real, o usar IP si todavía
no tenés dominio):

```nginx
server {
    listen 80;
    server_name api.tu-dominio.com;

    client_max_body_size 10M;   # para uploads de avatares si fuera el caso

    location / {
        proxy_pass http://127.0.0.1:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activar y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/kairos-api /etc/nginx/sites-enabled/
sudo nginx -t                  # valida sintaxis
sudo systemctl reload nginx
```

Test:

```bash
# Desde tu compu
curl http://api.tu-dominio.com/api/v1/contents
# o
curl http://<PUBLIC_IP>/api/v1/contents
```

## Parte 10: SSL gratis con Let's Encrypt

> **Requisito:** ya tenés que tener el dominio apuntando a la IP de
> Oracle. Si todavía no lo tenés, saltá esta parte y volvé después
> (mientras tanto el backend funciona en HTTP).

```bash
sudo certbot --nginx -d api.tu-dominio.com
# Responder: email, aceptar términos, redirect HTTP → HTTPS: yes
```

Certbot modifica el `kairos-api` de nginx automáticamente y agrega
renovación cron. El cert dura 90 días y se renueva solo.

Test:

```bash
curl https://api.tu-dominio.com/api/v1/contents
```

---

## Parte 11: Frontend en Cloudflare Pages

### 11a. Alta de cuenta

1. https://dash.cloudflare.com/sign-up — crear cuenta (free).
2. Confirmar mail.

### 11b. Conectar el repo

1. Dashboard → **Workers & Pages** → **Create application** → **Pages**
   → **Connect to Git**.
2. Autorizar GitHub → seleccionar `reviewhub-frontend`.
3. Configurar build:

   | Campo | Valor |
   |---|---|
   | Project name | `kairos` (te queda `kairos.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | **Vue** |
   | Build command | `npm run build` |
   | Build output | `dist` |
   | Root directory | (dejar vacío) |
   | Node version | `24` (en env vars: `NODE_VERSION=24`) |

4. **Environment variables** (botón antes del deploy):

   ```
   VITE_API_BASE_URL=https://api.tu-dominio.com/api/v1
   VITE_CLOUDINARY_CLOUD_NAME=ddi0npc6d
   VITE_CLOUDINARY_UPLOAD_PRESET=reviewhub_covers
   NODE_VERSION=24
   ```

5. **Save and Deploy** → CF compila y deploya en ~2 min.
6. URL queda en `https://kairos.pages.dev`.

### 11c. Actualizar CORS del backend

Volver a SSH y editar el `.env`:

```bash
cd ~/reviewhub-backend
nano .env
# Cambiar CORS_ORIGIN a:
# CORS_ORIGIN=https://kairos.pages.dev,https://kairos.tu-dominio.com
```

Restart:

```bash
cd build
cp ../.env .
pm2 restart kairos-api
```

### 11d. Test end-to-end

1. Abrir `https://kairos.pages.dev`.
2. Signup con un usuario nuevo.
3. Verificar que el catálogo carga (ya tiene los contents importados).
4. Crear una watchlist.
5. Buscar algo en el navbar.
6. Logout / login.

Si la consola del browser muestra **CORS errors**: el `CORS_ORIGIN`
del backend no incluye el dominio del frontend, o no reiniciaste PM2.

Si muestra **mixed content** (HTTP en una página HTTPS): revisar
que `VITE_API_BASE_URL` sea `https://`, no `http://`.

---

## Parte 12: dominio custom (opcional pero recomendado)

### Para el frontend

1. Cloudflare Pages → tu proyecto → **Custom domains** → **Set up a
   custom domain**.
2. Si comprás el dominio en Cloudflare Registrar, queda configurado
   automático. Si lo comprás en otro lado (Namecheap, etc.), seguí
   las instrucciones de DNS que te dé.

### Para el backend (API)

1. En el panel DNS de tu dominio, agregar registro **A**:
   - Nombre: `api`
   - Valor: la IP pública de Oracle
   - TTL: 1 hora
2. Esperar propagación (~10 min).
3. Volver a SSH y correr el certbot (parte 10) si todavía no lo hiciste.

---

## Patrones aprendidos

- **Doble firewall en Oracle (VCN + iptables).** Si abrís solo uno,
  parece que la VM no responde. Comprobalo desde adentro con `curl
  localhost:3333` antes de pensar que el backend está roto.
- **HOST=0.0.0.0 en producción.** En dev usamos `localhost` (loopback),
  que solo acepta conexiones desde la misma máquina. En prod necesitamos
  escuchar en todas las interfaces para que nginx pueda hacer proxy.
- **PM2 startup + save.** Sin `pm2 save && pm2 startup` (y ejecutar
  el comando que imprime), si la VM se reinicia el backend NO arranca
  solo. Te despertás con el sitio caído.
- **CORS fail-closed en prod.** El `config/cors.ts` ya está bien:
  sin `CORS_ORIGIN` en prod, **niega todos los origins** en lugar
  de wildcard. Eso te obliga a recordar configurarlo bien y evita
  deployar sin querer una API abierta a todo internet.
- **MySQL local listen solo en 127.0.0.1.** Default de Ubuntu. Aunque
  alguien rompiera el firewall, MySQL no acepta conexiones remotas
  por configuración. El backend conecta via socket local.
- **Cloudinary unsigned uploads** ya están configurados con
  restricciones de tamaño y formato en el panel — no hay nada que
  cambiar en prod, mismo `cloud_name` y preset que en dev.

## Próximos pasos opcionales

- **GitHub Actions CI**: agregar workflow que corra `lint + typecheck +
  build` en cada PR. Evita pushear código que no compila.
- **Monitoring**: `pm2 monit` te da un dashboard ASCII; UptimeRobot
  (gratis) te avisa por mail si el sitio se cae.
- **Backup MySQL automático**: cron diario que haga `mysqldump` y
  lo suba a un bucket gratis (R2 de Cloudflare = 10GB free).
- **Custom domain de pago**: Cloudflare Registrar vende dominios a
  precio costo (sin markup) — `.com` ~$10/año.
