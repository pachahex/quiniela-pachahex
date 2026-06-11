# Quiniela Pachahex - Mundial 2026

Aplicación web desarrollada con **HTML5, CSS3, Vanilla JavaScript** y backend en **Firebase** (Authentication & Cloud Firestore). Los datos del torneo (fechas, sedes y resultados) se obtienen **automáticamente** de una API pública: nadie ingresa resultados a mano.

## Arquitectura

### Autenticación
La aplicación utiliza Firebase Authentication con una capa de adaptación: el frontend captura el **Nombre de Usuario** y lo transforma internamente a `nombre_usuario@pachahex.local`, permitiendo registrarse solo con usuario y contraseña.

### Fuente de datos del torneo (automática)
- **Fixture y resultados:** [openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) — dominio público, sin API key, CORS habilitado. La app la consulta al cargar y la refresca cada 5 minutos; cae a una caché en `localStorage` si no hay conexión.
- **Cruce de partidos:** por par de equipos. `js/teams.js` mapea nombres español ↔ inglés y códigos ISO de bandera; `js/api.js` parsea fechas con zona horaria, sedes (estadio/ciudad) y marcadores (`score.ft`).
- **Banderas:** [flagcdn.com](https://flagcdn.com) por código ISO (sin API key).

### Estructura en Cloud Firestore (vigente)

1. **`usuarios`** — Document ID: `uid` de Firebase Auth.
   ```json
   { "nombre_usuario": "juanperez", "rol": "user", "grupo_id": "g_...", "estado": "activo" }
   ```
   Para acceder al Panel de Administrador (gestión de usuarios/grupos), cambia tu documento a `rol: "admin"` desde la consola de Firebase.

2. **`predicciones`** — Document ID: `uid` del usuario.
   ```json
   { "matches": { "j1_1": { "l": "2", "v": "1" } } }
   ```

3. **`grupos`** — grupos de amigos (`{ nombre }`).

4. **`sistema/partidos`** — fixture base (ids `j1_1..j3_24`, jornada y equipos). Solo se usa como mapeo estable de IDs para las predicciones; las fechas guardadas son únicamente *fallback* si la API no responde y no hay caché.

### En desuso (puede eliminarse de Firestore)
- **Colección `resultados`** (doc `oficiales`): los resultados ahora vienen de la API; la app ya no lee ni escribe este documento.
- **Campo `usuarios.puntos_totales`**: los puntos siempre se calculan en el cliente.
- **Campos `goles_local_real` / `goles_visitante_real`** dentro de `sistema/partidos.lista`: ya no se leen.

## Reglas del juego
- **Cierre de apuestas:** automático, **1 hora antes** del inicio oficial de cada partido (cuenta regresiva en cada tarjeta).
- **Transparencia:** al cerrar un partido, las predicciones de todo el grupo se publican en la pestaña **Grupo**.
- **Puntuación:** 5 pts resultado exacto · 3 pts ganador/empate · 1 pt goles exactos de un equipo · 0 pts fallo. No acumulativos.

## Seguridad (Firestore Rules)
El archivo `firestore.rules` contiene las reglas recomendadas. **Deben publicarse en Firebase Console > Firestore > Rules**; sin ellas, el cierre de apuestas solo existe en el frontend.

## Instalación y Pruebas
1. Clona el repositorio y abre `index.html` con un servidor local (ej: Live Server). Es necesario por el uso de `<script type="module">`.
2. Haz clic en "Registrarse" y crea un usuario.
3. Para probar el panel de Administrador, cambia `rol` a `"admin"` en tu documento de `usuarios` y recarga.
