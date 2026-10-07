// Utilidades compartidas por Invitado, Pantalla y Admin.
import { h, html, render as preactRender, useState, useEffect, useRef, useMemo, useCallback } from '/vendor/preact.js';
export { h, html, useState, useEffect, useRef, useMemo, useCallback };

/** render() que limpia el contenido inicial (pantalla de carga) la primera vez. */
export function render(vnode, root) {
  if (!root._cleared) { root.textContent = ''; root._cleared = true; }
  return preactRender(vnode, root);
}

/** Conexión WebSocket con reconexión, sincronía de reloj con el servidor y heartbeat. */
export function connect({ role, query = () => ({}), onState, onEvent, onStatus, telemetry }) {
  let ws, retry = 0, hb, closed = false;
  const api = { skew: 0, rtt: 0, open: false, serverNow: () => Date.now() + api.skew, send, close };

  function send(event, payload = {}) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ event, payload, timestamp: Date.now() }));
  }
  function beat() {
    send('HEARTBEAT', { t0: Date.now(), rtt: api.rtt, ...(telemetry ? telemetry() : {}), visible: !document.hidden });
  }
  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const qs = new URLSearchParams({ role, ...query() }).toString();
    ws = new WebSocket(`${proto}://${location.host}/ws?${qs}`);
    ws.onopen = () => { retry = 0; api.open = true; onStatus && onStatus('open'); beat(); clearInterval(hb); hb = setInterval(beat, 5000); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.event === 'PONG') {
        api.rtt = Date.now() - m.payload.t0;
        const skew = m.payload.serverTime + api.rtt / 2 - Date.now();
        api.skew = api.skewSet ? api.skew * 0.6 + skew * 0.4 : skew;
        api.skewSet = true;
      } else if (m.event === 'SYNC_STATE') {
        if (!api.skewSet) api.skew = m.timestamp - Date.now();
        onState(m.payload);
      } else onEvent && onEvent(m.event, m.payload);
    };
    ws.onclose = () => {
      api.open = false; clearInterval(hb); onStatus && onStatus('closed');
      if (!closed) setTimeout(open, Math.min(4000, 400 * 2 ** retry++));
    };
    ws.onerror = () => {};
  }
  function close() { closed = true; try { ws.close(); } catch { /* nada */ } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
  open();
  return api;
}

/** Re-render cada `ms` milisegundos (relojes, cuentas regresivas). */
export function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(i); }, [ms]);
}

export const cx = (...a) => a.filter(Boolean).join(' ');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function fmt(ms) {
  ms = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(ms / 60), s = ms % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export const secLeft = (endsAt, now) => Math.max(0, Math.ceil((endsAt - now) / 1000));
export const initials = (n = '') => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
export const money = (n) => Number(n || 0).toLocaleString('es-PE');
export const tableOf = (state, n) => (state.tables || []).find((t) => t.n === n) || { n, name: 'Mesa ' + n, color: '#888', emoji: '🪑' };

/** Reloj de fase: devuelve ms restantes o null si la fase no tiene cuenta regresiva. */
export function clockLeft(clock, now) {
  if (!clock || !clock.endsAt) return clock && clock.paused && clock.remainingMs != null ? clock.remainingMs : null;
  if (clock.paused) return clock.remainingMs;
  return Math.max(0, clock.endsAt - now);
}

/** Confeti de pantalla completa (canvas efímero). */
export function confetti({ count = 140, duration = 3200, origin = 'top' } = {}) {
  const c = document.createElement('canvas');
  Object.assign(c.style, { position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 });
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const colors = ['#ff2e93', '#18f0ff', '#b6ff3b', '#ffb800', '#8a5cff', '#ffffff'];
  const ps = Array.from({ length: count }, () => ({
    x: Math.random() * c.width, y: origin === 'top' ? -20 - Math.random() * c.height * 0.4 : c.height + 10,
    vx: (Math.random() - 0.5) * 6, vy: origin === 'top' ? 2 + Math.random() * 4 : -(8 + Math.random() * 12),
    s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const k = t - t0;
    g.clearRect(0, 0, c.width, c.height);
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.vy += origin === 'top' ? 0.05 : 0.28; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - k / duration);
      g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore();
    }
    if (k < duration) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

export function vibrate(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* iOS */ } }

/** Hook: estado de batería para la telemetría. */
export function batteryInfo() {
  const info = { battery: null, charging: null };
  if (navigator.getBattery) navigator.getBattery().then((b) => {
    const upd = () => { info.battery = Math.round(b.level * 100); info.charging = b.charging; };
    upd(); b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
  }).catch(() => {});
  return info;
}

// ── Bus de eventos del servidor (no incluidos en SYNC_STATE) ──
const bus = new Set();
export const emit = (ev, p) => bus.forEach((f) => f(ev, p));
export function useEvent(ev, fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const f = (e, p) => { if (e === ev) ref.current(p); };
    bus.add(f);
    return () => bus.delete(f);
  }, [ev]);
}

/** SVG de un código QR (requiere /vendor/qrcode.js cargado como global `qrcode`). */
export function qrSvg(text, { dark = '#05060f', light = '#ffffff', margin = 2 } = {}) {
  if (typeof qrcode === 'undefined') return '';
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin},${r + margin}h1v1h-1z`;
  const size = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

/** URL pública para unirse (QR): PUBLIC_URL > dominio actual > IP de la LAN. */
export async function joinBase() {
  try {
    const info = await (await fetch('/api/info')).json();
    if (info.publicUrl) return info.publicUrl.replace(/\/$/, '');
    if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return (info.lan[0] || location.origin).replace(/\/$/, '');
    return location.origin;
  } catch { return location.origin; }
}

/* ── Pantalla completa en todas las vistas: botón ⛶ flotante (o tecla F) ── */
(function installFullscreen() {
  const el = document.documentElement;
  const can = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!can) return; // iPhone/Safari: usar "Añadir a pantalla de inicio" (la app ya es standalone)
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const toggle = () => {
    try {
      if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch { /* bloqueado por el navegador */ }
  };
  const b = document.createElement('button');
  b.className = 'fs-btn'; b.type = 'button'; b.title = 'Pantalla completa (F)'; b.textContent = '⛶';
  b.onclick = toggle;
  const sync = () => { b.textContent = isFs() ? '🗗' : '⛶'; };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  document.addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) toggle(); });
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(b));
  if (document.body) document.body.appendChild(b);
})();
