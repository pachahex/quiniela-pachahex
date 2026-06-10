# Quiniela Pachahex - Mundial 2026

Aplicación web desarrollada con **HTML5, CSS3, Vanilla JavaScript** y backend en **Firebase** (Authentication & Cloud Firestore).

## Arquitectura (Fase B)

### Autenticación
La aplicación utiliza Firebase Authentication con una capa de adaptación (Formateador). Ya que Firebase requiere correos electrónicos para el registro de usuarios, el frontend captura el **Nombre de Usuario** ingresado y lo transforma internamente a `nombre_usuario@pachahex.local`. Esto permite a los usuarios iniciar sesión y registrarse de forma rápida usando solamente un usuario y una contraseña.

### Estructura en Cloud Firestore

La base de datos utiliza dos colecciones principales:

1. **`usuarios`**
   - **Document ID:** El `uid` asignado por Firebase Auth.
   - **Estructura del Documento:**
     ```json
     {
       "nombre_usuario": "juanperez",
       "puntos_totales": 0,
       "rol": "user",
       "grupo_id": ""
     }
     ```
   - **Roles:** Al registrarse, todos los usuarios tienen `rol: "user"`. Para acceder al Panel de Administrador y subir los resultados oficiales, debes ir a la consola de Firebase y cambiar tu propio documento a `rol: "admin"`.

2. **`predicciones`**
   - **Document ID:** El `uid` del usuario.
   - **Estructura del Documento:**
     ```json
     {
       "matches": {
         "j1_m1": { "l": "2", "v": "1" },
         "j1_m2": { "l": "0", "v": "0" }
       }
     }
     ```

3. **`resultados`**
   - **Document ID:** `oficiales`
   - Guarda los resultados reales del torneo que el Administrador ingresa en el panel. El sistema cruza estos datos con las `predicciones` para calcular el ranking.

## Reglas de Cierre de Partidos
- **Jornada 1:** Cierra individualmente 1 hora antes de la hora de inicio de cada partido.
- **Jornadas 2 y 3:** Cierran de manera masiva en el instante exacto en que inicia el primer partido de la Jornada 2.

## Sistema de Puntuación
- **5 puntos:** Resultado exacto.
- **3 puntos:** Acertar el ganador o el empate.
- **1 punto:** Acertar exactamente la cantidad de goles de uno de los equipos (fallando en el ganador).
- **0 puntos:** Fallo total.

## Instalación y Pruebas
1. Clona el repositorio o abre el archivo `index.html` en un servidor local (ej: Live Server en VSCode). Es importante usar un servidor local debido al uso de `<script type="module">` (la política de CORS de los navegadores puede bloquear módulos locales bajo `file://`).
2. Haz clic en "Registrarse" y crea un usuario.
3. Para probar el panel de Administrador, ve a tu consola de [Firebase Firestore](https://console.firebase.google.com/), busca tu UID en la colección `usuarios` y cambia el valor de `rol` a `"admin"`. Recarga la página.
