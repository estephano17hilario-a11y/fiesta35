// Vista del JURADO (/jurado): 3 jurados con PIN puntúan en secreto de 1 a 5 estrellas.
import { html, render, useState, connect, cx, fmt, useTick } from './lib.js';
import { keepAwake } from './sensors.js';

const ss = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* nada */ } return null; };
let state = null, status = 'connecting', denied = null, jtoken = ss('f35_jtoken'), juror = Number(ss('f35_juror')) || 0;
const root = document.getElementById('app');
const redraw = () => render(html`<${App} s=${state} />`, root);

const link = connect({
  role: 'jury',
  query: () => (jtoken && juror ? { jtoken, juror } : {}),
  onState: (s) => { state = s; redraw(); },
  onStatus: (st) => { status = st; redraw(); },
  onEvent: (ev, p) => {
    if (ev === 'LOGIN_OK') { jtoken = p.token; juror = p.juror; ss('f35_jtoken', jtoken); ss('f35_juror', String(juror)); denied = null; redraw(); }
    if (ev === 'LOGIN_DENIED') { denied = p.message; redraw(); }
  },
});
keepAwake();

function Login() {
  const [pin, setPin] = useState('');
  const [j, setJ] = useState(Number(ss('f35_juror')) || 1);
  return html`
    <form class="register" onSubmit=${(e) => { e.preventDefault(); link.send('JURY_LOGIN', { pin, juror: j }); }}>
      <div class="hero"><div class="hero-emoji">⚖️</div><h1>Jurado</h1><p class="mut">Tu voto es secreto: nadie más lo ve.</p></div>
      <div class="card"><label>¿Qué jurado eres?</label>
        <div class="choice" style=${{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>${[1, 2, 3].map((n) => html`<button type="button" class=${cx('opt', j === n && 'on')} onClick=${() => setJ(n)}>Jurado ${n}</button>`)}</div>
        <label>PIN<input class="input word" type="password" inputmode="numeric" placeholder="••••" value=${pin} onInput=${(e) => setPin(e.target.value)} /></label>
        ${denied && html`<div class="bad-card">${denied}</div>`}
      </div>
      <button class="btn pink block xl" type="submit">Entrar</button>
    </form>`;
}

function App({ s }) {
  useTick(500);
  const [stars, setStars] = useState(0);
  if (!s || s.locked) return html`<${Login} />`;
  const sc = s.jury, c = sc.current, now = link.serverNow();
  const mine = sc.myVote;
  const g = c && c.game;
  return html`
    <div class="app">
      ${status === 'closed' && html`<div class="offline">📡 Reconectando…</div>`}
      <header class="g-top" style=${{ '--c': 'var(--violet)' }}><div class="g-row"><div class="g-table"><span>⚖️</span><div><b>Jurado ${s.juror}</b><small>Voto secreto</small></div></div><button class="btn sm ghost" onClick=${() => { ss('f35_jtoken', null); location.reload(); }}>Salir</button></div></header>
      <main class="g-stage"><div class="stack">
        ${!c && html`<div class="card center-col"><div class="wait-ico">🕰️</div><h2>Esperando al siguiente equipo…</h2></div>`}
        ${c && html`
          <div class="card center-col" style=${{ '--c': c.color }}>
            <small class="mut">EN ESCENA</small><h2 style=${{ color: c.color }}>${c.emoji} ${c.teamName}</h2>
            <div class="chip pink">${c.icon} ${c.gameName} · ${c.gameIdx + 1}/${c.games}</div>
            <div class="chip">${({ intro: 'preparándose', ready: 'listos', play: 'jugando', mark: 'marcando', vote: 'VOTA AHORA', reveal: 'revelando', revealed: 'resultado', finished: 'terminó' })[c.status]}</div>
          </div>
          ${c.status === 'vote' && html`
            <div class="card center-col">
              ${c.key === 'charada' && g.animal && html`<small class="mut">EL ANIMAL ERA</small><div class="secret-w">${g.animal.toUpperCase()}</div>`}
              ${c.key === 'objeto' && html`<div class="obj-sum">${g.reveal.filter(Boolean).map((o) => html`<div class=${o.ok ? 'ok' : 'bad'}><b>${o.name}</b><span>vaso ${o.cup} ${o.ok ? '✔' : '✖'}</span></div>`)}</div>`}
              ${c.key === 'paparazzi' && html`<small class="mut">Objetivo: ${g.target ? g.target.name : '—'}</small>${g.photos.map((u) => html`<img class="selfie" src=${u} alt="" />`)}`}
              ${c.key === 'karaoke' && html`<small class="mut">CANCIÓN</small><div class="secret-w">${g.song}</div><p>${g.correct ? '🎉 Acertaron' : '😅 No acertaron'} · 🚩 ${g.faults} faltas</p>`}
              <h2>¿Qué tan bien lo hicieron?</h2>
              <div class="stars-pick big">${[1, 2, 3, 4, 5].map((n) => html`<button class=${cx('sp', (mine || stars) >= n && 'on')} onClick=${() => { setStars(n); link.send('JURY_VOTE', { stars: n }); }}>★</button>`)}</div>
              <small class="mut">${mine ? `Tu voto: ${mine} ★ (puedes cambiarlo) · ` : ''}cierra en ${Math.max(0, Math.ceil((c.voteEndsAt - now) / 1000))}s</small>
            </div>`}
          ${c.status !== 'vote' && c.key === 'karaoke' && html`<div class="card center-col"><small class="mut">Emojis</small><div class="k-big">${g.seq.join(' ') || '…'}</div></div>`}
          ${(c.status === 'reveal' || c.status === 'revealed') && c.result && html`<div class="card center-col result"><small>RESULTADO</small><div>Jurado <b>${c.result.jury}</b> · Público <b>${c.result.pub}</b></div><div class="big-num">${c.result.total} pts</div></div>`}
        `}
        <div class="card"><b>Totales de la Bomba</b>${sc.queue.map((t) => html`<div class="rank-row"><span>${t.emoji} ${t.name}</span><b>${t.done != null ? t.done : '—'}</b></div>`)}</div>
      </div></main>
    </div>`;
}
redraw();
