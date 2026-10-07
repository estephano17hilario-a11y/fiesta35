// Vista de CÁMARA (/camara): celular en el trípode. Graba cada ronda del Karaoke con MediaRecorder y sube el clip.
import { html, render, useState, useRef, useEffect, connect, cx, useTick } from './lib.js';
import { keepAwake } from './sensors.js';

const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* nada */ } return null; };
let state = null, status = 'connecting', denied = null, atoken = ss('f35_ctoken');
let stream = null, recorder = null, chunks = [], clipId = null, ui = { cam: false, rec: false, msg: '', up: '' };
const root = document.getElementById('app');
const redraw = () => render(html`<${App} s=${state} />`, root);

const mime = () => ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';

async function enableCamera(videoEl) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
    videoEl.srcObject = stream; await videoEl.play();
    ui.cam = true; ui.msg = ''; link.send('CAMERA_READY');
  } catch { ui.msg = 'No se pudo abrir la cámara. Se necesita HTTPS (túnel Cloudflare o npm run start:https) y permisos.'; }
  redraw();
}

function startRec(id) {
  if (!stream || recorder) return;
  clipId = id; chunks = [];
  try { recorder = new MediaRecorder(stream, { mimeType: mime() || undefined, videoBitsPerSecond: 700000, audioBitsPerSecond: 64000 }); }
  catch { link.send('CAMERA_FAILED', { clipId: id }); ui.msg = 'Este navegador no puede grabar.'; redraw(); return; }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const id2 = clipId; recorder = null; ui.rec = false; ui.up = `Subiendo ${(blob.size / 1048576).toFixed(1)} MB…`; redraw();
    link.send('CAMERA_STATE', { recording: false });
    if (blob.size > 8 * 1024 * 1024) { link.send('CAMERA_FAILED', { clipId: id2 }); ui.up = '❌ Clip demasiado grande (se descarta)'; redraw(); return; }
    try {
      const r = await fetch(`/api/upload/clip?t=${atoken}&id=${id2}`, { method: 'POST', body: blob, headers: { 'content-type': blob.type } });
      ui.up = r.ok ? '✅ Clip subido' : '❌ Falló la subida';
      if (!r.ok) link.send('CAMERA_FAILED', { clipId: id2 });
    } catch { ui.up = '❌ Sin conexión: clip perdido'; link.send('CAMERA_FAILED', { clipId: id2 }); }
    redraw();
  };
  recorder.start(1000);
  ui.rec = true; ui.up = ''; redraw();
  link.send('CAMERA_STATE', { recording: true, clipId: id });
  setTimeout(() => { if (recorder && recorder.state === 'recording' && clipId === id) stopRec(); }, 100000); // tope de seguridad
}
function stopRec() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }

const link = connect({
  role: 'camera',
  query: () => (atoken ? { atoken } : {}),
  onState: (s) => { state = s; redraw(); },
  onStatus: (st) => { status = st; redraw(); if (st === 'open' && ui.cam) link.send('CAMERA_READY'); },
  onEvent: (ev, p) => {
    if (ev === 'LOGIN_OK') { atoken = p.token; ss('f35_ctoken', atoken); denied = null; redraw(); }
    if (ev === 'LOGIN_DENIED') { denied = p.message; redraw(); }
    if (ev === 'REC_START') startRec(p.clipId);
    if (ev === 'REC_STOP') stopRec();
  },
});
keepAwake();

function Login() {
  const [key, setKey] = useState('');
  return html`
    <form class="register" onSubmit=${(e) => { e.preventDefault(); link.send('CAMERA_LOGIN', { key }); }}>
      <div class="hero"><div class="hero-emoji">🎥</div><h1>Cámara</h1><p class="mut">Celular en el trípode</p></div>
      <div class="card"><label>Clave del anfitrión<input class="input" type="password" value=${key} onInput=${(e) => setKey(e.target.value)} /></label>${denied && html`<div class="bad-card">${denied}</div>`}</div>
      <button class="btn pink block xl" type="submit">Entrar</button>
    </form>`;
}

function App({ s }) {
  const vref = useRef();
  useTick(500);
  if (!s || s.locked) return html`<${Login} />`;
  const c = s.camera;
  return html`
    <div class="app cam-app">
      ${status === 'closed' && html`<div class="offline">📡 Reconectando…</div>`}
      <div class=${cx('cam-view', ui.rec && 'rec')}><video ref=${vref} playsinline muted></video>${ui.rec && html`<div class="rec-dot">● REC</div>`}</div>
      <div class="stack cam-ctl">
        ${!ui.cam && html`<button class="btn cyan block xl" onClick=${() => enableCamera(vref.current)}>📷 Activar cámara y micrófono</button>`}
        ${ui.msg && html`<div class="bad-card">${ui.msg}</div>`}
        <div class="card center-col"><b>${ui.cam ? '🟢 Lista para grabar' : '⚪ Sin cámara'}</b>
          <small class="mut">En escena: ${c.team ? `${c.team} · ${c.game}` : '—'}</small>
          ${ui.up && html`<div class="chip">${ui.up}</div>`}
          <small class="mut">La grabación empieza sola con el temporizador del Karaoke y termina 5 s después.</small></div>
        <button class="btn ghost" disabled=${!ui.cam} onClick=${() => { if (ui.rec) stopRec(); else startRec('test'); }}>${ui.rec ? '⏹ Parar prueba' : '🧪 Probar 5 s'}</button>
      </div>
    </div>`;
}
redraw();
