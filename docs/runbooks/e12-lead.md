# Runbook E12 para el lead

Pasos manuales que E12 deja preparados y **no** ejecutó: desplegar E12,
pasar producción a `deploy.sh`, activar los backups fuera del VPS y, más
adelante, publicar el sandbox. Detalle técnico en
[../19-operations-e12.md](../19-operations-e12.md).

Reglas de siempre: en el VPS, `cd ~/rotaract-app`; un solo `next build` a la
vez y con la máquina tranquila (`pgrep -f "next build"` antes); backup antes
de tocar la base.

## 0. Desplegar E12 (a la manera de siempre)

```bash
scripts/backup-postgres.sh
docker compose build api worker web developers-portal   # de a uno si hay poca RAM
docker compose run --rm migrate                          # 20261005110000_status_e12 (sólo agrega)
docker compose up -d api worker web developers-portal
```

Verificar:

```bash
curl -s https://api.rotaract4845.com/api/kernel/v1/status | head -c 300
# a los 1–2 minutos los componentes pasan de UNKNOWN a OPERATIONAL
open https://developers.rotaract4845.com/estado
# Mi Rotaract → Distrito → Estado (como RDR o superadmin)
```

## 1. Pasar producción a despliegues sin corte (una vez)

Corta api y web **1–2 segundos** en el momento del cambio. Hacerlo en
horario bajo.

```bash
git pull                                     # con E12 mergeado
docker compose build api web                 # imágenes rotaract-app-api / -web
scripts/deploy.sh --cutover --skip-build --skip-migrate
```

El script arranca `api-blue` y `web-blue`, espera que estén sanos, detiene
los contenedores `api`/`web` clásicos y levanta `edge` en 127.0.0.1:3000 y
:3001. cloudflared no se toca.

Verificar:

```bash
curl -s 127.0.0.1:3001/health/ready
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:3000/login
docker compose -f docker-compose.yml -f infra/deploy/compose.zero-downtime.yml \
  exec edge wget -qO- 127.0.0.1:8080/edge-active     # api=api-blue:3001 web=web-blue:3000
docker logs --tail 20 rotaract-app-meetings-api-1    # sigue sincronizando contra http://api:3001
```

Después, para que `docker compose ps/logs/up` vean el overlay, agregar al
`.env`:

```
COMPOSE_FILE=docker-compose.yml:infra/deploy/compose.zero-downtime.yml
```

Volver atrás (≈ 5 s de corte):

```bash
docker compose -f docker-compose.yml -f infra/deploy/compose.zero-downtime.yml stop edge api-blue api-green web-blue web-green
docker compose -f docker-compose.yml up -d api web
# y sacar COMPOSE_FILE del .env
```

### Releases a partir de ahí

```bash
git pull
docker compose build api web worker   # antes, con la máquina tranquila (opcional: deploy.sh también construye)
scripts/deploy.sh api worker web      # backup + migración + cambio de slot sin corte
scripts/deploy.sh developers-portal   # el portal se recrea (segundos de corte)
scripts/deploy.sh --rollback api      # si algo anda mal después del deploy
```

Las migraciones tienen que ser compatibles hacia atrás (expand/contract):
la versión vieja sigue atendiendo mientras se aplican.

## 2. Backups fuera del VPS

1. **rclone** (sin sudo):

   ```bash
   mkdir -p ~/.local/bin && cd /tmp
   curl -fsSLO https://downloads.rclone.org/rclone-current-linux-amd64.zip
   python3 -c "import zipfile;zipfile.ZipFile('rclone-current-linux-amd64.zip').extractall('.')"
   cp rclone-*-linux-amd64/rclone ~/.local/bin/ && ~/.local/bin/rclone version
   ```

2. **Remoto** (ejemplo Cloudflare R2: crear un bucket `rotaract-backups` y
   un token de API con permiso de escritura sólo sobre ese bucket):

   ```bash
   ~/.local/bin/rclone config create r2 s3 provider=Cloudflare \
     access_key_id=XXX secret_access_key=YYY \
     endpoint=https://<account-id>.r2.cloudflarestorage.com acl=private
   ~/.local/bin/rclone lsd r2:rotaract-backups
   ```

   Google Drive o S3 también sirven (`rclone config`).

3. **Passphrase y configuración**:

   ```bash
   mkdir -p ~/.config/rotaract-backup && chmod 700 ~/.config/rotaract-backup
   openssl rand -base64 32 > ~/.config/rotaract-backup/passphrase
   chmod 600 ~/.config/rotaract-backup/passphrase
   cat > ~/.config/rotaract-backup/env <<'EOF'
   RCLONE_REMOTE=r2:rotaract-backups/vps
   RCLONE_BIN=/home/equipoit/.local/bin/rclone
   EOF
   ```

   **Guardar la passphrase en el gestor de contraseñas del distrito.** Si
   se pierde junto con el VPS, los backups no sirven.

4. **Probar**:

   ```bash
   scripts/backup-offsite.sh     # termina con "uploaded rotaract-...tar.gpg"
   scripts/restore-drill.sh      # termina con "RESULTADO: OK"
   ```

5. **Cron** (`crontab -e`), junto a la línea de 03:30 que ya existe:

   ```cron
   45 3 * * * /home/equipoit/rotaract-app/scripts/backup-offsite.sh >> /home/equipoit/backups/rotaract/offsite.log 2>&1
   30 5 1 * * /home/equipoit/rotaract-app/scripts/restore-drill.sh >> /home/equipoit/backups/rotaract/drill.log 2>&1
   ```

   Revisar `drill.log` el día 1 de cada mes: `RESULTADO: FALLÓ` es un
   incidente.

## 3. Publicar el sandbox (cuando haya RAM)

Ocupa ~300 MB (API + Postgres + NATS) y ~130 MB más con la web. Con
producción, Reuniones y mi-rotaract la máquina queda con ~1 GB libre:
medir con `free -m` antes, y no construir mientras corre.

```bash
infra/sandbox/sandbox.sh init-env          # infra/sandbox/.env con secretos nuevos
# revisar SANDBOX_TEST_PASSWORD (se publica) y SANDBOX_ADMIN_PASSWORD (secreta)
infra/sandbox/sandbox.sh build --web       # imágenes mirotaract-sandbox/*
infra/sandbox/sandbox.sh up --web          # migra, siembra, foto dorada, arranca (3011/3010)
curl -s 127.0.0.1:3011/health/ready
```

DNS e ingress (igual que developers.rotaract4845.com): en
`~/.cloudflared/config.yml` del túnel de rotaract4845.com, antes del 404
final,

```yaml
- hostname: api.sandbox.rotaract4845.com
  service: http://127.0.0.1:3011
- hostname: sandbox.rotaract4845.com
  service: http://127.0.0.1:3010
```

y `TUNNEL_ORIGIN_CERT=~/.cf-rotaract/.cloudflared/cert.pem cloudflared tunnel route dns <túnel> api.sandbox.rotaract4845.com`
(lo mismo para `sandbox.rotaract4845.com`), luego reiniciar el servicio de
cloudflared.

Después:

- en el `.env` de producción,
  `KERNEL_STATUS_PROBE_SANDBOX_URLS=https://api.sandbox.rotaract4845.com/health/ready`
  y `scripts/deploy.sh worker` (aparece en /estado);
- cron del reseteo: `15 4 * * * /home/equipoit/rotaract-app/infra/sandbox/sandbox.sh reset >> /home/equipoit/logs/sandbox-reset.log 2>&1`;
- en `docs/developers/sandbox.md`, quitar "todavía no publicado" y publicar
  la contraseña de las cuentas de prueba.
