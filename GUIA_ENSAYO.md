# 🧪 Guía de ensayo general (30 minutos)

Hazla **2–3 días antes**, en el mismo lugar y con el mismo WiFi / túnel que usarás en la fiesta.
Necesitas: laptop del anfitrión, proyector, 3–4 celulares (uno iPhone), el celular del trípode y las cajas físicas con sus códigos.

## Antes de empezar (5 min)
1. `npm install` · `ADMIN_SECRET_KEY=tu-clave JURY_PIN=1234 npm start` (y el túnel HTTPS: `cloudflared tunnel --url http://localhost:3000`, luego reinicia con `PUBLIC_URL=https://…`).
2. **Pantalla**: abre `/pantalla`, F11, **Activar sonido**. Verifica que el audio sale por el equipo de sonido.
3. **Admin**: entra a `/admin` → *Contenido*: revisa `caja` (emojis reales, sticker, `lockCode` y `confirmCode` de cada caja), `crimen`, `kahoot`; quita el aviso con `meta.example=false`.
4. Imprime `/qr` y pega el de la puerta. Imprime los 6 emojis y escóndelos; mete en cada caja su papel con el `confirmCode`.
5. Jurado: 3 celulares en `/jurado` (PIN). Cámara: celular en el trípode en `/camara` → *Activar cámara* → *Probar 5 s*.

## Minutos 5–12 · Entrada
- Rellena `npm run bots -- --n 28` (otros 28 jugadores simulados) y entra tú con 4 celulares reales: registro, test, ver pareja, **📣 Llamar a mi pareja**, escanear el QR del otro (o código de 3 dígitos), “Ya nos presentamos”.
- Admin → *Entrada*: mira pool y parejas, prueba **Forzar pareja** y **Deshacer**. Pulsa **Cerrar equipos**: comprueba que quedan 5–6 por equipo y nombres únicos. Toma una **selfie** de equipo.
- Registra a alguien nuevo (llega tarde): debe ir directo a un equipo y recibir el **ritual de bienvenida**.
- Apaga el WiFi de un celular 10 s y vuélvelo a encender: debe **recuperar** su sesión.

## Minutos 12–17 · Caja fuerte
- Fase *Caja Fuerte*. Resuelve las 4 piezas en un equipo real: dato de letras, emoji, acertijo, sticker. Falla una a propósito (mira “X de 4”, el enfriamiento y la caída del premio). Pide una pista.
- Usa la combinación del candado, abre la caja física y **escribe el código del papel**: la pantalla debe mostrar 🔓, orden y tiempo, y consumir el emoji.
- Prueba **Abrir manual** y **Forzar pendientes** en otro equipo.

## Minutos 17–25 · Bomba
- *Llamar al equipo X*: los 4 celulares vibran, roles 15 s antes; prueba **Prefiero otro rol**.
- Juega rápido los 4 juegos (acorta tiempos en *Contenido → bomba* si quieres). Verifica: sordos con 4 opciones y “Espacio exterior”; el ciego dispara la cámara en Paparazzi (iPhone con HTTPS); mudos arman emojis; el público vota 10 s; **faltas** y **sabotajes** desde otros celulares; el jurado vota y se ve el redoble jurado → público → total.
- En el Karaoke comprueba que `/camara` graba y que el clip aparece en *Admin → Bomba → Cámara y clips*.

## Minutos 25–30 · Cierre y plan B
- Fase *Cierre* → **Armar lista** → **Proyectar** la película. Probar **Deshacer** un asiento en *Puntos*.
- Plan B (todo falla en una fiesta real): pantalla caída → los jugadores siguen en celular; celular sin sensor → modo táctil automático; sin cámara en el trípode → los clips se saltan; sin internet del túnel → `npm run start:https` en el WiFi local; todo tiene override en el panel (Abrir manual, Forzar éxito, Reasignar roles, Ajuste de puntos con motivo).
- Al terminar: *Herramientas → Reiniciar evento completo* (escribe BORRAR) y revisa que no queden selfies/fotos/clips si no los quieres.

✅ Criterio de aprobado: 4 celulares reales completan Entrada → Caja → 1 juego de Bomba → Película sin intervención técnica, y `npm run e2e` sale en verde.
