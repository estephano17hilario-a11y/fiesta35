// Sensores de movimiento del celular (acelerómetro) con permisos de iOS y modo de respaldo táctil.
// Nota: iOS y Chrome-Android solo entregan DeviceMotion en contextos seguros (HTTPS o localhost).
const G = 9.81;
const S = { status: 'unknown', delta: 0, peak: 0, at: 0, listening: false, listeners: new Set() };

function onMotion(e) {
  const a = e.accelerationIncludingGravity || e.acceleration;
  if (!a || a.x == null) return;
  const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  // Si el dispositivo ya entrega aceleración lineal (sin gravedad), la usamos tal cual.
  const lin = e.accelerationIncludingGravity ? Math.abs(mag - G) : mag;
  S.delta = lin;
  S.peak = Math.max(S.peak, lin);
  S.at = Date.now();
  if (S.status !== 'ok') { S.status = 'ok'; S.listeners.forEach((f) => f(S.status)); }
}

function listen() {
  if (S.listening) return;
  S.listening = true;
  window.addEventListener('devicemotion', onMotion);
  // Si en 2 s no llega ningún evento, el dispositivo no tiene sensor o el contexto no es seguro.
  setTimeout(() => {
    if (S.status !== 'ok') { S.status = 'none'; S.listeners.forEach((f) => f(S.status)); }
  }, 2000);
}

export const Motion = {
  get status() { return S.status; },
  get secure() { return window.isSecureContext; },
  onChange(fn) { S.listeners.add(fn); return () => S.listeners.delete(fn); },
  /** Debe llamarse dentro de un gesto del usuario (clic/tap) para iOS. */
  async enable() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') { S.status = 'denied'; S.listeners.forEach((f) => f(S.status)); return S.status; }
      }
      if (typeof DeviceMotionEvent === 'undefined') { S.status = 'none'; S.listeners.forEach((f) => f(S.status)); return S.status; }
      listen();
    } catch { S.status = 'denied'; S.listeners.forEach((f) => f(S.status)); }
    return S.status;
  },
  /** Pico de movimiento desde la última lectura (y reinicia el acumulador). */
  takePeak() { const p = S.peak; S.peak = 0; return p; },
  get fresh() { return Date.now() - S.at < 1500; },
};

// Sin permiso explícito (Android, desktop) intentamos escuchar de inmediato.
if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission !== 'function') {
  if (window.isSecureContext) listen(); else S.status = 'none';
}

/** Mantiene la pantalla encendida mientras la app está abierta (si el navegador lo permite). */
export async function keepAwake() {
  try {
    if (!('wakeLock' in navigator)) return;
    let lock = await navigator.wakeLock.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) { try { lock = await navigator.wakeLock.request('screen'); } catch { /* nada */ } }
    });
  } catch { /* sin soporte */ }
}
