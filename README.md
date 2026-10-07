# Motiva el aula

Juego web estático en HTML, CSS y JavaScript, con laberinto en primera persona inspirado en Doom y gráficos retro a todo color. Los libros muestran al azar una estrategia: Aula Invertida, Gamificación, ABP, ApS o Juegos Serios. El mismo libro motiva a cualquier estudiante.

## Probar en local

Abre PowerShell en esta carpeta y ejecuta:

```powershell
python -m http.server 8000
```

Abre `http://localhost:8000`. Detén el servidor con `Ctrl+C`.

## Jugar

- Muévete con WASD o las flechas; en móvil, gira el teléfono a horizontal y usa el mando táctil de la izquierda y el botón de lanzar de la derecha.
- Lanza libros con la barra espaciadora, un clic en la escena o el botón «Lanzar libro». Cada lanzamiento elige una estrategia al azar. Cada estudiante requiere dos o tres impactos.
- Empiezas con cinco unidades de energía. El contacto con un estudiante desmotivado resta una unidad.
- Recoge las chispas de energía y responde la pregunta para recuperarla. Las respuestas incorrectas no dan energía.
- Motiva a todo el grupo, llega a la salida y responde correctamente para superar la fase.
- La fase 1 incluye cuatro estudiantes y una chispa; la fase 2, ocho estudiantes y dos chispas; la fase 3, diez estudiantes y tres chispas.

Las fases desbloquean, en este orden, los PDF del historial académico, el proyecto docente y el proyecto investigador.

## Cambiar estudiantes, preguntas y estrategias

`config.js` concentra las estrategias de los libros, el máximo y la energía inicial, las preguntas, los mapas, los personajes y las rutas de los PDF. Cada personaje se configura con género y tipo de pelo. Los sprites muestran una postura decaída al inicio y expresión alegre, mirada frontal y salto al motivarse.

## Sustituir foto y documentos

Reemplaza `assets/oriol.png` para cambiar el retrato pixelado. Los PDF actuales son documentos de prueba identificados como tales. Sustitúyelos conservando sus nombres o modifica sus rutas `pdf` en `config.js`.

Todas las rutas son relativas. La carpeta puede alojarse en un servidor con PHP o en un servicio de hosting estático; el juego no necesita PHP, base de datos, cuentas ni dependencias externas.
