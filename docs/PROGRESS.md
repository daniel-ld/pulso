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

## Corrección móvil y verificación — 27 de noviembre de 2026

Implementada la corrección del desbordamiento del editor en `99d2a32`: una columna hasta 760 px, controles que pueden encogerse, campos de 16 px y objetivos táctiles de al menos 44 px. Cabecera y acciones permanecen accesibles durante el desplazamiento vertical. La barra de presentación se adapta también a anchos pequeños. En escritorio se mantienen dos columnas.

Verificación sobre el stack Docker local con el navegador integrado: anchos solicitados de 320, 375, 390 y 430 px, con anchos CSS efectivos de 277, 327, 341 y 377 px por la escala del navegador. En todos ellos el ancho desplazable de la página y del diálogo coincide con su ancho visible, y ambos botones quedan dentro del diálogo. Se comprobó además la repetición mensual con sus campos adicionales, sin guardar el borrador. A 1825 px efectivos el editor conserva dos columnas y no desborda.

El build del frontend y la reconstrucción de la imagen web finalizaron correctamente. CI de `99d2a32` correcto: https://github.com/daniel-ld/pulso/actions/runs/45910355999. Pendientes: comprobación en teléfono físico, teclado virtual y despliegue manual en Coolify. Esta corrección no implementa todavía la captura rápida del prototipo.

## Zoom de la PWA — 27 de noviembre de 2026

Los controles editables de todas las pantallas, incluidos búsqueda, acceso y ajustes, usan al menos 16 px en móvil o con puntero táctil. El editor de tareas ya tenía esa medida, pero otros campos heredaban tamaños menores. En modo instalado (`display-mode: standalone`), la página y los diálogos usan `touch-action: pan-x pan-y` para permitir desplazamiento sin gestos de zoom de página. Se conserva el zoom del navegador fuera del modo instalado; no se interceptan los atajos de teclado ni eventos táctiles mediante JavaScript.

Referencia del comportamiento de gestos: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action. El resultado con teclado virtual y gestos reales requiere comprobación en el teléfono; las preferencias de accesibilidad del sistema o navegador pueden prevalecer sobre la aplicación.

Build de frontend e imagen Docker correctos. En navegador a tamaño móvil se verificó búsqueda a 16 px, título de tarea a 20 px y demás campos del editor a 16 px; el diálogo no tiene desbordamiento horizontal. La regla de gestos para modo instalado está presente en la hoja de estilos servida. No se simularon gestos físicos ni modo instalado con esta comprobación.

## Apariencia — 27 de noviembre de 2026

Implementados Claro, Oscuro y Sistema en Ajustes. Preferencia local por dispositivo, actualización automática con el sistema y entre pestañas, aplicación antes del renderizado y soporte de arranque offline. Paleta compartida en listas, tablero, calendario, acceso, formularios, mensajes y diálogos; se conservan los colores personalizados de proyectos. Detalle y evidencia: [THEMES.md](THEMES.md).

Build de frontend e imagen Docker correctos. Pasaron 8 pruebas de dominio y tema; se revisaron selección, persistencia, modo móvil, tablero y calendario en navegador, sin errores de consola. El despliegue se realiza por webhook al subir a `main`, según indicó el usuario; no requiere acceso manual al panel de Coolify.

## MCP remoto — 27 de noviembre de 2026

Implementado `/mcp` en el backend existente, publicado por el mismo Nginx y dominio. SDK oficial, Streamable HTTP, OAuth con PKCE y registro dinámico, tokens manuales con permisos de lectura o gestión, conexiones revocables desde Ajustes y consentimiento explícito después del inicio de sesión. No se añaden recursos de Coolify. Migración 3 y reglas de mutación compartidas con la sincronización; escrituras con idempotencia y versión esperada.

16 pruebas de integración correctas (9 anteriores y 7 de MCP/OAuth), 8 pruebas de dominio/tema correctas y builds de API/frontend e imágenes Docker correctos. Revisados proxy local, ajustes y consentimiento móvil sin conceder acceso a un asistente externo. Documentación de conexión, herramientas, permisos y límites: [MCP.md](MCP.md). La conexión real desde cada asistente requiere que el propietario autorice su cuenta; no se crearon credenciales de producción durante estas pruebas.
