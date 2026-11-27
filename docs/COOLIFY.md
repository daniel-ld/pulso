# Despliegue en Coolify

Repositorio: `git@github.com:daniel-ld/pulso.git`. Rama de despliegue: `main`. Dominio: `https://pulso.samurai-suite.com`.

El MCP remoto se sirve en ese mismo dominio, ruta `/mcp`, por el Nginx de la app. No requiere otro recurso ni variables nuevas; conserva `APP_ORIGIN` exacto. El arranque aplica automáticamente la migración 3. El despliegue se activa por el webhook al actualizar `main`. Guía de clientes y autenticación: [MCP.md](MCP.md).

Objetivo: dos recursos visibles en Coolify, **PostgreSQL** y **monorepo Pulso**, con un solo subdominio para la app. Requiere repositorio Git accesible por Coolify, subdominio con DNS al servidor y capacidad libre para los contenedores. Revisa RAM y disco antes de construir en un servidor con otras aplicaciones.

## Recurso 1 · PostgreSQL

1. En tu proyecto de Coolify crea PostgreSQL 17 y una base `pulso` con su usuario y contraseña generados por Coolify.
2. Conserva la base privada: no habilites acceso público, dominio TCP ni publicación de puerto.
3. Copia la **URL interna** y anota el nombre de la red Docker del destino. La API debe pertenecer a esa misma red. Si la contraseña incluye caracteres especiales, utiliza la URL ya codificada proporcionada por Coolify.
4. Configura volumen persistente y respaldos automáticos con retención. El respaldo debe ir también a un destino externo al servidor. Prueba una restauración a una base independiente antes de confiar en la estrategia.

## Recurso 2 · Monorepo

1. Añade una Application conectada al repositorio Git de este directorio.
2. Selecciona el build pack Docker Compose, Base Directory `/` y Compose Location `/compose.coolify.yaml`.
3. Define las variables en Coolify:

| Variable | Valor |
| --- | --- |
| `APP_ORIGIN` | `https://pulso.samurai-suite.com` sin barra final; debe coincidir con el navegador |
| `DATABASE_URL` | URL interna del recurso PostgreSQL |
| `SETUP_KEY` | secreto aleatorio de al menos 32 caracteres; se usa para crear tu cuenta una vez |
| `COOLIFY_NETWORK` | red Docker del destino, por defecto `coolify`; verifica el nombre real |

Genera SETUP_KEY con el generador de secretos de Coolify o `openssl rand -hex 32`. No la guardes en el repositorio. `NODE_ENV=production` está fijado en Compose para que las cookies requieran HTTPS.

4. Asigna **solo al servicio `web`, puerto 80**, el dominio `https://pulso.samurai-suite.com`. Deja el campo de dominio vacío para `api`. No añadas port mappings al host.
5. Despliega. Compose construye dos imágenes desde el monorepo y la API aplica la migración inicial antes de pasar su healthcheck. Nginx espera una API saludable.
6. Comprueba que `web` y `api` estén sanos. Abre el dominio, crea tu cuenta con SETUP_KEY y una contraseña nueva y larga. El registro se cierra automáticamente al existir esa cuenta.
7. Abre la misma dirección en Mac y celular e inicia sesión con tu cuenta. Instala la PWA desde el navegador.

No publiques la instalación de demostración local ni su `.env`. Este Compose no ejecuta `seed-demo.mjs` y no incluye sus datos.

## Red

La red `application` es privada del monorepo. La red externa `COOLIFY_NETWORK` permite al proxy llegar a web y a la API llegar a PostgreSQL. No habilita por sí sola un endpoint público: solo `web` tiene dominio y ninguno de los servicios declara `ports` en producción. Los servicios que comparten la red externa del servidor pueden comunicarse internamente; para aislamiento más estricto usa una red dedicada compartida con el recurso de DB y ajusta Compose y el destino del proxy.

Coolify puede añadir redes o labels según su versión. Antes de desplegar comprueba el Compose final generado y la red efectiva. Mantén sin dominios ni puertos públicos a API y PostgreSQL. Si el destino usa otra red, cambia `COOLIFY_NETWORK`; no inventes una URL pública de DB para resolver conectividad.

## Verificación después del despliegue

- `GET https://pulso.samurai-suite.com/api/health` devuelve `{"status":"ok"}`.
- `/api/me` sin sesión devuelve 401.
- No hay puertos 3001 o 5432 publicados al host ni dominio independiente para la API.
- Las cookies de sesión tienen HttpOnly y Secure.
- Crea una tarea en Mac y comprueba que llegue al celular. Desconecta un dispositivo, edita, recarga y reconecta.
- Haz cambios simultáneos del mismo título para comprobar el diálogo de conflictos.
- Exporta JSON y comprueba el respaldo SQL externo y su restauración.

## Operación

Antes de actualizar, crea un respaldo de PostgreSQL. Despliega desde un commit conocido y conserva la imagen anterior. Una reversión de código no revierte automáticamente las migraciones: las nuevas migraciones deben ser compatibles o incluir un procedimiento de recuperación documentado.

La DB es un recurso separado: elimina o recrea los contenedores de la aplicación sin tocar su volumen. Conserva las variables DATABASE_URL, SETUP_KEY y el dominio en Coolify. La recuperación administrativa se describe abajo; conserva tus credenciales en un gestor y los respaldos completos.

### Recordatorios opcionales

Ejecuta `node scripts/generate-vapid.mjs` en el monorepo después de instalar dependencias. Genera `.env.push`, privado e ignorado por Git. Define un VAPID_SUBJECT real (por ejemplo `mailto:tu@dominio.com`) y copia VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT a las variables de Coolify. Nunca regeneres las claves sin considerar las suscripciones existentes. La app funciona sin ellas; el botón de activar avisos explicará que falta configuración.

En Ajustes activa avisos por dispositivo. En el editor añade fecha y hora del recordatorio. El worker del backend revisa tareas vencidas para notificar cada 30 segundos y registra entregas por tarea, recordatorio y suscripción. Las suscripciones expiradas se eliminan. Se admiten proveedores de Chrome, Firefox, Apple y Windows conocidos, no URLs de destino arbitrarias. La entrega depende de permisos, conectividad y políticas del navegador; no se presenta como alarma de precisión ni como canal garantizado.

Una repetición mueve la fecha y limpia el recordatorio puntual; configura otro para la siguiente ocurrencia. Los recordatorios de más de siete días de antigüedad no se entregan. En iPhone instala primero en pantalla de inicio y usa una versión compatible con Web Push. La revisión local no ha verificado push en teléfonos físicos.

### Recuperación administrativa

La recuperación por correo no está incluida. Si pierdes la contraseña, abre una terminal interactiva del servicio API en Coolify y ejecuta `node scripts/reset-password.mjs`. El script exige escribir RESTABLECER, genera una contraseña nueva y revoca las sesiones. La salida contiene la nueva contraseña: guárdala en tu gestor y no la compartas. En local el equivalente es `docker compose exec api node scripts/reset-password.mjs`. Este script no es un endpoint público y no se ejecuta durante los despliegues.

## Fuentes comprobadas

- [Compose desde repositorio](https://coolify.io/docs/applications/builds/docker-compose)
- [PostgreSQL e internal URL](https://coolify.io/docs/databases/postgresql)
- [Respaldos de bases](https://coolify.io/docs/databases/backups)

## Acceso al repositorio

La llave del Mac se usa para subir código y no debe copiarse al servidor. En Coolify conecta la GitHub App o crea una deploy key propia de solo lectura para este repositorio. Así Coolify puede descargar el monorepo sin usar tu llave personal. El origen del repositorio es GitHub, no GitLab.
