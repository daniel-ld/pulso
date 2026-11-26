# Validación de la primera versión

Fecha: 26 de noviembre de 2026. Entorno: Mac ARM64, Docker Desktop, Node.js 24 dentro de contenedores y PostgreSQL 17.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| TypeScript en API y web | Correcto |
| Build de API y web | Correcto en host y Docker |
| Pruebas de dominio | 6 correctas |
| Pruebas de integración con PostgreSQL desechable | 9 correctas |
| Login y creación de tarea desde navegador | Correcto |
| Detectar mañana y P2, completar y deshacer | Correcto |
| Lista, tablero y calendario | Revisados visualmente |
| Interfaz en viewport móvil | Revisada, sin desbordamiento horizontal en la medición DOM |
| Consola de la app durante revisión | Sin errores |
| pg_dump y restauración en base independiente | Correcto: 1 cuenta, 8 tareas, esquema 2 |
| Puertos publicados localmente | Solo 127.0.0.1:4173 de web |
| Compose de Coolify | Validado sin desplegar |
| Web Push real y PWA en teléfono físico | Pendientes de HTTPS y dispositivos reales |

## Cobertura de integración

Las pruebas ejercitan la aplicación Fastify con PostgreSQL real. Para el cliente, IndexedDB se simula con fake-indexeddb; los fetch se atienden por la API real, sin simular sus reglas. Se comprueban persistencia al cerrar y reabrir la base local, envío de dos cambios offline sin duplicados, restauración de respaldo y resolución de conflicto guardando la variante perdedora. Esto no equivale a probar la política de almacenamiento de Safari o Chrome en cada teléfono.

Se verifican acceso autenticado, protección de origen, registro único, referencias por propietario, ciclos de subtareas, fusión de campos independientes, conflicto en el mismo campo, operación idempotente, finalización recurrente concurrente, borrado lógico, recuperación explícita, cursor incremental y rechazo de destinos push arbitrarios.

La CI reproduce los checks con Node.js 24 y un PostgreSQL efímero. Sus credenciales son exclusivamente de pruebas. Ningún secreto de la instalación ni acceso a tu servidor se necesita para ejecutarla.

## Comandos

```sh
npm run typecheck
npm test
docker compose --profile test run --build --rm test
npm run build
docker compose --profile test stop test-db
```

Después del despliegue real hay que probar en Mac y teléfono: instalación, permisos push, edición sin conexión tras reiniciar, reconexión, conflictos y restauración. No se marca esa parte como verificada por haber pasado las pruebas locales.
