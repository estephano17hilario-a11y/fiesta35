// App del invitado (celular o laptop): registro, test, pareja, equipo y juegos sincronizados.
import { html, render, useState, useEffect, connect, emit, useEvent, useTick, cx, fmt, clockLeft, confetti, vibrate, tableOf, money, batteryInfo } from './lib.js';
import { Motion, keepAwake } from './sensors.js';
import { Crimen, Waiting } from './guest-a.js';
import { Keiko, Kahoot, Aura, Estatua, Pixel, Foto, Ceremonia, Libre, DiscoLayer, SensorChip, Reactions } from './guest-b.js';
import { Register, TestFlow, EntradaView, RitualCards } from './guest-entrada.js';
import { Caja } from './guest-caja.js';
import { Bomba } from './guest-bomba.js';

const LS = 'f35_token';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* modo privado */ } };

let state = null, status = 'connecting', regError = null, registering = false;
const root = document.getElementById('app');
const bat = batteryInfo();
const redraw = () => render(html`<${App} s=${state} status=${status} />`, root);

const link = connect({
  role: 'guest',
  query: () => (get(LS) ? { token: get(LS) } : {}),
  telemetry: () => ({ ...bat, sensor: Motion.status }),
  onState: (s) => {
    state = s;
    if (s.me === null && get(LS) && !registering) set(LS, null); // token viejo (evento reiniciado)
    redraw();
  },
  onStatus: (st) => { status = st; redraw(); },
  onEvent: (ev, p) => {
    if (ev === 'REGISTERED') { set(LS, p.token); registering = false; regError = null; }
    if (ev === 'REGISTER_ERROR') { regError = p.message; registering = false; redraw(); }
    if (ev === 'VIBRATE_TRIGGER') vibrate(p.pattern);
    emit(ev, p);
  },
});
keepAwake();

/* ───────────── Cabecera, avisos y superposiciones ───────────── */
function Stars({ stars }) {
  return html`<div class="stars">${['keiko', 'estatua', 'pixel', 'foto'].map((k) => html`<span class=${stars[k] ? 'on' : ''}>★</span>`)}</div>`;
}

function TopBar({ s, link }) {
  useTick(500);
  const left = clockLeft(s.clock, link.serverNow());
  const inTeam = s.me.stage === 'team' && s.me.table;
  const t = inTeam ? tableOf(s, s.me.table) : null;
  const tb = inTeam ? s.tables.find((x) => x.n === s.me.table) : null;
  return html`
    <header class="g-top" style=${{ '--c': t ? t.color : 'var(--pink)' }}>
      <div class="g-row">
        <div class="g-table"><span>${inTeam ? t.emoji : s.me.animal && s.me.animal.emoji}</span>
          <div><b>${inTeam ? t.name : s.me.alias || s.me.name}</b><small>${s.me.animal ? `${s.me.animal.emoji} ${s.me.alias || s.me.name}` : ''}</small></div></div>
        ${inTeam && html`<div class="g-aura"><small>PUNTOS${tb && tb.mult > 1 ? ` ×${tb.mult}` : ''}</small><b>✨ ${money(tb ? tb.aura : 0)}</b></div>`}
      </div>
      <div class="g-row g-sub">
        <div class="g-phase">${s.phase.icon} <b>${s.phase.name}</b></div>
        ${left != null && html`<div class=${cx('g-clock', s.clock.paused && 'paused', left < 60000 && 'danger')}>${s.clock.paused ? '⏸ ' : ''}${fmt(left)}</div>`}
        <${Stars} stars=${s.stars} />
      </div>
    </header>`;
}

function Overlays({ s, link }) {
  const [toast, setToast] = useState(null);
  const [star, setStar] = useState(null);
  const [team, setTeam] = useState(null);
  useEvent('TOAST', (p) => { setToast(p.message); setTimeout(() => setToast(null), 3500); });
  useEvent('STAR_UNLOCKED', (p) => { setStar(p.count); confetti({ count: 260, origin: 'bottom' }); vibrate([200, 100, 200, 100, 500]); setTimeout(() => setStar(null), 4200); });
  useEvent('TEAM_ASSIGNED', (p) => { setTeam(p.team); confetti({ count: 120 }); setTimeout(() => setTeam(null), 4500); });
  useEvent('PAIR_CALL', () => vibrate([300, 120, 300, 120, 300]));
  const a = s.announce && link.serverNow() < s.announce.until ? s.announce : null;
  useTick(1000);
  const tt = team && tableOf(s, team);
  return html`
    ${a && html`<div class="announce">📣 ${a.text}</div>`}
    ${toast && html`<div class="toast">${toast}</div>`}
    ${star && html`<div class="star-overlay"><div class="star-big">⭐</div><h2>¡Estrella colectiva ${star}/4!</h2></div>`}
    ${tt && html`<div class="star-overlay" style=${{ '--c': tt.color }}><div class="star-big">${tt.emoji}</div><h2>¡Tu equipo: ${tt.name}!</h2><p>Búscalos en la terraza</p></div>`}`;
}

function Cierre({ s, link }) {
  return html`<div class="stack"><div class="card center-col"><div class="wait-ico">🎬</div><h2>La película de la noche</h2><p class="mut">Mira la pantalla grande: están pasando los mejores momentos. Al final, ¡todos cantamos “Cumpleaños feliz”!</p></div><${Reactions} link=${link} /></div>`;
}

function Phase({ s }) {
  const g = s.game;
  if (s.me.stage !== 'team') return g ? html`<${EntradaView} s=${s} g=${g} link=${link} />` : null;
  switch (s.phase.id) {
    case 'REGISTRATION': return g ? html`<${EntradaView} s=${s} g=${g} link=${link} />` : null;
    case 'CAJA_FUERTE': return g ? html`<${Caja} s=${s} g=${g} link=${link} />` : null;
    case 'DESACTIVA_BOMBA': return g ? html`<${Bomba} s=${s} g=${g} link=${link} />` : null;
    case 'CIERRE_JUEGOS': return html`<${Cierre} s=${s} link=${link} />`;
    case 'GIANELLA_CRIMEN': return g ? html`<${Crimen} s=${s} g=${g} link=${link} />` : null;
    case 'DESCARGA_MADRE_KEIKO': return g ? html`<${Keiko} s=${s} g=${g} link=${link} />` : null;
    case 'KAHOOT': return g ? html`<${Kahoot} s=${s} g=${g} link=${link} />` : null;
    case 'FARMEO_AURA': return g ? html`<${Aura} s=${s} g=${g} link=${link} />` : null;
    case 'ESTATUA': return g ? html`<${Estatua} s=${s} g=${g} link=${link} />` : null;
    case 'PIXEL_ART': return g ? html`<${Pixel} s=${s} g=${g} link=${link} />` : null;
    case 'FOTO_LOCA': return g ? html`<${Foto} s=${s} g=${g} link=${link} />` : null;
    case 'CEREMONIA': return g ? html`<${Ceremonia} s=${s} g=${g} />` : null;
    default: return html`<${Libre} s=${s} link=${link} />`;
  }
}

function App({ s, status }) {
  if (!s) return html`<div class="boot"><div class="spinner"></div><p>Conectando con la fiesta…</p></div>`;
  if (!s.me) return html`<div class="app"><${Register} s=${s} link=${link} regError=${regError} onSubmit=${(p) => { registering = true; regError = null; link.send('REGISTER', p); }} /></div>`;
  if (s.me.stage === 'test') return html`${status === 'closed' ? html`<div class="offline">📡 Reconectando…</div>` : ''}<${TestFlow} s=${s} link=${link} />`;
  const showReactions = s.me.stage === 'team' && ['REGISTRATION', 'CEREMONIA'].includes(s.phase.id);
  return html`
    <div class="app" data-phase=${s.phase.id}>
      ${status === 'closed' && html`<div class="offline">📡 Reconectando…</div>`}
      <${TopBar} s=${s} link=${link} />
      <main class="g-stage"><${RitualCards} s=${s} link=${link} /><${Phase} s=${s} /></main>
      ${showReactions && html`<${Reactions} link=${link} />`}
      <${Overlays} s=${s} link=${link} />
      <${DiscoLayer} s=${s} link=${link} />
    </div>`;
}

redraw();
