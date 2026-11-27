# MCP remoto de Pulso

URL de producción: **https://pulso.samurai-suite.com/mcp**

Pulso expone un servidor MCP con **Streamable HTTP**, respuestas JSON y autenticación. Vive en la API existente, detrás de Nginx, en el mismo subdominio de la aplicación. No requiere un contenedor, base de datos, subdominio o secreto de instalación adicional. La migración 3 crea las tablas de conexiones y OAuth al arrancar.

## Conectar un asistente

El cliente debe admitir MCP remoto HTTP y OAuth o cabeceras Bearer. No basta con que sea un chat de IA. Los clientes exclusivamente stdio o SSE antiguo necesitan un puente compatible; no se anuncia compatibilidad verificada con cada producto o plan.

### OAuth: opción para asistentes con inicio de sesión

1. En el asistente añade un servidor MCP remoto con la URL indicada, sin barra final.
2. Selecciona OAuth y registro automático de cliente (Dynamic Client Registration). Pulso publica el descubrimiento necesario. No necesitas copiar tu contraseña ni un token al asistente.
3. Se abrirá la pantalla dedicada de conexión en Pulso (`/connect/mcp?connect=…`). Muestra el asistente, los permisos y la URL de retorno incluso sin sesión. Si hace falta, inicia sesión en el formulario de esa pantalla; la solicitud se conserva. Después revisa los permisos y pulsa **Permitir acceso**. Iniciar sesión por sí solo no autoriza la conexión.
4. Regresa al asistente y activa las herramientas.

En Claude, usa la configuración de conectores remotos. Si aparece la opción de identidad del cliente, elige **Register automatically / Registrar automáticamente**. Este servidor soporta registro dinámico, no documentos de identidad de cliente remotos (CIMD). Guía del proveedor: [conectores MCP remotos](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Para Claude Code:

```sh
claude mcp add --transport http pulso https://pulso.samurai-suite.com/mcp
```

Después usa `/mcp` para autenticar la conexión. [Documentación de Claude Code](https://code.claude.com/docs/en/mcp).

En ChatGPT añade el servidor desde la función de MCP/plugins personalizados disponible en tu cuenta, usando OAuth y la misma URL. La ubicación y disponibilidad dependen de la cuenta y de los controles del espacio de trabajo; consulta la [guía oficial para conectar y probar](https://developers.openai.com/plugins/deploy/connect-chatgpt). Las herramientas `search` y `fetch` también están disponibles para recuperación de información.

Para Muse u otro cliente, usa su configuración de MCP HTTP remoto. Si admite OAuth con registro dinámico, usa ese flujo; si admite una cabecera de autenticación, usa un token de Pulso. No se probó una sesión real en cada uno de estos productos.

### Token: opción para clientes con Bearer

1. Abre Pulso → **Ajustes y respaldos → Asistentes de IA → Crear token de acceso**.
2. Indica un nombre y el permiso: **Solo consultar** o **Consultar y gestionar tareas y proyectos**.
3. Copia el token mostrado una sola vez. Caduca a los 90 días. Se guarda únicamente su hash en el servidor.
4. Configura en el cliente una cabecera `Authorization: Bearer <token>` para el endpoint MCP. No lo incluyas en una URL ni lo pegues en conversaciones.

Ejemplo de configuración genérica (la forma exacta depende del cliente):

```json
{
  "mcpServers": {
    "pulso": {
      "type": "http",
      "url": "https://pulso.samurai-suite.com/mcp",
      "headers": { "Authorization": "Bearer <TOKEN_PRIVADO>" }
    }
  }
}
```

El JSON es un ejemplo; sustituye el marcador de forma privada en el cliente, nunca en el repositorio. Si un cliente exige client ID y secreto OAuth propios, puede registrar su callback exacto mediante `POST /oauth/register` con `token_endpoint_auth_method` igual a `client_secret_post` o `client_secret_basic`. Los clientes públicos usan `none`.

## Permisos y revocación

- `pulso:read`: seis herramientas de consulta; búsqueda y lectura incluyen únicamente registros del propietario, incluido el estado de papelera al obtener un registro por ID.
- `pulso:write`: añade nueve herramientas de gestión. Incluye lectura y no permite administrar la cuenta, sesiones, credenciales, respaldos ni notificaciones.
- Toda conexión aparece en Ajustes con nombre, permiso, método y último uso. **Revocar** impide nuevas solicitudes inmediatamente; las operaciones que ya estaban en ejecución pueden terminar.
- OAuth usa Authorization Code + PKCE S256, retornos registrados exactos, códigos de un uso (2 minutos), acceso de 15 minutos y refresh tokens rotatorios de 30 días. Una reutilización de refresh token revoca toda esa conexión.
- Las solicitudes de consentimiento expiran en 10 minutos. No existe consentimiento automático por haber aprobado otra conexión antes. El nombre del cliente lo declara ese cliente; la pantalla muestra también el destino real.
- La recuperación administrativa de contraseña revoca las conexiones MCP además de cerrar las sesiones web.

## Herramientas

| Herramienta | Función |
| --- | --- |
| `pulso_list_tasks` | Tareas pendientes o completadas, filtros por proyecto, etiqueta, padre, prioridad, texto y rango de fechas; paginación por UUID |
| `pulso_list_projects` | Proyectos (incluidos los archivados), IDs y versiones; hasta 500 |
| `pulso_list_labels` | Etiquetas, IDs y versiones; hasta 500 |
| `pulso_list_sections` | Secciones, opcionalmente por proyecto; hasta 500 |
| `search` | Buscar hasta 50 registros por texto, con IDs y enlaces |
| `fetch` | Obtener un registro completo por UUID, versión y estado de papelera |
| `pulso_create_task` | Crear tarea o subtarea; usa la bandeja si se omite proyecto |
| `pulso_update_task` | Cambiar solo los campos indicados |
| `pulso_complete_task` | Completar y avanzar recurrencia según la zona horaria |
| `pulso_reopen_task` | Reabrir sin retroceder una recurrencia |
| `pulso_save_project` | Crear o editar un proyecto |
| `pulso_save_label` | Crear o editar una etiqueta |
| `pulso_save_section` | Crear o editar una sección |
| `pulso_move_to_trash` | Borrado recuperable de un registro, respetando dependencias |
| `pulso_restore_record` | Recuperar un registro de la papelera |

Las escrituras exigen `requestId` de 8–128 caracteres (por ejemplo, un UUID). El cliente conserva esa clave en un reintento y genera otra para una acción diferente. Editar, completar, borrar o recuperar exige `expectedVersion`, obtenida por consulta: una versión antigua produce un error en vez de sobrescribir cambios recientes. Para crear con `pulso_save_*`, se omite ID y se envían los campos requeridos.

Las fechas civiles usan `YYYY-MM-DD`; prioridad 1 es la más alta y 4 la normal. `pulso_complete_task` usa `America/Mexico_City` por defecto y admite otra zona IANA. Las mismas validaciones, bloqueo transaccional, ledger de operaciones y flujo de cambios que usa la app protegen el MCP. La app recibe esos cambios al sincronizar.

## Rutas y operación

- `/mcp`: POST autenticado; GET/DELETE autenticados devuelven 405 porque no hay sesiones HTTP persistentes. Sin credencial devuelve 401 con `WWW-Authenticate` y descubrimiento. Abrirlo en el navegador no muestra una página de gestión.
- `/.well-known/oauth-protected-resource/mcp` y `/.well-known/oauth-protected-resource`: recurso y servidor de autorización.
- `/.well-known/oauth-authorization-server`: endpoints y capacidades OAuth.
- `/oauth/register`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`: registro, autorización, intercambio/renovación y revocación.
- `/connect/mcp?connect=…`: pantalla de login y consentimiento. La URL completa se genera desde el asistente; abrir la ruta sin solicitud muestra una explicación, sin conceder permisos.
- `GET /api/auth/mcp-request/:id`: metadatos públicos de la solicitud pendiente (nombre declarado del cliente, permisos y retorno), sin información de la cuenta, códigos ni tokens. Permite mostrar el contexto antes del login; la aprobación sigue requiriendo sesión y Origin válido.
- `/api/integrations*`: gestión privada mediante sesión web y comprobación de Origin/JSON. Un bearer MCP no sustituye la sesión web.

`APP_ORIGIN` debe seguir siendo exactamente `https://pulso.samurai-suite.com`. Los tokens se vinculan al recurso de ese origen; no se aceptan en otros recursos. Los clientes remotos de servidor pueden omitir Origin; si lo envían, debe coincidir con APP_ORIGIN. No se permite CORS de MCP desde orígenes web arbitrarios. Las rutas web anteriores conservan sus protecciones de sesión y CSRF. API y PostgreSQL siguen sin puertos públicos.

El registro tiene límites de frecuencia y un máximo de 1000 clientes en esta instalación personal. No se descarga metadata de clientes ni URLs arbitrarias. Cambiar la IP o certificado del dominio no requiere regenerar tokens mientras APP_ORIGIN se conserve.

## Verificación

- 17 pruebas de integración contra PostgreSQL desechable: las nueve anteriores y ocho de MCP/OAuth.
- Cliente oficial MCP real sobre HTTP: descubrimiento de herramientas, lectura, creación, edición, reintento idempotente, versiones antiguas, aislamiento del propietario, permisos y revocación.
- Recurrencia, proyectos, secciones, etiquetas, papelera, paginación, PKCE incorrecto, retorno/recurso incorrectos, consentimiento sin sesión/CSRF, código reutilizado, expiración, cliente confidencial, renovación y replay de refresh token.
- Build de API/frontend e imágenes Docker correctos; dependencias de producción sin vulnerabilidades reportadas por npm en esta revisión.
- Proxy local: descubrimiento OAuth accesible. Pantallas de ajustes y consentimiento revisadas en móvil; sin desbordamiento horizontal ni errores de consola. La revisión visual no aprobó una conexión ni creó tokens en la base local principal.
- Pendiente de una acción del propietario: conectar cada asistente en su propia cuenta y autorizarlo. Las pruebas no concedieron acceso a cuentas externas ni emitieron tokens de producción.

## Corrección del flujo sin sesión

La primera implementación enviaba la solicitud al inicio de la app y mostraba el login genérico cuando no había sesión; el contexto de conexión solo se veía después. Ahora existe una pantalla dedicada con inicio de sesión integrado y una segunda acción explícita para autorizar. Se verificó en navegador con la cuenta de demostración: sesión cerrada → solicitud con nombre/permisos → login → consentimiento, conservando la misma solicitud y sin conceder acceso automáticamente. También se añadió una prueba de integración que verifica este límite y la cancelación posterior.

La pantalla de conexión no abre IndexedDB ni sincroniza las tareas de la app, y no usa una identidad local guardada cuando falla el servidor. Para autenticarse y autorizar solo necesita la sesión del backend, de modo que la conexión no depende del almacenamiento offline del navegador que abrió el asistente.

Referencia técnica: [autorización MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [SDK TypeScript oficial](https://github.com/modelcontextprotocol/typescript-sdk).
