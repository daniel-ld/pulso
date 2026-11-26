# Pulso

Gestor personal de tareas, instalable en Mac y celular. Monorepo con React, Fastify y PostgreSQL, preparado para alojarse en tu servidor con Coolify. Nombre provisional: Pulso.

Repositorio: [daniel-ld/pulso](https://github.com/daniel-ld/pulso). Dominio previsto: `https://pulso.samurai-suite.com`. La aplicación aún no está desplegada en ese dominio; la versión local está en http://localhost:4173.

## Desarrollo por etapas

El alcance, decisiones y comprobaciones se mantienen en [docs/PROGRESS.md](docs/PROGRESS.md). Cada etapa diferencia implementación de validación. La primera entrega es una versión funcional independiente de Todoist; no se reutiliza su código ni sus recursos gráficos.

1. Arquitectura, monorepo y despliegue de entrada única.
2. Cuenta personal y organización de tareas.
3. Persistencia local, sincronización y recuperación.
4. Lista, tablero, calendario, filtros y PWA.
5. Pruebas, documentación operativa y preparación para Coolify.

## Arranque local con Docker

Requisitos: Docker Desktop y Node.js 24.14 o superior para los scripts locales.

```sh
node scripts/configure-local.mjs
docker compose up -d --build web
```

Abre **http://localhost:4173**. En el primer acceso crea la única cuenta personal usando `SETUP_KEY` de `.env`. Los secretos se generan aleatoriamente y `.env` está excluido del repositorio y del contexto Docker. El PostgreSQL local se conserva en un volumen nombrado. Solo la web publica un puerto, vinculado a `127.0.0.1`.

### Demostración local opcional

```sh
npm run demo
```

Crea una cuenta y ejemplos únicamente si la base local está vacía. Correo: `demo@pulso.local`. Contraseña de prueba: `Pulso-local-demo-2026!`. Es una instalación de demostración vinculada al loopback: **no usar estas credenciales en un servidor público**. El script se niega a ejecutarse si `APP_ORIGIN` no es exactamente `http://localhost:4173`. No modifica una cuenta existente. El despliegue de producción crea una cuenta nueva y no ejecuta este script.

## Comandos

```sh
npm ci
npm run typecheck
npm test
npm run build
docker compose --profile test run --build --rm test
docker compose --profile test stop test-db
docker compose logs --tail 50 api
docker compose stop
```

Para crear un respaldo SQL local: `node scripts/backup-local.mjs`. Se guarda en `backups/` con permisos privados. Las copias JSON de Ajustes permiten recuperar contenido en la cuenta; el respaldo SQL conserva también sesiones, esquema y configuración persistida.

La suite de integración utiliza un PostgreSQL separado, desechable y sin puerto publicado. Nunca utiliza la base principal. Para reiniciarla entre ejecuciones puedes usar `docker compose --profile test rm -sf test-db`; no elimina el volumen de tus tareas. No uses `docker compose down -v` para detener la aplicación: elimina los datos locales.

## Estructura

```text
apps/web          React, interfaz, IndexedDB, PWA
apps/api          Fastify, autenticación, reglas y sincronización
packages/shared   Contratos, validación, recurrencia y filtros
infra             Dockerfiles y gateway Nginx
tests             Pruebas de dominio e integración
docs              Arquitectura, etapas y operación de Coolify
compose.yaml      Entorno local y perfil de pruebas
compose.coolify.yaml   Monorepo para producción; DB como recurso separado
```

## Funciones y uso

Proyectos y secciones organizan tareas con subtareas, prioridades P1–P4, etiquetas, descripción, fecha programada y fecha límite. Hoy muestra las tareas de hoy y atrasadas; Próximo agrupa las futuras. Las vistas de lista, tablero y calendario comparten los mismos registros. Se puede arrastrar para reordenar tareas, cambiar sección en tablero o reprogramar en calendario; en celular usa el editor como alternativa accesible.

`Q` abre una tarea y `⌘K` o `Ctrl+K` enfoca la búsqueda. El botón Detectar del editor reconoce `hoy`, `mañana`, `p1`–`p4`, `#Nombre del proyecto` y `cada día/semana/mes`. La detección es deliberadamente explícita para que puedas revisar los atributos antes de guardar.

Las repeticiones se calculan desde la fecha prevista o desde el día de finalización. En repetición mensual se conserva el día original, ajustándolo al último día disponible. Las ocurrencias atrasadas se saltan hasta la siguiente fecha futura. Una repetición mantiene su tarea activa y registra su finalización en el historial del servidor.

Filtros: `hoy & p1`, `vencidas | p2`, `!p1 & texto:leer`, `sin fecha`, `proyecto:UUID`, `etiqueta:UUID`. `&` tiene prioridad sobre `|`. Sin paréntesis ni parser completo de Todoist. Los tokens desconocidos no coinciden con tareas.

## Datos y acceso

La cuenta se crea una sola vez; no hay registro público. Las sesiones usan cookies HttpOnly y Secure en producción, con expiración a 30 días. El almacenamiento local es específico de la cuenta. Sin conexión puedes seguir usando un espacio previamente abierto. Si la sesión expira, vuelve a iniciar sesión con la misma cuenta para enviar los cambios: no borres los datos del navegador.

Los recordatorios Web Push están implementados como función opcional. Requieren claves VAPID, un destino de contacto y permiso del navegador; consulta la configuración en docs/COOLIFY.md. Las tipografías y los iconos se sirven desde la propia aplicación, también sin conexión.

En Ajustes puedes exportar un respaldo JSON versionado que incluye registros, operaciones pendientes y alternativas de conflictos. La restauración combina los registros con la misma cuenta; no borra otros elementos. Consulta las limitaciones detalladas en [la arquitectura](docs/ARCHITECTURE.md).

## Desplegar

Sigue [docs/COOLIFY.md](docs/COOLIFY.md). Solo el servicio `web` recibe dominio. La API se consume por `/api` en el mismo origen; PostgreSQL y la API no publican puertos propios. La sincronización compara versiones; no requiere una URL de API ni un WebSocket público adicional.
