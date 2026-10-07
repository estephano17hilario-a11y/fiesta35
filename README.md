# 🎮 Fiesta 35 — la fiesta como videojuego

Plataforma web en **tiempo real** que corre **en paralelo a un juego físico**: 35 invitados, objetos reales y una pantalla grande.
Cinco vistas, cero cuentas, cero descargas: **QR → nombre → jugar**.

| Vista | Ruta | Quién | Para qué |
|---|---|---|---|
| Jugador | `/` (o `/jugador`) | los 35 invitados (celular **o** laptop) | registro, test, pareja, equipo, juegos |
| Pantalla | `/pantalla` | proyector / TV | lobby, caja fuerte, escena de la Bomba, película final, sonidos |
| Admin | `/admin` | anfitrión + ayudante (con clave) | fases, juegos, DJ de 8 pads, ledger de puntos, contenido |
| Jurado | `/jurado` | 3 jurados (con PIN) | puntúan 1–5★ en secreto |
| Cámara | `/camara` | celular en el trípode | graba cada ronda del Karaoke y sube el clip |
| QR | `/qr` | anfitrión | imprime el QR de la puerta (y los de pantalla/jurado/cámara/admin) |

## 🚀 Arranque rápido (laptop del anfitrión)

Requisitos: **Node 22.13+** (SQLite viene incluido en Node: no hay que instalar ninguna base de datos).

```bash
npm install
npm start            # http://localhost:3000
```

1. Abre `http://localhost:3000/pantalla` en el proyector, pulsa **“Activar sonido”** y F11.
2. Abre `/admin` (clave por defecto `CumpleGianella35MasterKey` — **cámbiala**: `ADMIN_SECRET_KEY=... npm start`).
3. Imprime `/qr` y pega el QR en la puerta.
4. **Ensayo sin invitados:** `npm run bots` mete 35 jugadores simulados que hacen el test, se emparejan y juegan.

### ⚠️ HTTPS es obligatorio en la fiesta real
Sin HTTPS, **iPhone y Android bloquean la cámara y el acelerómetro** (Paparazzi, Karaoke grabado, Keiko y Estatua). Tres opciones:

**A) Portátil local + túnel Cloudflare (recomendada, gratis, 2 minutos)**
```bash
npm start
cloudflared tunnel --url http://localhost:3000     # imprime https://algo.trycloudflare.com
PUBLIC_URL=https://algo.trycloudflare.com npm start # (reinicia para que los QR usen esa URL)
```
Con Docker: `docker compose --profile tunnel up -d` y mira la URL en `docker logs fiesta35_tunnel`.
Tu laptop necesita internet; los invitados pueden usar sus datos o el WiFi del lugar.

**B) Nube (Fly, Railway o Render)** — el repo incluye `Dockerfile`. Monta un volumen en `/data` (ahí vive SQLite y las fotos/clips):
```bash
# Fly.io
fly launch --no-deploy && fly volumes create fiesta_data --size 1
fly secrets set ADMIN_SECRET_KEY=... JURY_PIN=... && fly deploy
# Railway / Render: despliega el Dockerfile, añade un disco en /data y las variables de abajo.
```

**C) HTTPS local con certificado autofirmado (sin internet)**: `npm run start:https` → `https://IP:3443`. Los celulares mostrarán “conexión no privada”: *Avanzado → Continuar*. Funciona, pero es menos cómodo que A.

### Variables de entorno
| Variable | Por defecto | Descripción |
|---|---|---|
| `ADMIN_SECRET_KEY` | `CumpleGianella35MasterKey` | clave de `/admin` y `/camara` |
| `JURY_PIN` | `2468` | PIN del jurado |
| `PORT` / `HTTPS_PORT` | 3000 / 3443 | puertos |
| `PUBLIC_URL` | — | URL pública (QR y enlaces) |
| `DATA_DIR` | `./data` | base de datos, config, contenido y subidas |

## 🧭 Flujo de la noche (90 min de juegos + resto de la fiesta)

**Entrada (25 min)** → **Caja fuerte (20)** → **Bomba (30)** → **Cierre (15)** → Hora Loca → ¿Quién mató a Gianella? → Descarga a la Madre de Keiko → Kahoot → Farmeo de Aura → Estatua → Pixel Art → Foto Loca → Ceremonia → Fiesta libre.

### 1 · Entrada — equipos que nacen de la afinidad
- QR → nombre + **cosa favorita** + aviso de consentimiento → **test de 8 “esto o aquello”** (5 miden E-O-A-C-S en secreto, 3 son rompehielos; el vector **nunca** se muestra) + 4 rapiditas para los juegos nocturnos.
- Cada persona recibe un **emoji-animal único** (pase verde con su nombre para el ayudante de la puerta).
- **Pool → parejas** (motor por eventos, `server/engine/matchmaker.js`): al entrar alguien se busca la mejor pareja con similitud ≥ T (0.8); si nadie, tras 60 s acepta ≥ T_min (0.6). Al cerrar, el sobrante forma un **trío**.
- “Tu pareja es Camila 🦊, búscala” · **📣 Llamar a mi pareja** (vibra/parpadea su celular) · rompehielos (“Coincidieron en 6 de 8…”).
- Confirmación: **QR personal** (o código de 3 dígitos) + “Ya nos presentamos” → **+10 c/u** guardados en la pareja.
- Las parejas confirmadas entran al **cascarón de equipo** de mejor encaje (capacidad 6, blanda 7), con **nombre automático** (“Los Trasnochadores del Sushi”, renombrable una vez). **Selfie de equipo** (≥ 4 miembros, primera vez +10, < 300 KB).
- **Llegadas tardías**: tras *Cerrar equipos* nadie hace pareja; van directo al equipo con mejor encaje y espacio (el más corto primero) y hacen el **ritual de bienvenida** (+15): escriben la cosa favorita de cada integrante y ellos confirman Sí/No.
- Admin: forzar/deshacer parejas, mover jugadores, marcar ausentes, *Cerrar equipos* (rebalancea si queda alguno con < 4).

### 2 · Caja fuerte — SIN ESP32
Cada equipo tiene una caja física. **No hay cerradura electrónica**: la app valida el código de 4 piezas, revela la combinación del candado y **el código impreso dentro de la caja se escribe en la app**, lo que contabiliza la apertura **en tiempo real** (orden, tiempo y bono).
1. **Dato del equipo**: “¿cuántas letras tiene la cosa favorita de *Camila*?” (dígito 3–9; si nadie tiene palabra de 3–9 letras, el admin fija una pregunta manual).
2. **Emoji**: 6 emojis impresos y escondidos; se elige de una cuadrícula de 30. Cuando un equipo abre, ese emoji **queda consumido** para los demás (elegirlo cuenta como fallo).
3. **Acertijo de un animal** (distinto por equipo, sin importar tildes/mayúsculas, con sinónimos).
4. **Número del sticker** del grupo de WhatsApp (común, lo fija el anfitrión en `config.caja.stickerDigit`).
- Enfriamiento 20 s. La app dice “X de 4 correctas” (`config.caja.showCorrectCount=false` para ocultarlo). Fallo: el premio de la caja baja 10 (mín. 20). Pista: −10 (gratis a los 15 min). Éxito: 100 base − fallos + bono de orden (+30/+20/+10) × multiplicador.
- A los 20 min el admin puede **forzar** las cajas pendientes con puntos mínimos; también **Abrir manual** por equipo.
- Edita en *Admin → Contenido → `caja`*: `realEmojis`, `emojiGrid`, `stickerDigit`, `boxes[n].lockCode` (combinación del candado) y `boxes[n].confirmCode` (código del papel dentro de la caja).

### 3 · La Bomba — teléfono descompuesto humano
`MUDOS (mímica) → SORDOS (voz por la ventanilla) → CIEGO (venda, manos)`; solo 2 sordos (audífonos). Roles **rotan** (nadie es ciego dos veces antes que todos) y existe **“Prefiero otro rol”** sin penalización. Admin: cola, **Llamar al equipo X** (vibran los celulares y se ven roles 15 s antes), iniciar, pausar, +tiempo, repetir ronda.
- **Charada del animal** (75 s) · **Objeto a ciegas** (3 × 20 s, 4 vasos, “Espacio exterior” siempre en el 4) · **Paparazzi a ciegas** (60 s, 3 disparos desde el celular del ciego, objetivo al azar entre el público) · **Karaoke roto** (75 s, 5 emojis, faltas −5 (máx −10) con el 25 % del público en 5 s, **sabotajes** que cuestan 5 pts).
- Cada juego vale 100: **jurado 50** (promedio de 3 jurados × 10) + **público 50** (voto de 10 s; en Charada Sí/No × 50), revelado con redoble: jurado → público → total. El **multiplicador** de equipo incompleto (tamaño del mayor / tuyo, tope ×1.5, en vivo) se aplica a caja y bomba, no a selfie/bienvenida/sabotajes/pistas.

### 4 · Cierre
`/camara` graba cada ronda del Karaoke (empieza con el temporizador, termina 5 s después y sube con el ID del equipo, ≤ 8 MB; el admin puede descartar y repetir). **Película de la noche**: tarjeta “Protagonista: *nombre*, a ciegas”, clips (los fallidos se saltan), mejor y peor foto Paparazzi, ranking y letra de **“Cumpleaños feliz”**.

### Después: juegos nocturnos (siguen intactos)
¿Quién mató a Gianella? (expediente + audios + veredicto), Descarga a la Madre de Keiko (acelerómetro), Kahoot, Farmeo de Aura (apuestas, duelos, ruleta), Estatua colectiva, Pixel Art secreto, Foto Loca y Ceremonia. Todos suman al **ledger de puntos de equipo**.

## 💰 Puntos y auditoría
Un solo **ledger append-only** (`ledger` en SQLite + vista *Admin → Puntos*): fecha, equipo, fuente, delta, saldo y motivo. Los ajustes manuales piden motivo y cada asiento tiene **↩ Deshacer** (crea un asiento contrario, no borra nada). Todas las constantes están en `data/config.json`.

## ✏️ Contenido editable
`Admin → Contenido` edita sin tocar código: configuración (`caja`, `bomba`, `kahoot`, `aura`, `crimen`, `foto`, `pixel`…) y **semillas** en `data/content/*.json`: `test` (8 preguntas con pesos), `animales-emoji` (40), `charadas` (60 animales), `objetos` (30 con opciones), `canciones` (25 con emojis-pista, tablero de 24 generado), `acertijos` (6 con sinónimos), `nombres-equipo` (30 + generador). ⚠️ El Kahoot, el crimen y los PINs vienen con **contenido de ejemplo**: cámbialo (el aviso amarillo del admin desaparece con `meta.example=false`).

## ✅ Cómo probar cada hito
| Hito | Prueba |
|---|---|
| H1 servidor/tiempo real/admin/pantalla | `npm start` → abre `/pantalla` y `/admin`, cambia de fase y mira cómo sincronizan |
| H2 registro/test/parejas/equipos/tardíos/selfie | `npm run sim:35` (motor puro, semilla fija: `-- --seed 7`) y `npm run bots` |
| H3 caja fuerte | `npm run bots`, Admin → fase *Caja Fuerte*; revisa orden, emojis consumidos y ledger |
| H4 bomba/jurado/voto/sabotaje/clips | abre `/jurado` (PIN) y `/camara` en dos pestañas, *Llamar equipo* y recorre los 4 juegos |
| H5 pulido/ensayo | `npm run e2e` (35 bots + 2 tardíos + 3 jurados + cámara + reconexión recorren las 14 fases, ≈ 4 min; **borra los datos**) |

`npm run sim:35` comprueba: 17 parejas + 1 trío, 6 equipos de 5–6, determinismo por semilla, tardíos sin pareja, multiplicador, rotación de roles y nombres únicos.

## 🧱 Arquitectura (resumen)
Node 22 + `ws` (WebSocket, servidor autoritativo, heartbeat 5 s, relojes sincronizados, reconexión automática) · **SQLite integrado** (`node:sqlite`; estado + ledger + invitados + auditoría) · frontend **Preact + htm sin build** servido tal cual (funciona sin internet) · motor de afinidad puro en `server/engine/matchmaker.js` · un módulo por juego en `server/games/*` con la misma interfaz (`init, enter, tick, guest, admin, force, view*`), así se agregan módulos nuevos sin tocar el núcleo.

Decisiones que se apartan del prompt original (se pueden revertir): **SQLite en vez de PostgreSQL** (cero instalación, un archivo, respaldo con *Admin → Copia de la base*; en Docker persiste en un volumen), **CSS propio en vez de Tailwind** (sin CDN: funciona offline), **sin ESP32** (ver Caja fuerte).

## 🔒 Seguridad básica
PIN de admin y jurado con *rate limit* (5 fallos → 1 min de bloqueo), sin datos personales más allá del nombre, aviso de consentimiento de fotos, subidas con tope de tamaño y validación JPEG, y limpieza al final: *Admin → Herramientas → Borrar selfies/fotos/clips* o *Reiniciar evento*.
