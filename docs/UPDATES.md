# Actualizaciones sin caché

Desde el 27 de noviembre de 2026, por decisión del propietario, Pulso no guarda el shell de la PWA ni sus assets en caché. Abrir o recargar necesita red. Con la app ya abierta, IndexedDB y la cola de cambios siguen permitiendo guardar tareas durante una desconexión y sincronizarlas después.

## Recuperar una instalación anterior

Abrir https://pulso.samurai-suite.com/refresh en la misma PWA o navegador afectado. También está disponible en Ajustes → Actualizar aplicación. La página no depende de React ni del bundle antiguo: registra/actualiza el worker con `updateViaCache: none`, solicita su activación y verifica por MessageChannel que la versión activa no cachea. Si falla, muestra un error y permite reintentar; no anuncia éxito sin verificar. Al terminar abre el espacio con un identificador del build. Después iniciar una conexión nueva desde Muse u otro asistente (una solicitud anterior puede haber vencido).

No se borran tareas, operaciones pendientes, cookies, preferencias ni registros de service worker. Se conserva el registro para no invalidar las suscripciones Web Push. Solo se eliminan entradas CacheStorage con prefijo `pulso-`. La respuesta `/refresh` añade `Clear-Site-Data: "cache"` para limpiar HTTP cache en navegadores compatibles; nunca solicita `storage`, `cookies` ni `*`.

## Política del servidor

Nginx aplica `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `CDN-Cache-Control: no-store` y `Cloudflare-CDN-Cache-Control: no-store` a documentos, scripts, estilos y recursos. Se retira el año de caché immutable anterior. El worker no tiene manejador fetch ni precache: solo notificaciones, migración y consulta de versión. El digest del build fuerza una nueva versión cuando cambia el código generado. `skipWaiting` y `clients.claim` evitan quedar esperando al cierre de todas las ventanas. La migración vuelve a navegar solo ventanas OAuth, manteniendo state/PKCE y sin conceder permisos. Las ventanas normales no se recargan automáticamente para preservar borradores abiertos.

Los encabezados nuevos no pueden invalidar por sí solos respuestas ya almacenadas por un intermediario con reglas propias. Si Cloudflare tiene una regla que fuerza caché ignorando el origen, excluir el dominio y purgar esa caché. Comprobar `curl -I` sobre `/`, `/refresh`, `/sw.js` y un asset real después del despliegue. No desactivar TLS ni los requisitos de OAuth.

Referencias: [MDN Clear-Site-Data](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data), [skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting).
