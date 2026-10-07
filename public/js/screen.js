// Pantalla Central de Proyección (/screen): TV / video beam.
import { html, render, useState, useEffect, useRef, connect, emit, useEvent, useTick, cx, fmt, clockLeft, confetti, money, joinBase } from './lib.js';
import * as sfx from './sfx.js';
import { ScreenCrimen, ScreenKeiko, ScreenKahoot, ScreenAura, ScreenEstatua, ScreenPixel, ScreenFoto, ScreenCeremonia, ScreenLibre } from './screen-games.js';
import { ScreenLobby, ScreenCaja, ScreenBomba, ScreenCierre } from './screen-new.js';

let state = null, status = 'connecting', joinUrl = '', unlocked = false;
const root = document.getElementById('app');
const redraw = () => render(html`<${App} s=${state} status=${status} />`, root);

const link = connect({
  role: 'screen',
  onState: (s) => { state = s; redraw(); },
  onStatus: (st) => { status = st; redraw(); },
  onEvent: (ev, p) => {
    if (ev === 'PLAY_AUDIO_EFFECT' && unlocked) sfx.play(p.id);
    emit(ev, p);
  },
});
joinBase().then((b) => { joinUrl = b + '/'; redraw(); });

function Hud({ s }) {
  useTick(250);
  const left = clockLeft(s.clock, link.serverNow());
  return html`
    <header class="hud">
      <div class="hud-l"><span class="logo">🎉</span><div><b>${s.meta.eventName}</b><small>${s.meta.birthdayName} · ${s.meta.age} años</small></div></div>
      <div class="hud-c"><span class="ph-ico">${s.phase.icon}</span><div><b>${s.phase.name}</b><small>Fase ${s.phase.idx + 1}/${s.phase.total}${s.phase.time ? ' · ' + s.phase.time : ''}</small></div></div>
      <div class="hud-r">
        ${left != null && html`<div class=${cx('clock', s.clock.paused && 'paused', left < 60000 && 'danger')}>${s.clock.paused ? '⏸ ' : ''}${fmt(left)}</div>`}
        <div class="hud-stars">${['keiko', 'estatua', 'pixel', 'foto'].map((k) => html`<span class=${s.stars[k] ? 'on' : ''}>★</span>`)}</div>
        <div class="hud-on">🟢 ${s.counts.online}/${s.counts.registered}</div>
      </div>
    </header>`;
}

function Ranking({ s }) {
  const max = Math.max(1, ...s.tables.map((t) => t.aura));
  const order = [...s.tables].sort((a, b) => b.aura - a.aura).map((t) => t.n);
  return html`
    <footer class="rank">
      ${s.tables.map((t) => html`
        <div class="rk" style=${{ '--c': t.color }}>
          <div class="rk-h"><span>${t.emoji} ${t.name}</span><b>#${order.indexOf(t.n) + 1}</b></div>
          <div class="rk-bar"><i style=${{ width: Math.max(4, (t.aura / max) * 100) + '%' }}></i></div>
          <div class="rk-v">✨ ${money(t.aura)}</div>
        </div>`)}
    </footer>`;
}

function Overlays({ s }) {
  const [star, setStar] = useState(null);
  const [floaters, setFloaters] = useState([]);
  const [joins, setJoins] = useState([]);
  const idRef = useRef(0);
  useEvent('STAR_UNLOCKED', (p) => { setStar(p.count); sfx.play('star'); confetti({ count: 320, origin: 'bottom', duration: 4500 }); setTimeout(() => setStar(null), 5200); });
  useEvent('REACTION', (p) => {
    const id = ++idRef.current;
    setFloaters((f) => [...f.slice(-30), { id, emoji: p.emoji, name: p.name, x: 5 + Math.random() * 88 }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 4200);
  });
  useEvent('GUEST_JOINED', (p) => {
    const id = ++idRef.current;
    sfx.play('pop');
    setJoins((j) => [...j.slice(-4), { id, name: p.name, animal: p.animal }]);
    setTimeout(() => setJoins((j) => j.filter((x) => x.id !== id)), 4500);
  });
  useEvent('DEFIBRILLATOR_SUCCESS', () => confetti({ count: 200 }));
  useTick(1000);
  const a = s.announce && link.serverNow() < s.announce.until ? s.announce : null;
  return html`
    ${a && html`<div class="announce-scr">📣 ${a.text}</div>`}
    ${star && html`<div class="star-scr"><div class="star-big">⭐</div><h1>¡ESTRELLA COLECTIVA ${star}/4!</h1><div class="star-row">${[1, 2, 3, 4].map((i) => html`<span class=${i <= star ? 'on' : ''}>★</span>`)}</div></div>`}
    <div class="floaters">${floaters.map((f) => html`<div class="fl" style=${{ left: f.x + '%' }}><span>${f.emoji}</span><small>${f.name}</small></div>`)}</div>
    <div class="joins">${joins.map((j) => html`<div class="jn">${j.animal ? j.animal.emoji : '👋'} <b>${j.name}</b> llegó a la fiesta</div>`)}</div>`;
}

function Stage({ s }) {
  useTick(100);
  const now = link.serverNow();
  const g = s.game;
  switch (s.phase.id) {
    case 'REGISTRATION': return html`<${ScreenLobby} s=${s} joinUrl=${joinUrl} />`;
    case 'CAJA_FUERTE': return g && html`<${ScreenCaja} s=${s} g=${g} />`;
    case 'DESACTIVA_BOMBA': return g && html`<${ScreenBomba} s=${s} g=${g} now=${now} />`;
    case 'CIERRE_JUEGOS': return g && html`<${ScreenCierre} s=${s} g=${g} now=${now} link=${link} />`;
    case 'GIANELLA_CRIMEN': return g && html`<${ScreenCrimen} s=${s} g=${g} now=${now} />`;
    case 'DESCARGA_MADRE_KEIKO': return g && html`<${ScreenKeiko} s=${s} g=${g} now=${now} />`;
    case 'KAHOOT': return g && html`<${ScreenKahoot} s=${s} g=${g} now=${now} />`;
    case 'FARMEO_AURA': return g && html`<${ScreenAura} s=${s} g=${g} now=${now} />`;
    case 'ESTATUA': return g && html`<${ScreenEstatua} s=${s} g=${g} now=${now} />`;
    case 'PIXEL_ART': return g && html`<${ScreenPixel} s=${s} g=${g} now=${now} />`;
    case 'FOTO_LOCA': return g && html`<${ScreenFoto} s=${s} g=${g} now=${now} />`;
    case 'CEREMONIA': return g && html`<${ScreenCeremonia} s=${s} g=${g} />`;
    default: return html`<${ScreenLibre} s=${s} joinUrl=${joinUrl} now=${now} />`;
  }
}

function App({ s, status }) {
  const [on, setOn] = useState(false);
  const activate = () => {
    unlocked = sfx.unlock(); setOn(true); sfx.play('pop');
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch { /* nada */ }
  };
  if (!s) return html`<div class="boot"><div class="spinner"></div><p>Conectando…</p></div>`;
  return html`
    <div class=${cx('scr', s.disco.on && 'disco')} data-phase=${s.phase.id}>
      ${status === 'closed' && html`<div class="offline">📡 Reconectando con el servidor…</div>`}
      <${Hud} s=${s} />
      <main class="scr-main"><${Stage} s=${s} /></main>
      <${Ranking} s=${s} />
      <${Overlays} s=${s} />
      ${!on && html`<button class="unlock" onClick=${activate}><span>🔊</span><b>Toca para activar SONIDO y PANTALLA COMPLETA</b><small>(el navegador exige un clic antes de reproducir audio)</small></button>`}
    </div>`;
}
redraw();
