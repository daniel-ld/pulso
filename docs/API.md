# Contrato HTTP

La API de la aplicación está bajo `/api/*`, en el mismo origen de la app. Sus escrituras requieren JSON y `Origin` igual a APP_ORIGIN. Las rutas privadas requieren cookie `pulso_session`. Las respuestas privadas no se cachean.

El MCP remoto tiene un contrato de autenticación separado mediante bearer/OAuth en `/mcp`; no sustituye las cookies de las rutas web. Endpoints OAuth y gestión privada de conexiones: [MCP.md](MCP.md).

| Ruta | Uso |
| --- | --- |
| GET `/api/health` | Salud del backend y conectividad de PostgreSQL |
| GET `/api/auth/status` | Indica si falta crear la primera cuenta |
| POST `/api/auth/setup` | `{name,email,password,setupKey}`; solo la primera cuenta |
| POST `/api/auth/login` | `{email,password}`; establece cookie HttpOnly |
| GET `/api/me` | Identidad de sesión |
| POST `/api/logout` | Invalida sesión actual |
| GET `/api/sync/snapshot` | Estado completo y cursor consistente |
| GET `/api/sync/pull?cursor=0` | Hasta 500 cambios ordenados por secuencia numérica, cursor y hasMore |
| POST `/api/sync/push` | `{operations,timeZone}`; aplica lote atómico de hasta 100 operaciones |
| GET `/api/activity` | Últimas 100 finalizaciones |
| GET `/api/notifications/key` | Clave VAPID pública o null si no está configurada |
| POST `/api/notifications/subscribe` | Suscripción Push del dispositivo autenticado |
| POST `/api/notifications/unsubscribe` | `{endpoint}`; retira la suscripción del propietario |

## Operaciones

```json
{
  "id": "UUID de operación",
  "entityId": "UUID estable de registro",
  "type": "task",
  "action": "put",
  "baseVersion": 3,
  "base": {"title":"Título anterior"},
  "patch": {"title":"Título nuevo"}
}
```

`type`: task, project, section, label o filter. `action`: put, delete, complete o restore. Una creación usa baseVersion 0 y los campos completos requeridos. Complete se usa solo en tareas y añade `occurrence`, la fecha programada conocida por ese dispositivo (null para una tarea sin fecha). Restore es explícito y requiere la versión actual del tombstone.

Respuesta por operación: operationId, status (`ok` o `conflict`), entity y, en conflicto, fields. El mismo UUID ya aplicado devuelve su resultado anterior sin repetir efectos. Un conflicto de versión no se registra como operación aplicada: debe resolverse y reenviarse con nuevo UUID y nueva base. Las validaciones de dominio responden 400/409 y hacen rollback del lote; el cliente conserva la operación rechazada y permite recuperar la versión del servidor desde Ajustes. Los errores de conexión o sesión conservan la cola sin descartarla.

## Evolución

Los contratos de entidad están en packages/shared/src/index.ts. Las próximas versiones deben mantener lectura de respaldos anteriores y migrar explícitamente IndexedDB, base de datos y el formato JSON. No se debe compactar el historial de cambios sin añadir un protocolo de cursor expirado y snapshot de recuperación.
