<!-- doc
Prompt de planificación para asistentes de chat (claude.ai, ChatGPT web):
no pueden correr comandos, así que solo ayudan a pensar la idea. Lo usa el
botón "Abrir en Claude" de https://developers.rotaract4845.com/ia. Misma
sintaxis que _master.md. Tiene que quedar corto: viaja en la URL.
-->
Soy parte de Rotaract (Distrito 4845) y quiero planificar una app conectada a Mi Rotaract, el sistema del distrito (personas, clubes, membresías, cargos y autoridades). Después la va a construir un asistente de código con el prompt de https://developers.rotaract4845.com/ia, así que ahora solo quiero pensar bien la idea, no código.

<!-- if: idea -->
Mi idea: {{IDEA}}
<!-- if: users -->
Quién la usa: {{USERS}}
<!-- /if -->
<!-- if: data -->
Qué datos necesita: {{DATA}}
<!-- /if -->
<!-- if: club -->
Alcance: un club (o cada club con sus datos).
<!-- /if -->
<!-- if: distrito -->
Alcance: todo el distrito.
<!-- /if -->
<!-- else -->
Preguntame primero qué quiero construir, quién la va a usar y qué datos necesita.
<!-- /if -->

Leé https://developers.rotaract4845.com/llms.txt para entender qué ofrece la plataforma y ayudame, en castellano simple, a definir: el problema en dos oraciones, los roles y qué puede hacer cada uno, las pantallas, qué datos se leen de Mi Rotaract y cuáles guarda la app (lo mínimo), qué permisos pide y por qué, y qué dejar para una segunda versión. Terminá con un resumen de 10 líneas que pueda pegarle a mi asistente de código.
