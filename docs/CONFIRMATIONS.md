# Confirmaciones de Pulso

Las cinco llamadas a `window.confirm` se sustituyeron por un componente propio:

| Acción | Confirmación |
| --- | --- |
| Eliminar una tarea | Nombre de la tarea, opción **Mover a la papelera** y explicación de recuperación |
| Cerrar sesión con cambios pendientes | Explica que siguen guardados solo en este dispositivo |
| Restaurar un respaldo | Identifica el archivo y explica la combinación de registros |
| Recuperar versión del servidor | Explica qué cambios pendientes se descartan y que la alternativa local sigue en el respaldo |
| Revocar un asistente | Identifica la conexión y explica que tendrá que autorizarse de nuevo |

`ConfirmationProvider` en el punto de entrada comparte `useConfirmation()`. Cada llamada devuelve una promesa booleana que el flujo espera antes de ejecutar la acción. Las solicitudes simultáneas se ponen en cola; cerrar o cancelar nunca confirma una acción. Si se desmonta el proveedor, las solicitudes pendientes se cancelan.

El diálogo nativo HTML proporciona la capa modal y limita la interacción al diálogo, pero su contenido está diseñado con los componentes y tokens de Pulso: superficie, sombras, tipografía Manrope/DM Sans, iconos y acento violeta. Revocar acceso usa el color semántico de peligro. Funciona en claro, oscuro y móvil, con botones de al menos 44 px CSS.

La confirmación tiene `role=alertdialog`, título y descripción asociados, incluyendo el nombre del elemento afectado. El foco inicial está en **Cancelar**. Escape, cerrar y pulsar el fondo cancelan; Escape no cierra también el diálogo de Ajustes situado debajo. Al terminar se restaura el foco, con alternativa al botón de opciones de la tarea cuando desaparece el menú original.

## Verificación

- Papelera: vista de escritorio clara y cancelación con Escape sin eliminar la tarea; foco devuelto a Opciones.
- Revocación: diálogo oscuro sobre Ajustes; Escape mantiene Ajustes abierto y devuelve el foco a Revocar.
- Móvil: ancho desplazable igual al visible, botones apilados y altura mínima de 44 px CSS.
- Cancelación y confirmación efectiva verificadas con un registro visual local sin tokens ni credenciales. No se eliminaron tareas ni se revocó una conexión real para esta prueba.
- Build del frontend correcto y consola sin errores en la revisión.
