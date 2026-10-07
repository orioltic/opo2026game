# Libros contra la desinformación

Prototipo web estático en HTML, CSS y JavaScript, con perspectiva en primera persona, paleta RGB de 24 bits y sprites retro de alta resolución. No usa motor de videojuegos, PHP, servidor de juego, cuentas ni servicios externos.

## Probar en local

Abre PowerShell en esta carpeta y ejecuta:

```powershell
python -m http.server 8000
```

Abre `http://localhost:8000`. Detén el servidor con `Ctrl+C`.

## Jugar

- Muévete con WASD o las flechas; también puedes arrastrar el ratón para girar. En pantalla táctil, mantén pulsadas las flechas del mando.
- En móviles, gira el dispositivo a horizontal para poder jugar. Al iniciar, el navegador intentará activar pantalla completa y bloquear la orientación si lo admite.
- Lanza libros con la barra espaciadora, un clic en la escena o el botón «Lanzar libro». Cada rival necesita dos o tres impactos; el contador sobre él muestra los restantes.
- Empiezas con cinco vacunas. El contacto con un rival no transformado resta una. Tocar una cápsula abre una pregunta; solo un acierto recupera una vacuna, hasta el máximo de cinco.
- Convierte a todos los rivales, llega a la salida y responde correctamente una pregunta para superar la fase.
- La fase 1 tiene cuatro rivales y una jeringuilla; la fase 2, ocho rivales y dos jeringuillas; la fase 3, diez rivales y tres jeringuillas.

Las tres fases desbloquean, por orden, el historial académico, el proyecto docente y el proyecto investigador.

## Sustituir la foto y los documentos

Reemplaza `assets/oriol.png` para cambiar el retrato pixelado, o modifica las rutas de imagen en `index.html`.

Los PDF actuales son documentos de prueba identificados como tales. Reemplázalos por los definitivos conservando esos nombres, o cambia las rutas `pdf` en `config.js`. El mismo archivo concentra las vacunas iniciales y máximas, la batería de preguntas, los mapas, enemigos y cápsulas de cada fase.

La batería de preguntas cubre TPACK y el MRCDD. Se mezclan tanto las preguntas como el orden de sus respuestas. INTEF indica que la actualización de 2022 es el marco vigente y recoge seis áreas y 23 competencias. [INTEF: competencia digital docente](https://intef.es/competencia-digital-educativa/competencia-digital-docente/) · [MRCDD actualizado](https://intef.es/wp-content/uploads/2023/05/MRCDD_GTTA_2022.pdf) · [Mishra y Koehler: TPACK](https://journals.sagepub.com/doi/abs/10.1111/j.1467-9620.2006.00684.x).

Todas las rutas son relativas. Puedes alojar la carpeta en un servidor con PHP o en un servicio estático. El prototipo no se publica desde este proyecto.
