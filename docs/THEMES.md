# Apariencia: Claro, Oscuro y Sistema

En **Ajustes y respaldos → Apariencia** se elige el tema. El valor inicial es Sistema. Los cambios son inmediatos y se guardan en `localStorage` bajo `pulso-theme`, por dispositivo y navegador, sin modificar tareas ni requerir conexión. Las pestañas del mismo origen reciben los cambios.

Sistema sigue `prefers-color-scheme`, incluidos cambios mientras Pulso está abierto. Claro y Oscuro conservan la elección aunque cambie el sistema. Si el almacenamiento está bloqueado, la elección funciona durante la sesión y al volver a abrir se usa Sistema.

El script externo `theme-init.js` aplica la preferencia antes de cargar React y sus estilos. Cumple la CSP existente sin habilitar scripts inline. Se solicita a la red sin caché junto con el resto de la aplicación; abrir Pulso requiere conexión. `color-scheme` adapta los controles nativos; `theme-color` cambia el color de la interfaz del navegador cuando este lo admite. La pantalla inicial del sistema operativo puede seguir usando el color estático del manifiesto.

## Paleta

Se mantienen DM Sans para texto y Manrope para títulos. Los colores de proyectos y etiquetas elegidos por el usuario se conservan.

| Rol                   | Claro     | Oscuro    |
| --------------------- | --------- | --------- |
| Fondo                 | `#fafafc` | `#19171f` |
| Superficie            | `#ffffff` | `#23202b` |
| Superficie secundaria | `#f3eff8` | `#2b2636` |
| Texto                 | `#302b40` | `#eeeaf5` |
| Texto secundario      | `#736a80` | `#b9b0c7` |
| Acento                | `#6c48e5` | `#b8a2ff` |
| Texto sobre acento    | `#ffffff` | `#221638` |
| Separadores           | `#e7e2ed` | `#42394e` |

Contraste calculado para pares principales: texto oscuro sobre superficie 13.50:1; texto secundario oscuro sobre superficie secundaria 7.05:1; acento oscuro sobre selección 5.71:1; texto de botón oscuro 7.78:1. En claro, texto secundario sobre superficie secundaria 4.51:1 y texto del botón primario 5.68:1. No es una auditoría completa de accesibilidad; colores personalizados pueden necesitar ajustes propios.

## Verificación

- Pruebas automatizadas del tema: cambio del sistema en vivo, preferencia explícita, persistencia, eventos entre pestañas, eliminación de preferencia, almacenamiento bloqueado y arranque antes del renderizado.
- Navegador sobre Docker: selección de los tres modos, restauración al recargar, ajustes y formulario móvil sin desbordamiento, tablero y calendario oscuros; consola sin errores en la revisión.
- Pendiente: comprobación en teléfonos físicos y colores de interfaz/splash de cada PWA instalada.

Los cambios se publican en `main`; Coolify despliega mediante el webhook configurado por el usuario.
