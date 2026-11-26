# Auditoría de diseño y usabilidad de Pulso

Fecha: 26 de noviembre de 2026. Revisión del checkout `34f955b` y de la aplicación local en http://localhost:4173. Método: UX Audit & Design Critique, recorrido experto, inspección de DOM y revisión de código. Referencia de facilidad de uso: las tres capturas proporcionadas por el usuario, no una auditoría completa de Todoist.

## Conclusión y alcance

Pulso tiene una estructura reconocible de tareas, proyectos, Hoy y Próximo, pero la captura de una tarea sencilla exige atravesar un editor de propiedades. Para acercar la facilidad de manejo a los ejemplos de Todoist, la prioridad es separar captura rápida, enriquecimiento opcional y edición detallada. El camino habitual debe ser abrir, escribir y añadir; los controles avanzados deben seguir disponibles sin ocupar el primer plano.

Hay además tres problemas que conviene corregir antes de ampliar funciones: desbordamiento del editor móvil, pérdida del borrador al cerrar y foco inicial en el botón de cierre. El diseño puede conservar su identidad violeta y su modelo de datos actual.

Esta entrega es una revisión con propuesta y prototipo independiente. No modifica la interfaz productiva, el backend ni los datos del usuario. No se crearon ni completaron tareas durante la auditoría; solo se escribieron borradores locales y se cancelaron. No se revisó la instalación de producción, el certificado HTTPS, lectores de pantalla reales ni teléfonos físicos. No se realizó un estudio con participantes ni una certificación WCAG.

## Valoración cualitativa

Esta escala expresa juicio experto sobre el alcance revisado, no resultados de usuarios ni una puntuación estadística.

| Área | Valoración | Motivo |
| --- | --- | --- |
| Organización de información | Base clara | Inbox, Hoy, Próximo, proyectos y vistas tienen una estructura reconocible. |
| Captura rápida | Fricción alta | Una sola acción abre 14 controles y un diálogo de unos 832 px de alto. |
| Continuidad y control | Necesita corrección | Cerrar con Escape elimina el borrador sin recuperación. |
| Experiencia móvil | Necesita corrección | El editor desborda horizontalmente y hay objetivos táctiles pequeños. |
| Legibilidad | Desigual | Títulos y texto principal tienen jerarquía; algunas ayudas y placeholders son muy tenues. |
| Transparencia del estado | Base útil, mejorable | Hay indicador de sincronización, pero crear fuera de la vista actual y resolver conflictos necesita mensajes más claros. |

## Evidencia

| ID | Origen | Observación |
| --- | --- | --- |
| E01 | Captura 1 del usuario | Editor completo de Pulso: proyecto, sección, fechas, recordatorio, prioridad, repetición y etiquetas a la vez. |
| E02 | Captura 2 del usuario | Todoist muestra captura dentro de la lista con título y opciones compactas debajo. |
| E03 | Captura 3 del usuario | Todoist muestra una entrada reducida centrada en escribir el nombre. Las capturas no prueban todas sus reglas de teclado, borradores o parser. |
| E04 | DOM de Pulso, escritorio | Diálogo 640 × 831.94 CSS px; 14 controles (`input`, `textarea`, `select`, `button`); foco inicial en Cerrar. |
| E05 | Recorrido de borrador | Escribir “Borrador de auditoría — no guardar”, Escape y reabrir devuelve un título vacío. |
| E06 | Recorrido de detección | “Leer mañana p2” mantiene fecha de hoy y P4 hasta pulsar Detectar; después queda título “Leer”, fecha de mañana y P2. No se guardó. |
| E07 | DOM y captura de móvil | Viewport solicitado 390 × 844; ancho CSS de página observado 375. Diálogo: clientWidth 320, scrollWidth 404. Grid: ancho 278, columnas 223 + 145 px, además del espacio entre ellas. La segunda columna se recorta. |
| E08 | DOM móvil | Completar: 21 × 21 px; opciones: 32 × 32; cambiar presentación: 29 × 25; botón flotante añadir: 54 × 54. |
| E09 | Estilos calculados | Ayuda del parser: texto rgb(168,149,186), fondo rgb(248,245,252), 10 px. Contraste calculado 2.54:1. Placeholder del título rgb(194,183,206) sobre blanco: 1.92:1. |
| E10 | DOM de Hoy y código | Navegación Hoy indica 5; lista muestra una atrasada y cuatro de hoy; pestaña Por hacer indica 7 porque usa el total global. |
| E11 | Código de TaskEditor, Dialog y Workspace | Cerrar descarta el estado del editor, guardar cierra el editor, vistas en useState, diálogos sin aria-label/aria-labelledby, conflictos muestran JSON y nombres internos. |

Las medidas describen esta sesión y configuración de navegador. No son alturas universales para todos los dispositivos o conjuntos de etiquetas.

## Hallazgos priorizados

Severidad: alta = interfiere con una tarea frecuente o puede perder intención escrita; media = introduce confusión o pasos evitables; baja = refinamiento de consistencia. Esfuerzo: bajo, medio o alto relativo al monorepo actual, sin estimar días.

| ID | Problema y efecto | Heurística | Severidad | Esfuerzo | Mejora propuesta |
| --- | --- | --- | --- | --- | --- |
| UX01 | Captura y edición detallada comparten el mismo formulario. Se muestran siete propiedades adicionales, descripción y etiquetas antes de necesitarlas. E01–04. | Minimalismo, reconocimiento y flexibilidad | Alta | Medio | Captura compacta en lista; modal compacto para Q/global; detalles solo al solicitarlos. |
| UX02 | El editor móvil desborda horizontalmente. Sección, fecha límite y prioridad quedan parcialmente fuera. E07. | Prevención de errores y consistencia | Alta | Bajo | Tracks `minmax(0,1fr)`, hijos con min-width:0 y una columna para fechas/opciones avanzadas en móvil. Verificar sin scroll horizontal con textos largos. |
| UX03 | Escape descarta título y atributos sin preservar el borrador. E05, E11. | Control del usuario y recuperación | Alta | Medio | Borrador local separado de las tareas. Reabrir restaura; Cancelar con contenido ofrece conservar o descartar. No crear una tarea silenciosamente. |
| UX04 | El foco cae en Cerrar en lugar del título; después de cancelar la observación devuelve el foco a la página. E04–05. | Eficiencia y control | Alta | Bajo | Tras abrir, enfocar el título; al cerrar, devolver foco al disparador o a la captura inline. Añadir nombre accesible al diálogo. |
| UX05 | La captura natural exige pulsar Detectar y elimina palabras del texto sin previsualización previa. E06. | Flexibilidad y visibilidad de estado | Media | Medio | Reconocimiento visible al escribir con atributos reversibles. Ofrecer ignorar cada detección y preservar la intención literal. |
| UX06 | Guardar desmonta el editor. Añadir varias tareas obliga a reabrirlo. E11. | Eficiencia para uso repetido | Media | Medio | En captura inline, Enter añade y conserva el editor abierto y enfocado. Diferenciar “añadir otra” de “añadir y cerrar”. |
| UX07 | Si se cambia a mañana desde Hoy, la tarea puede salir de la selección al guardarse sin aviso específico de creación. Confirmado en el handler de guardado; no se guardaron datos en esta auditoría. | Visibilidad y prevención de duplicados | Alta | Bajo | Mensaje “Añadida para mañana en Personal” con Ver tarea. Mostrar “guardada en este dispositivo” si sigue pendiente de sincronizar. |
| UX08 | Texto de ayuda a 10 px y contraste bajo; placeholder principal muy tenue. E09. | Legibilidad y reconocimiento | Media | Bajo | Texto de ayuda de al menos 12–14 px, etiqueta visible clara y colores con contraste suficiente. Reservar tonos tenues para decoración. |
| UX09 | Objetivos de 21–32 px dificultan completar u operar menús en móvil. E08. | Prevención de errores | Media | Bajo | Ampliar hit areas a 44 × 44 px conservando iconos pequeños y densidad visual. No ampliar el círculo visible innecesariamente. |
| UX10 | El contador global se presenta dentro de una vista filtrada. E10. | Consistencia y visibilidad | Media | Bajo | Usar conteo de la vista o indicar explícitamente “7 en total”. Mantener coherencia entre navegación, encabezado y lista. |
| UX11 | Navegación sin rutas: selección y layout viven solo en useState. E11. | Control, reconocimiento y continuidad | Media | Medio | Rutas para Hoy/proyecto/filtro, comportamiento Atrás y preferencias de presentación por vista. |
| UX12 | Resolver conflictos expone JSON, UUIDs y nombres como scheduledDate en una operación cotidiana. E11. | Correspondencia con el mundo real y recuperación | Media | Medio | Comparación por campo con etiquetas humanas, valor de este dispositivo y del otro; acciones claras y recuperación disponible. |
| UX13 | Eliminar una tarea recuperable añade confirmación bloqueante del navegador. E11. | Flexibilidad y eficiencia | Media | Bajo | Enviar a papelera y ofrecer Deshacer. Mantener confirmación para eliminación definitiva si se incorpora. |
| UX14 | Nueva tarea, Añadir tarea y Crear tarea nombran la misma acción; títulos como “Un poco más de detalle” no indican claramente edición. E01, E11. | Consistencia y reconocimiento | Baja | Bajo | “Añadir tarea” para creación y “Editar tarea” para edición, con microcopy breve y directo. |

## Cinco mejoras inmediatas

1. Corregir el desbordamiento móvil antes de cualquier rediseño mayor.
2. Enfocar el título al abrir, devolver foco al cerrar y nombrar el diálogo con aria-labelledby.
3. Ocultar recordatorio, deadline, sección y repetición detrás de “Más opciones” al crear; mantener el editor completo para edición.
4. Subir contraste y tamaño de las ayudas; ampliar áreas táctiles de los controles frecuentes.
5. Mostrar confirmación contextual de creación y conteos coherentes con la vista.

Estas mejoras no sustituyen la captura inline ni la conservación del borrador, que siguen siendo prioridad alta del siguiente componente.

## Propuesta de interacción

### Captura dentro de la lista

Estado inicial: “+ Añadir tarea”. Al activarlo aparece un campo enfocado exactamente donde se añadirá la tarea. El nombre es el único dato obligatorio. Proyecto, sección y fecha heredan el contexto visible; nunca se fijará hoy en una captura global sin mostrarlo.

```text
[ Nombre de la tarea                                      ]
[ Fecha ] [ Prioridad ] [ Etiquetas ] [ Proyecto ] [ Más ]
                                          Cancelar  Añadir
```

Los chips son controles reales, no etiquetas decorativas. Proyecto puede desplegar secciones; Fecha ofrece Hoy, Mañana, próxima semana, calendario y Sin fecha. No se solicita prioridad si el usuario no la necesita: la normal es implícita. Descripción aparece como expansión opcional. Fecha límite, recordatorio y repetición aparecen en Más opciones.

Enter añade la tarea desde el título, limpia solo título/descripción y conserva los atributos de la sesión de captura y el foco. Si se permite cerrar después de añadir, se expone un atajo alternativo explícito. Enter dentro de un selector no debe enviar accidentalmente el formulario; un texto en composición IME tampoco se envía hasta finalizar la composición. Escape cierra primero un popover abierto, luego la captura, manteniendo el borrador. No se aplican atajos globales mientras un campo está editándose.

### Captura global y móvil

Q y el botón global abren la misma lógica de captura en un modal compacto. En móvil, un panel con título enfocado, controles que envuelven a varias líneas y pie de acción visible. La ficha de edición puede seguir mostrando detalles; crear no debe exigir navegar por todos ellos.

Se recomienda compartir el estado y la lógica entre inline, modal y móvil para que el parser, los valores por defecto, la validación y el borrador no diverjan. Se reutilizan `mutate`, Zod y la outbox existentes; no hace falta cambiar de tecnología ni reescribir la sincronización.

### Detección de lenguaje natural

“Leer mañana p2” puede previsualizar “Mañana” y “P2” mientras se escribe. La detección debe ser reversible: quitar un atributo detectado permite conservar la expresión literal. Los valores elegidos manualmente necesitan precedencia clara; no deben ser sobrescritos silenciosamente al escribir otro carácter. La propuesta no promete interpretar cualquier frase ni toda la gramática de Todoist.

## Criterios de aceptación para la implementación

- Abrir, escribir título y Enter añade una tarea sin pasar por propiedades opcionales.
- Se pueden capturar cinco tareas seguidas sin reabrir el editor ni recuperar el foco manualmente. Es un criterio propuesto, no un resultado medido.
- No se pierde el borrador con Escape, cierre del modal o cambio accidental de vista.
- Cerrar un popover no cierra simultáneamente el editor.
- La fecha y el proyecto efectivos siempre son visibles cuando difieren de valores implícitos.
- Una tarea creada fuera de la vista actual confirma dónde quedó y ofrece encontrarla.
- La captura funciona con outbox offline; el mensaje distingue guardado local y sincronización.
- No hay desbordamiento horizontal a 320, 375 y 390 CSS px, incluyendo fechas nativas, etiquetas y proyectos largos.
- Al abrir se enfoca el título; el recorrido de Tab es lógico; al cerrar se recupera el foco; el diálogo tiene nombre accesible.
- Iconos táctiles frecuentes tienen hit area de 44 × 44 px sin superponerse.
- Texto normal alcanza 4.5:1 de contraste; texto grande puede usar 3:1 conforme a WCAG.
- No se cambian las reglas de recurrencia, completado, permisos ni sincronización durante el refactor de captura.

## Etapas propuestas

| Etapa | Alcance | Verificación |
| --- | --- | --- |
| A · Corregir fricción básica | Overflow, foco, ARIA, contraste, áreas táctiles, conteos y confirmación de creación | Navegador de escritorio, viewport móvil y teclado |
| B · Captura rápida | Componente compartido inline/global, chips, guardado repetido y borrador | Captura seguida, Escape, composición, contexto y outbox offline |
| C · Refinar experiencia | Parser reversible, navegación con rutas, preferencias y conflictos legibles | Escenarios completos y comparación con la línea base |
| D · Prueba con uso real | Uso diario en Mac y celular, incluidas condiciones sin conexión | Registrar errores, pasos evitables y tiempo real de captura con participantes |

No se estiman porcentajes de mejora ni tiempos ahorrados sin medición. El objetivo es igualar la facilidad de captura de las referencias, con diseño y código propios.

## Prototipo de revisión

`UX_CAPTURE_PROTOTYPE.html` ilustra la captura progresiva, los atributos compactos y la entrada repetida. Funciona en memoria y no se conecta a Pulso. Reconoce solo un subconjunto de fechas/prioridad para ilustrar la propuesta; no sustituye la especificación ni una implementación de producción.

Verificación del prototipo: se añadieron dos ejemplos consecutivos con Enter manteniendo el foco en el nombre; “Leer mañana p2” mostró atributos antes de enviarse; Escape conservó un borrador; el modal global recuperó ese mismo borrador y enfocó el título. Se abrió Más opciones y se probaron viewports solicitados de 320, 375 y 390 px. Los anchos CSS efectivos observados fueron 277, 327 y 341 px por la configuración del navegador, con scrollWidth igual a clientWidth tanto en página como en diálogo (237/237, 287/287 y 301/301 para el diálogo). Estos resultados verifican el prototipo en ese entorno, no el componente actual de producción.

## Referencias de accesibilidad

- [WCAG 2.2 — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 para texto normal y 3:1 para texto grande. Las ratios observadas se calcularon con luminancia relativa sRGB, sobre fondos opacos medidos.
- [WCAG 2.2 — tamaño mínimo de objetivo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): 24 × 24 px con excepciones, entre ellas espaciado. El objetivo de producto de 44 × 44 px es más cómodo para tacto; no se afirma incumplimiento de 2.5.8 solo por medir un círculo de 21 px sin revisar todas sus excepciones.
- [WAI-ARIA APG — diálogo modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): foco inicial apropiado, recorrido contenido y nombre accesible. El diálogo nativo ya aporta comportamiento modal; falta completar nombre y manejo de foco observado.
