# Diagnóstico OAuth MCP — Muse / PWA

Revisión del 27 de noviembre de 2026. Endpoint MCP: `https://pulso.samurai-suite.com/mcp`. Scopes sin cambios: `pulso:read pulso:write`.

## Hallazgos y límites de la evidencia

En producción, una llamada inválida a `/oauth/authorize` devuelve JSON 400 del backend, no HTML de “Hoy”. Una solicitud con cliente registrado y PKCE devuelve 302 hacia `/connect/mcp?connect=…`; esa pantalla se verificó en navegador y muestra el cliente, los dos permisos y las acciones de conexión. Por tanto, la hipótesis de que Nginx envía actualmente toda ruta OAuth al SPA no coincide con esas comprobaciones.

Se encontró un problema de aislamiento en el service worker anterior: interceptaba cualquier navegación, incluidas las rutas OAuth, seguía redirecciones mediante `fetch` y devolvía su HTML. Esto puede entregar el documento final manteniendo una URL de entrada diferente. Si ese documento se ejecuta bajo `/oauth/authorize`, el frontend anterior no distinguía esa ruta y podía abrir el espacio de tareas. No se observó la sesión fallida original de Muse; este recorrido se protege por el informe aportado, el código y pruebas de regresión del worker.

La distinción entre URL de respuesta y URL de navegación está documentada en [MDN: FetchEvent.respondWith](https://developer.mozilla.org/en-US/docs/Web/API/FetchEvent/respondWith). La prueba HTTP por sí sola no cubre la navegación controlada por una PWA instalada.

## Corrección

- El service worker deja al navegador/red gestionar `/oauth/*`, `/mcp`, `/.well-known/*`, `/api/*` y las páginas de consentimiento. No usa el shell offline de tareas para ellas.
- Para otras navegaciones, si la red redirige, el worker devuelve una redirección explícita en vez de guardar su HTML bajo `/`.
- La versión de caché considera también el contenido del worker y del arranque de tema, no solo los nombres de assets.
- Nginx separa los prefijos completos OAuth, MCP y well-known del fallback SPA.
- Si una PWA con el worker antiguo entrega el frontend bajo `/oauth/authorize`, el frontend ya no puede mostrar “Hoy”: recupera los parámetros mediante `GET /api/auth/mcp-start` y navega a la pantalla dedicada.
- La recuperación reutiliza la validación del endpoint normal: cliente registrado, retorno exacto, scopes, recurso y PKCE S256. Conserva `state` y no concede acceso. `/api` ya era network-only con el worker anterior.
- Otros endpoints técnicos, si reciben HTML por un intermediario antiguo, muestran un aviso contextual en el frontend, nunca el workspace. El login y la autorización siguen sin abrir IndexedDB ni sincronizar tareas.

## Matriz de comprobación

| Punto | Resultado requerido/verificado |
| --- | --- |
| Metadata AS y protected resource | JSON con origen, recurso, scopes y endpoints correctos |
| Registro dinámico | 201 JSON con client ID; métodos none, client_secret_post y client_secret_basic |
| Authorize válido | 302 a `/connect/mcp?connect=…`, seguido de pantalla de login/consentimiento |
| Sin sesión | Login propio; la solicitud continúa después, sin autorización implícita |
| Autorizar | Callback registrado con código de un uso y el mismo `state` |
| Denegar | Callback registrado con `error=access_denied`, mismo `state` y sin código |
| Token | JSON con bearer, vencimiento y scope; exige el verificador PKCE correcto |
| Revocar | 200 para el cliente autenticado; invalida solicitudes posteriores |
| MCP sin token | 401 con descubrimiento en `WWW-Authenticate` |
| MCP con token | Cliente SDK oficial negocia el protocolo y obtiene herramientas |

La prueba de ejemplo con `client_id=TEST` y sin `code_challenge`/`code_challenge_method` debe fallar; no debe mostrar consentimiento ni crear un código. Para una prueba válida hay que registrar primero el cliente y enviar PKCE S256. No se relajó este requisito para adaptar la prueba.

## Evidencia automatizada

- 11 pruebas de dominio, tema y service worker.
- 18 pruebas de integración sobre PostgreSQL desechable.
- El recorrido nuevo usa exactamente `https://agent.meta.ai/api/hatch/oauth/callback`, conserva un `state` con caracteres especiales, autoriza, intercambia el código y llama al MCP mediante el SDK oficial. También comprueba denegación, PKCE ausente y retorno no registrado.
- Ese callback se comprobó como destino en las respuestas de la base de pruebas: no se hicieron peticiones a Meta ni se autorizó una cuenta externa.
- La entrada real `/oauth/authorize?...` se revisó en el navegador local y terminó en `/connect/mcp` con dos permisos visibles. No se pulsó Permitir acceso durante esa revisión.

La validación dentro de la sesión concreta de Muse requiere iniciar una conexión nueva desde Muse y autorizarla como propietario. No se compartieron claves ni se usaron tokens de producción para estas pruebas.
