# Etapas y registro de trabajo

Fecha de inicio: 26 de noviembre de 2026. Proyecto: Pulso. Repositorio acordado: daniel-ld/pulso. Subdominio: pulso.samurai-suite.com. Destino acordado: web instalable en Mac y celular, alojada en servidor propio con Coolify.

## Estado de etapas

| Etapa | Entregable | Estado |
| --- | --- | --- |
| 1 | Monorepo, contratos y arquitectura de un subdominio | Implementada |
| 2 | Cuenta personal, tareas, proyectos, secciones, subtareas, etiquetas y repeticiones | Implementada y probada localmente |
| 3 | IndexedDB, cola offline, idempotencia, conflictos, respaldo y papelera | Implementada y probada con PostgreSQL aislado |
| 4 | Lista, tablero, calendario, búsqueda, filtros y PWA | Implementada y revisada en escritorio y tamaño móvil |
| 5 | Docker, pruebas aisladas y guía de Coolify | Docker y pruebas correctos; despliegue remoto pendiente |

## Decisiones

- Sustituir Supabase por Fastify y PostgreSQL en infraestructura propia.
- PostgreSQL será recurso independiente de Coolify. El monorepo despliega web y API, con dominio asignado solo a web.
- Persistencia local y sincronización forman parte de la versión inicial, no una simulación de interfaz.
- Recurrencia y fechas civiles se comparten entre cliente y servidor para evitar reglas distintas.
- La primera cuenta requiere secreto de instalación y cierra el registro público.
- Los conflictos conservan las variantes y requieren elección para el mismo campo; no se usa silenciosamente “última escritura gana”.

## Comprobaciones

- TypeScript: validación inicial correcta.
- Build de API y frontend: correcto en host y contenedores Docker.
- Pruebas de dominio: 6/6 iniciales correctas (fechas, mes 31, recurrencia, completado, fusión y filtros).
- Dependencias de producción: auditoría npm inicial sin vulnerabilidades reportadas.
- Stack local: web, API y PostgreSQL saludables; solo la web publica 127.0.0.1:4173. La base de pruebas se detuvo al terminar.
- Integración con PostgreSQL aislado: 9/9 correctas. Incluye propietario, CSRF por Origin, cuenta única, fusión, conflictos, idempotencia, recurrencia, papelera, referencias, cursor, IndexedDB, restauración JSON y rechazo de destinos push arbitrarios.
- Interfaz de escritorio y tamaño móvil: revisadas. Inicio de sesión, creación de tarea con detección de mañana y prioridad, completado/deshacer, lista, tablero y calendario verificados; consola sin errores en esa revisión.
- Dispositivos físicos y HTTPS en Coolify: pendiente del despliegue real.

## Ampliaciones posteriores

Se registran explícitamente fuera de la paridad de esta primera versión: adjuntos, comentarios, parser completo de lenguaje natural, expansión virtual de recurrencias en calendario, integración Google/Outlook y migración CSV de Todoist. La aplicación se construye por etapas; este registro no convierte esas funciones en terminadas.

## Cierre de verificación local

- Respaldo SQL creado y restaurado en una base desechable: recuperó 1 cuenta, 8 tareas de demostración y versión de esquema 2. No se alteró la base principal para comprobar la restauración.
- El respaldo JSON y la resolución de un conflicto conservando la variante local se probaron contra el backend real; el ledger conserva la alternativa descartada.
- Corregido un fallo de tipado SQL en el borrado lógico y un orden lexicográfico del cursor. El pull ordena por la secuencia numérica original.
- El service worker precachea el shell y los archivos exactos de JavaScript, CSS y tipografía del build.
- Web Push implementado con configuración opcional; generación de claves y validación de destinos comprobadas. Entrega real, permisos e instalación en teléfonos físicos pendientes.
- Recuperación de contraseña administrativa incluida; no se ejecutó sobre la cuenta de demostración.
- Compose de producción validado con variables de ejemplo. No se ha accedido a Coolify ni cambiado DNS.
- SSH: llave Ed25519 dedicada creada en el Mac, autenticación confirmada como daniel-ld, configuración limitada a este checkout. No se publican ni se versionan claves, .env ni respaldos.

## Siguiente etapa de infraestructura

Conectar el repositorio main a Coolify, crear PostgreSQL privado, aplicar APP_ORIGIN=https://pulso.samurai-suite.com y asignar ese dominio únicamente a web. Falta la URL/acceso al panel de Coolify para ejecutar y verificar ese despliegue. La cuenta personal de producción se creará desde cero; no se trasladan las credenciales de demostración.

## Auditoría de experiencia y captura de tareas

El usuario está realizando el despliegue de Coolify por su cuenta. Se diagnosticó por logs un SETUP_KEY demasiado corto; posteriormente informó un error Cloudflare 526 que requiere revisar el certificado del origen. No se ha confirmado desde esta revisión que la producción esté saludable.

Se completó una revisión experta del checkout local y de las referencias visuales de Todoist proporcionadas por el usuario. Informe: [UX_AUDIT.md](UX_AUDIT.md). Prototipo independiente: [UX_CAPTURE_PROTOTYPE.html](UX_CAPTURE_PROTOTYPE.html).

Hallazgos prioritarios: formulario inicial excesivo, desbordamiento horizontal móvil medido, pérdida del borrador con Escape, foco inicial en Cerrar y necesidad de confirmar tareas creadas fuera de la vista actual. Se propone separar captura inline/global del editor detallado, con chips, atributos progresivos y captura repetida mediante Enter. El prototipo se comprobó en navegador con entrada consecutiva, borrador y ancho móvil; no modifica Pulso ni sus datos. Las mejoras productivas están propuestas, no implementadas.
