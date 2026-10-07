// Panel Maestro (/admin): control de fases, juegos, audio del DJ, puntos y telemetría.
import { html, render, useState, useEffect, useRef, useMemo, connect, emit, useEvent, useTick, cx, fmt, clockLeft, money, tableOf, joinBase } from './lib.js';
import * as sfx from './sfx.js';

const SS = (k, v) => { try { v === undefined ? sessionStorage.getItem(k) : v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); return sessionStorage.getItem(k); } catch { return null; } };
let state = null, status = 'connecting', denied = null, localSound = false, atoken = SS('f35_atoken');
const root = document.getElementById('app');
const redraw = () => render(html`<${App} s=${state} status=${status} />`, root);

const link = connect({
  role: 'admin',
  query: () => (atoken ? { atoken } : {}),
  onState: (s) => { state = s; redraw(); },
  onStatus: (st) => { status = st; redraw(); },
  onEvent: (ev, p) => {
    if (ev === 'ADMIN_OK') { atoken = p.token; SS('f35_atoken', p.token); denied = null; redraw(); }
    if (ev === 'ADMIN_DENIED') { denied = p.message; redraw(); }
    if (ev === 'PLAY_AUDIO_EFFECT' && localSound) sfx.play(p.id);
    emit(ev, p);
  },
});
const cmd = (c, args = {}) => link.send('ADMIN_CMD', { cmd: c, args });
const ask = (msg, fn) => { if (confirm(msg)) fn(); };

/* ─────────── Pequeños bloques ─────────── */
const Btn = ({ c = '', onClick, children, disabled, title }) => html`<button class=${cx('btn sm', c)} onClick=${onClick} disabled=${disabled} title=${title}>${children}</button>`;
const Sec = ({ title, right, children, cls }) => html`<section class=${cx('card adm-sec', cls)}><div class="sec-h"><h3>${title}</h3>${right}</div>${children}</section>`;

function Login() {
  const [key, setKey] = useState('');
  return html`
    <form class="login card" onSubmit=${(e) => { e.preventDefault(); link.send('ADMIN_LOGIN', { key }); }}>
      <div class="hero-emoji">🎛️</div><h1>Master Admin Console</h1>
      <p class="mut">Acceso exclusivo del anfitrión / DJ</p>
      <input class="input" type="password" placeholder="Clave maestra" autofocus value=${key} onInput=${(e) => setKey(e.target.value)} />
      ${denied && html`<div class="bad-card">${denied}</div>`}
      <button class="btn pink block xl" type="submit">Entrar</button>
    </form>`;
}

/* ─────────── Cabecera y control de fase ─────────── */
function Header({ s }) {
  useTick(500);
  const left = clockLeft(s.clock, link.serverNow());
  return html`
    <header class="adm-head">
      <div class="ah-t"><b>🎛️ MASTER ADMIN CONSOLE</b>
        <span class=${cx('dot', status === 'open' ? 'ok' : 'bad')}></span><span>${status === 'open' ? 'ONLINE' : 'OFFLINE'}</span>
        <span class="chip">[${s.counts.online}/${s.counts.registered} clientes conectados]</span></div>
      <div class="ah-p">FASE: <b>${s.phase.icon} ${s.phase.name}</b> ${left != null && html`<span class=${cx('clock', s.clock.paused && 'paused')}>(${s.clock.paused ? '⏸ ' : ''}${fmt(left)})</span>`}</div>
    </header>
    ${s.example && html`<div class="warn">⚠️ Estás usando el contenido de EJEMPLO (preguntas, PINs, sospechosos…). Edítalo en la pestaña <b>Contenido</b> y pon <code>"example": false</code> en <code>meta</code> para ocultar este aviso.</div>`}`;
}

function PhaseControl({ s }) {
  const idx = s.phase.idx;
  return html`
    <${Sec} title="CONTROL DE FASES Y JUEGO">
      <div class="row gap wrap">
        <${Btn} c="ghost" onClick=${() => cmd('PREV_PHASE')} disabled=${idx <= 0}>« Fase ant.<//>
        <${Btn} c="cyan" onClick=${() => cmd('NEXT_PHASE')} disabled=${idx >= s.phase.total - 1}>Fase sig. »<//>
        <${Btn} c=${s.clock.paused ? 'lime' : 'amber'} onClick=${() => cmd('PAUSE_TOGGLE')}>${s.clock.paused ? '▶ Reanudar reloj' : '⏸ Pausar reloj'}<//>
        <${Btn} onClick=${() => cmd('ADD_TIME', { seconds: 120 })}>+2 min<//>
        <${Btn} onClick=${() => cmd('ADD_TIME', { seconds: -60 })}>−1 min<//>
        <${Btn} c="pink" onClick=${() => ask('¿Forzar el éxito de la fase actual?', () => cmd('FORCE_SUCCESS'))}>⚡ Forzar éxito<//>
      </div>
      <div class="phase-list">
        ${s.phases.map((p, i) => html`<button class=${cx('ph', p.id === s.phase.id && 'on', i < idx && 'past')} onClick=${() => (p.id === s.phase.id ? null : ask(`¿Ir a "${p.name}"?`, () => cmd('SET_PHASE', { phase: p.id })))}><span>${p.icon}</span><b>${p.name}</b><small>${p.time}</small></button>`)}
      </div>
    <//>`;
}

/* ─────────── Paneles por juego ─────────── */
function GamePanel({ s }) {
  const g = s.game;
  switch (s.phase.id) {
    case 'REGISTRATION': return html`<${EntradaP} s=${s} />`;
    case 'CAJA_FUERTE': return html`<${CajaP} s=${s} />`;
    case 'CIERRE_JUEGOS': return html`<${CierreP} s=${s} g=${g} />`;
    case 'DESACTIVA_BOMBA': return html`<${BombaP} s=${s} />`;
    case 'GIANELLA_CRIMEN': return html`<${CrimenP} s=${s} g=${g} />`;
    case 'DESCARGA_MADRE_KEIKO': return html`<${KeikoP} s=${s} g=${g} />`;
    case 'KAHOOT': return html`<${KahootP} s=${s} g=${g} />`;
    case 'FARMEO_AURA': return html`<${AuraP} s=${s} g=${g} />`;
    case 'ESTATUA': return html`<${EstatuaP} s=${s} g=${g} />`;
    case 'PIXEL_ART': return html`<${PixelP} s=${s} g=${g} />`;
    case 'FOTO_LOCA': return html`<${FotoP} s=${s} g=${g} />`;
    case 'CEREMONIA': return html`<${CeremoniaP} s=${s} g=${g} />`;
    default: return html`<${DiscoP} s=${s} />`;
  }
}

/* ─────────── ENTRADA ─────────── */
function EntradaP({ s }) {
  const e = s.entrada, c = e.counts;
  useTick(1000);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const poolOpts = e.pool.map((p) => html`<option value=${p.id}>${p.animal ? p.animal.emoji : ''} ${p.name}</option>`);
  return html`
    <${Sec} title="🚪 Entrada · test, parejas y equipos" right=${html`<span class=${cx('chip', e.closed && 'ok')}>${e.closed ? '🔒 cerrados' : 'abierta'}</span>`}>
      <div class="stats-row">
        <span class="chip">${c.registered} registrados</span><span class="chip">${c.testing} en test</span><span class="chip amber">${c.waiting} esperando</span>
        <span class="chip pink">${c.paired} emparejados</span><span class="chip ok">${c.inTeam} en equipo</span><span class="chip">${c.pairs} parejas</span><span class="chip">${c.completeTeams}/${c.teams} equipos completos</span>
      </div>
      <div class="row gap wrap">
        <${Btn} c="pink" onClick=${() => ask('¿Cerrar la formación de equipos? Se emparejan los sobrantes, se forma el trío, se ubican parejas pendientes y se reequilibra.', () => cmd('ENTRADA_CLOSE'))} disabled=${e.closed}>🔒 Cerrar equipos<//>
        <${Btn} c="ghost" onClick=${() => cmd('ENTRADA_REOPEN')} disabled=${!e.closed}>Reabrir<//>
        <${Btn} c="amber" onClick=${() => cmd('ENTRADA_PAIR_NOW')} title="Empareja ya a todos los que esperan, sin umbral de afinidad">💞 Emparejar a todos ya<//>
        <${Btn} c="ghost" onClick=${() => cmd('ENTRADA_DEMO', { n: 6 })} title="Agrega 6 invitados falsos para probar solo">🤖 +6 jugadores de prueba<//>
        <a class="btn sm cyan" href="/qr" target="_blank">🧾 QR de entrada</a>
      </div>
      <h4>Pool (esperando pareja)</h4>
      ${e.pool.length === 0 ? html`<p class="mut sm">Nadie en espera.</p>` : html`<div class="chips">${e.pool.map((p) => html`<span class="chip">${p.animal ? p.animal.emoji : ''} ${p.name} · ${Math.round((link.serverNow() - p.since) / 1000)}s</span>`)}</div>`}
      <div class="row gap wrap"><select class="input sm" value=${a} onChange=${(x) => setA(x.target.value)}><option value="">Forzar pareja: A…</option>${poolOpts}</select><select class="input sm" value=${b} onChange=${(x) => setB(x.target.value)}><option value="">B…</option>${poolOpts}</select><${Btn} onClick=${() => { cmd('ENTRADA_FORCE_PAIR', { a, b }); setA(''); setB(''); }} disabled=${!a || !b || a === b}>💞 Emparejar<//></div>
      <h4>Parejas</h4>
      <div class="pairs">${e.pairs.map((p) => html`<div class=${cx('pr', p.team && 'done')}><span>${p.members.map((m) => `${m.animal ? m.animal.emoji : ''} ${m.name}`).join(' + ')} <small class="mut">afinidad ${p.sim}%</small></span>
        <span>${p.team ? `→ Equipo ${p.team}` : p.found ? '📲 se encontraron' : '🔎 buscándose'} · ${p.conf}/${p.members.length} presentados</span>
        <span class="row gap-s">${!p.team && html`<${Btn} c="lime" onClick=${() => cmd('ENTRADA_FORCE_CONFIRM', { pair: p.id })}>Confirmar<//><${Btn} c="ghost" onClick=${() => cmd('ENTRADA_UNPAIR', { pair: p.id })}>Deshacer<//>`}</span></div>`)}</div>
      ${e.ritual.length > 0 && html`<h4>Rituales de bienvenida</h4>${e.ritual.map((r) => html`<div class="rank-row"><span>🧳 ${r.name} → Equipo ${r.team}</span><b>${r.done ? '✅' : `${r.items}/${r.total}`}</b></div>`)}`}
    <//>`;
}

/* ─────────── CAJA FUERTE ─────────── */
function CajaP({ s }) {
  const g = s.caja;
  return html`
    <${Sec} title="🔐 Caja Fuerte (código de 4 piezas + código interior)" right=${html`<span class="chip">${g.openCount}/${s.tables.length} abiertas</span>`}>
      <div class="row gap wrap">
        <${Btn} c=${g.free ? 'lime' : 'ghost'} onClick=${() => cmd('CAJA_FREE_HINTS')}>💡 Pistas gratis ${g.free ? 'ON' : 'OFF'}<//>
        <${Btn} c="pink" onClick=${() => ask('¿Forzar la apertura de las cajas pendientes con puntos mínimos?', () => cmd('FORCE_SUCCESS'))}>⏰ Forzar pendientes<//>
        ${g.force && html`<span class="chip pink">Ya pasaron 20 min: puedes forzar</span>`}
      </div>
      <div class="emoji-adm">Emojis reales: ${g.realEmojis.map((e) => html`<span class=${cx('chip', g.emojis.some((x) => x.emoji === e) && 'ok')}>${e}</span>`)}</div>
      <div class="caja-table">
        <div class="ch"><span>Equipo</span><span>Estado</span><span>Respuestas (secreto)</span><span>Caja</span><span></span></div>
        ${s.tables.map((t) => {
          const x = g.teams[t.n] || {}, sec = (g.secrets || {})[t.n];
          return html`<div class=${cx('cr', x.opened && 'ok')} style=${{ '--c': t.color }}>
            <span><b>${t.emoji} ${t.name}</b><small class="mut">${t.members} jug.</small></span>
            <span>${x.opened ? `🔓 #${x.order} (${x.secs}s)${x.forced ? ' forzada' : ''}` : x.solved ? '🔑 resuelta' : '🧩 resolviendo'}<br /><small>✖${x.fails} · ${x.attempts} intentos · premio ${x.prize}</small></span>
            <span class="sec">${sec ? html`P1 <code>${sec.p1 ?? '?'}</code>${sec.p1pending ? ' ⚠️ manual' : ''} · P3 <code>${sec.p3}</code> · P4 <code>${sec.p4}</code>${sec.emoji ? ` · ${sec.emoji}` : ''}<br /><small class="mut">${sec.p1q}</small>` : '—'}</span>
            <span class="sec">${sec ? html`🔑 candado <code>${sec.lock}</code><br />📦 interior <code>${sec.confirm}</code>` : ''}</span>
            <span class="col2">
              <${Btn} c="lime" onClick=${() => cmd('CAJA_OPEN', { team: t.n })} disabled=${x.opened}>Abrir manual<//>
              <${Btn} onClick=${() => { const text = prompt('Pista para ' + t.name); if (text) cmd('CAJA_HINT_SEND', { team: t.n, text }); }}>💡 Pista<//>
              ${sec && sec.p1pending && html`<${Btn} c="amber" onClick=${() => { const q = prompt('Pregunta manual (pieza 1)'); const a = q && prompt('Respuesta (un dígito)'); if (q && a != null) cmd('CAJA_P1', { team: t.n, q, a }); }}>P1 manual<//>`}
            </span></div>`;
        })}
      </div>
    <//>`;
}

/* ─────────── BOMBA ─────────── */
const BSTATUS = { intro: 'roles (15 s)', ready: 'listos', play: 'JUGANDO', mark: 'marcando', vote: 'votación', reveal: 'revelando', revealed: 'resultado', finished: 'terminó' };
function BombaP({ s }) {
  const b = s.bomba, c = b.current;
  useTick(500);
  const now = link.serverNow();
  const st = c && c.status;
  return html`
    <${Sec} title="💣 La Bomba · un equipo al frente" right=${html`<${Btn} c="ghost" onClick=${() => cmd('BOMBA_QUEUE_RESET')} title="Reordenar según apertura de caja">↺ Cola por apertura<//>`}>
      <div class="bq-adm">${b.queue.map((t, i) => html`<div class=${cx('bqa', t.current && 'on', t.done != null && 'done')} style=${{ '--c': t.color }}>
        <span class="bq-n">${i + 1}</span><span>${t.emoji} ${t.name} <small class="mut">(${t.size})</small></span><b>${t.done != null ? `${t.done} pts` : t.current ? '🎤 en escena' : ''}</b>
        <span class="row gap-s"><${Btn} c="ghost" onClick=${() => cmd('BOMBA_QUEUE_MOVE', { team: t.n, dir: -1 })}>▲<//><${Btn} c="ghost" onClick=${() => cmd('BOMBA_QUEUE_MOVE', { team: t.n, dir: 1 })}>▼<//>
        <${Btn} c="cyan" onClick=${() => ask(`¿Llamar al equipo ${t.name}?`, () => cmd('BOMBA_CALL', { team: t.n }))} disabled=${t.done != null}>📣 Llamar<//></span></div>`)}</div>
      ${!c && html`<p class="mut">Nadie en escena. Pulsa “Llamar” en el siguiente equipo (sus celulares vibran y ven los roles 15 s antes).</p>`}
      ${c && html`
        <div class="bcur" style=${{ '--c': c.color }}>
          <div class="row between"><b>${c.emoji} ${c.teamName} · ${c.icon} ${c.gameName} (${c.gameIdx + 1}/${c.games})</b><span class="chip pink">${BSTATUS[st]}</span></div>
          ${(st === 'play') && html`<div class="big-clock">${fmt(c.endsAt - now)}</div>`}
          <div class="roles-adm">🙈 <b>${c.roles.blind.name}</b> · 🙉 ${c.roles.deaf.map((p) => p.name).join(', ')} · 🙊 ${c.roles.mute.map((p) => p.name).join(', ')}</div>
          ${b.secret && html`<div class="secret-adm">🤫 ${c.key === 'charada' ? html`Animal: <b>${b.secret.animal}</b>` : c.key === 'objeto' ? html`Objeto ${c.game.idx + 1}: <b>${b.secret.cur && b.secret.cur.name}</b> · opciones ${b.secret.cur && b.secret.cur.options.join(' / ')} · correcta: posición <b>${b.secret.cur && b.secret.cur.pos}</b>` : c.key === 'paparazzi' ? html`Objetivo: <b>${b.secret.target}</b> · disparos ${b.secret.shots}` : html`Canción: <b>${b.secret.song}</b> · emojis: ${b.secret.seq || '—'}`}</div>`}
          <div class="row gap wrap">
            <${Btn} c="lime" onClick=${() => cmd('BOMBA_START')} disabled=${!(st === 'intro' || st === 'ready')}>▶ Iniciar juego<//>
            <${Btn} onClick=${() => cmd('BOMBA_ROLES')} disabled=${!(st === 'intro' || st === 'ready')}>🔀 Reasignar roles<//>
            <${Btn} onClick=${() => cmd('BOMBA_ADD_TIME', { seconds: 15 })} disabled=${st !== 'play'}>+15 s<//>
            <${Btn} c="amber" onClick=${() => cmd('BOMBA_END')} disabled=${st !== 'play'}>⏹ Terminar ya<//>
            <${Btn} onClick=${() => cmd('BOMBA_SKIP_VOTE')} disabled=${st !== 'vote'}>⏭ Cerrar votación<//>
            <${Btn} c="cyan" onClick=${() => cmd('BOMBA_NEXT')} disabled=${st !== 'revealed'}>${c.gameIdx >= c.games - 1 ? '🏁 Terminar equipo' : '➡ Siguiente juego'}<//>
            <${Btn} c="red" onClick=${() => ask('¿Descartar la ronda (y su clip) y repetirla?', () => cmd('BOMBA_REPEAT'))} disabled=${['revealed', 'finished'].includes(st)}>↺ Descartar y repetir<//>
          </div>
          ${c.key === 'objeto' && st === 'play' && html`<div class="row gap wrap"><b>Vaso donde lo metió el ciego:</b>${[1, 2, 3, 4].map((n) => html`<${Btn} c=${c.game.step === 'cup' ? 'pink' : 'ghost'} onClick=${() => cmd('BOMBA_CUP', { cup: n })} disabled=${c.game.step !== 'cup'}>🥤 ${n}${n === 4 ? ' (ext.)' : ''}<//>`)}</div>`}
          ${c.key === 'karaoke' && (st === 'play' || st === 'mark') && html`<div class="row gap wrap"><b>¿Acertó la canción?</b><${Btn} c="lime" onClick=${() => cmd('BOMBA_MARK', { ok: true })}>✔ Acertó<//><${Btn} c="red" onClick=${() => cmd('BOMBA_MARK', { ok: false })}>✖ Falló<//><span class="chip">🚩 ${c.game.faults} · 😈 ${c.game.saboteurs.length}</span></div>`}
          ${(st === 'vote') && html`<div class="chip">🗳️ público ${c.publicVotes} · ⚖️ jurado ${c.juryVotes}/${c.jurors}</div>`}
          ${c.results.length > 0 && html`<div class="finish-list">${c.results.map((r) => html`<div><span>${r.name}</span><b>${r.total}</b></div>`)}</div>`}
        </div>`}
      <h4>🎥 Cámara y clips <span class=${cx('chip', b.camera.ready && 'ok')}>${b.camera.ready ? 'cámara conectada' : 'sin cámara (/camara)'}</span>${b.camera.recording ? html` <span class="chip pink">● grabando</span>` : ''}</h4>
      <div class="clips">${b.clips.length === 0 ? html`<p class="mut sm">Aún no hay clips.</p>` : b.clips.map((k) => html`<div class="clip"><span>${tableOf(s, k.team).emoji} ${k.blind} · «${k.song}»</span><span class=${cx('chip', k.status === 'ready' && 'ok')}>${k.status}${k.ok === true ? ' · acertó' : ''}</span>${k.file && html`<a class="btn sm ghost" href=${k.file} target="_blank">▶</a>`}${k.status !== 'discarded' && html`<${Btn} c="ghost" onClick=${() => cmd('BOMBA_DISCARD_CLIP', { id: k.id })}>🗑<//>`}</div>`)}</div>
    <//>`;
}

/* ─────────── CIERRE ─────────── */
const CierreP = ({ s, g }) => html`
  <${Sec} title="🎬 Película de la noche" right=${html`<span class="chip">${g.total} escenas · ${g.clips} clips</span>`}>
    <div class="row gap wrap"><${Btn} onClick=${() => cmd('MOVIE_BUILD')}>🧩 Armar lista<//><${Btn} c="pink" onClick=${() => cmd('MOVIE_PLAY')}>▶ Proyectar<//><${Btn} onClick=${() => cmd('MOVIE_PREV')}>⏮<//><${Btn} onClick=${() => cmd('MOVIE_NEXT')}>⏭<//><${Btn} c="ghost" onClick=${() => cmd('MOVIE_STOP')}>⏸<//></div>
    <ol class="movie-list">${g.items.map((i, k) => html`<li class=${cx(k === g.idx && g.playing && 'on')}><b>${i.type}</b> ${i.text}</li>`)}</ol>
    <p class="mut sm">Los clips fallidos o descartados se saltan. Al final aparece la tarjeta de “Cumpleaños feliz”.</p>
  <//>`;

function CrimenP({ s, g }) {
  const nm = (l, id) => (l.find((x) => x.id === id) || {}).name;
  return html`
    <${Sec} title="🕵️ ¿Quién mató a Gianella?">
      <div class="row gap wrap">
        <${Btn} c="cyan" onClick=${() => cmd('CRIMEN_NOTE')} disabled=${g.notes.length >= g.notesTotal}>🎙️ Liberar audio (${g.notes.length}/${g.notesTotal})<//>
        <${Btn} onClick=${() => cmd('CRIMEN_NOTE_ALL')}>Todos los audios<//>
        <${Btn} c="amber" onClick=${() => cmd('CRIMEN_OPEN')} disabled=${g.voting.open}>🗳️ Abrir votación<//>
        <${Btn} onClick=${() => cmd('CRIMEN_CLOSE')} disabled=${!g.voting.open}>Cerrar votación<//>
        <${Btn} c="pink" onClick=${() => ask('¿Revelar al culpable y repartir puntos?', () => cmd('CRIMEN_REVEAL'))} disabled=${g.revealed}>🔎 REVELAR<//>
      </div>
      <p class="mut sm">Respuesta correcta: <b>${nm(g.suspects, g.truth.s)}</b> · ${nm(g.weapons, g.truth.w)} · ${nm(g.motives, g.truth.m)}</p>
      <div class="tgrid">${s.tables.map((t) => { const v = g.verdicts[t.n] || {}; return html`<div class=${cx('tcell', v.done && 'ok')} style=${{ '--c': t.color }}><b>${t.emoji} Mesa ${t.n}</b><span>${v.done ? '⚖️ Veredicto entregado' : `${v.votes || 0}/${v.need} votos`}</span>${g.revealed && html`<span>${v.correct ? '✅ acertó' : '❌ falló'}</span>`}</div>`; })}</div>
    <//>`;
}

const KeikoP = ({ s, g }) => html`
  <${Sec} title="⚡ Descarga a la Madre de Keiko" right=${html`<span class="chip">${g.status.toUpperCase()}</span>`}>
    <div class="bar big"><i style=${{ width: g.pct + '%' }}></i><span>${g.pct}% (${g.energy}/${g.target})</span></div>
    <div class="row gap wrap"><${Btn} c="amber" onClick=${() => cmd('KEIKO_START')} disabled=${g.status === 'live'}>⚡ ${g.status === 'idle' ? 'INICIAR DESCARGA' : 'Reintentar'}<//><${Btn} onClick=${() => cmd('KEIKO_RESET')}>Reiniciar<//></div>
    <p class="mut sm">Objetivo = invitados en línea × ${s.example ? '200' : 'perPlayerTarget'}. Intentos: ${g.attempts}</p>
    ${g.top.map((p) => html`<div class="rank-row"><span>${p.name}</span><b>${p.energy}</b></div>`)}
  <//>`;

const KahootP = ({ s, g }) => html`
  <${Sec} title="🧠 Kahoot" right=${html`<span class="chip">${g.status} · ${Math.max(0, g.q + 1)}/${g.total}</span>`}>
    <div class="row gap wrap">
      <${Btn} c="cyan" onClick=${() => cmd('KAHOOT_NEXT')} disabled=${g.status === 'final'}>${g.status === 'question' ? '👁 Revelar respuesta' : g.status === 'idle' ? '▶ Primera pregunta' : '⏭ Siguiente pregunta'}<//>
      <${Btn} c=${g.auto ? 'lime' : 'ghost'} onClick=${() => cmd('KAHOOT_AUTO')}>${g.auto ? '🔁 Auto-avance ON' : 'Auto-avance OFF'}<//>
      <${Btn} c="red" onClick=${() => ask('¿Reiniciar puntajes de Kahoot?', () => cmd('KAHOOT_RESET'))}>Reiniciar<//>
    </div>
    ${g.question && html`<div class="qbox"><b>${g.question.q}</b>${g.question.options.map((o, i) => html`<div class=${cx(g.correctIdx === i && 'right')}>${['▲', '◆', '●', '■'][i]} ${o}${g.correctIdx === i ? ' ✔' : ''}</div>`)}<small>✋ Respondieron ${g.answered}/${g.online}</small></div>`}
    ${g.top.map((p, i) => html`<div class="rank-row"><span>${i + 1}. ${p.name}</span><b>${money(p.score)}</b></div>`)}
  <//>`;

function AuraP({ s, g }) {
  const [a, setA] = useState('Representante A');
  const [b, setB] = useState('Representante B');
  const settled = g.status === 'settled';
  return html`
    <${Sec} title="🎰 Farmeo de Aura" right=${html`<span class="chip">${g.kind || '—'} · ${g.status}</span>`}>
      <div class="aura-ctl">
        <div><b>R1 · Trivia</b><div class="row gap-s wrap"><${Btn} c="cyan" onClick=${() => cmd('AURA_TRIVIA_NEW')}>Nueva trivia (apuestas)<//><${Btn} c="amber" onClick=${() => cmd('AURA_SHOW_QUESTION')} disabled=${!(g.kind === 'trivia' && g.status === 'betting')}>Mostrar pregunta<//><${Btn} onClick=${() => cmd('AURA_LOCK')}>Cerrar / liquidar<//></div><small class="mut">Siguiente: ${g.nextQ}</small></div>
        <div><b>R2 · Duelo</b><div class="row gap-s wrap"><input class="input sm" value=${a} onInput=${(e) => setA(e.target.value)} /><input class="input sm" value=${b} onInput=${(e) => setB(e.target.value)} /><${Btn} c="cyan" onClick=${() => cmd('AURA_DUEL_NEW', { a, b })}>Nuevo duelo<//></div>
          <div class="row gap-s wrap"><${Btn} onClick=${() => cmd('AURA_LOCK')}>Cerrar apuestas<//><${Btn} c="lime" onClick=${() => cmd('AURA_DUEL_WINNER', { winner: 'A' })} disabled=${g.kind !== 'duel' || settled}>Gana A<//><${Btn} c="lime" onClick=${() => cmd('AURA_DUEL_WINNER', { winner: 'B' })} disabled=${g.kind !== 'duel' || settled}>Gana B<//></div></div>
        <div><b>R3 · Ruleta</b><div class="row gap-s wrap"><${Btn} c="cyan" onClick=${() => cmd('AURA_ROULETTE_NEW')}>Nueva ruleta<//><${Btn} onClick=${() => cmd('AURA_LOCK')}>Cerrar apuestas<//><${Btn} c="pink" onClick=${() => cmd('AURA_SPIN')} disabled=${g.kind !== 'roulette' || g.status === 'spinning' || settled}>🎡 GIRAR<//></div></div>
      </div>
      ${g.curQ && g.kind === 'trivia' && html`<small class="mut">Pregunta actual: ${g.curQ.q} → <b>${g.curQ.options[g.curQ.correct]}</b></small>`}
      <div class="tgrid">${s.tables.map((t) => { const bet = g.bets[t.n]; const r = settled && g.result.rows.find((x) => x.table === t.n); return html`<div class=${cx('tcell', bet && 'ok')} style=${{ '--c': t.color }}><b>${t.emoji} Mesa ${t.n}</b><span>✨ ${money(t.aura)}</span><span>${bet ? `Apuesta ${money(bet.amount)}${bet.pick ? ' · ' + bet.pick : ''}` : 'sin apuesta'}</span>${r && html`<b class=${r.win ? 'lime' : 'red'}>${r.delta > 0 ? '+' : ''}${r.delta}</b>`}</div>`; })}</div>
      <${Btn} c="ghost" onClick=${() => cmd('AURA_CLEAR')}>Limpiar ronda<//>
    <//>`;
}

const EstatuaP = ({ s, g }) => html`
  <${Sec} title="🗿 La Estatua Colectiva" right=${html`<span class="chip">${g.status} · ${g.successes}/${g.rounds}</span>`}>
    <div class="row gap wrap"><${Btn} c="cyan" onClick=${() => cmd('ESTATUA_START')} disabled=${g.status === 'still' || g.status === 'ready' || g.status === 'done'}>▶ Iniciar ronda ${Math.min(g.successes + 1, g.rounds)}<//><${Btn} onClick=${() => cmd('ESTATUA_STOP')}>Detener<//><${Btn} c="red" onClick=${() => cmd('ESTATUA_RESET')}>Reiniciar<//></div>
    <div class="bar big"><i style=${{ width: Math.min(100, (g.holdMs / g.holdTarget) * 100) + '%' }}></i><span>${(g.holdMs / 1000).toFixed(1)}s / ${g.holdTarget / 1000}s</span></div>
    <p>Teléfonos: <b>${g.participants}</b> · En movimiento: <b class=${g.movingPct > g.tolerancePct ? 'red' : 'lime'}>${g.movingPct}%</b> (máx ${g.tolerancePct}%)</p>
    <p class="mut sm">Los sonidos distractores salen solos; también puedes lanzar los pads del DJ.</p>
  <//>`;

const PixelP = ({ s, g }) => html`
  <${Sec} title="🟦 Pixel Art Secreto" right=${html`<span class="chip">${g.painted}/${g.total}</span>`}>
    <div class="row gap wrap"><${Btn} c="cyan" onClick=${() => cmd('PIXEL_NEXT_TURN')}>⏭ Siguiente turno<//><${Btn} c=${g.useTurns ? 'lime' : 'ghost'} onClick=${() => cmd('PIXEL_TURNS')}>${g.useTurns ? 'Turnos ON' : 'Turnos OFF (todos pintan)'}<//><${Btn} onClick=${() => ask('¿Reasignar y borrar el mural?', () => cmd('PIXEL_RESET'))}>♻ Reasignar<//><${Btn} c="pink" onClick=${() => ask('¿Pintar todo? (solo pruebas)', () => cmd('PIXEL_PAINT_ALL'))}>Pintar todo<//></div>
    <p>Turno: ${g.turnTable ? 'Mesa ' + g.turnTable : '—'}</p>
    <div class="tgrid">${s.tables.map((t) => { const x = (g.byTable || {})[t.n] || { done: 0, total: 0 }; return html`<div class="tcell" style=${{ '--c': t.color }}><b>${t.emoji} Mesa ${t.n}</b><span>${x.done}/${x.total}</span></div>`; })}</div>
  <//>`;

const FotoP = ({ s, g }) => html`
  <${Sec} title="📸 La Foto Loca Exprés" right=${html`<span class="chip">${g.status}</span>`}>
    <div class="row gap wrap"><${Btn} c="cyan" onClick=${() => cmd('FOTO_START')} disabled=${g.status !== 'idle' && g.status !== 'done'}>🤫 Asignar misiones y empezar<//><${Btn} onClick=${() => cmd('FOTO_SKIP')}>⏩ Saltar espera<//><${Btn} c="red" onClick=${() => cmd('FOTO_RESET')}>Reiniciar<//></div>
    <p class="mut sm">Misiones asignadas: ${g.assigned}. Flujo: 60 s de lectura → cuenta 10 s → FOTO 1 → pose grupal → FOTO 2 → meta 4/4.</p>
  <//>`;

const CeremoniaP = ({ s, g }) => html`
  <${Sec} title="🏆 Ceremonia" right=${html`<span class="chip">paso ${g.step}/${g.max}</span>`}>
    <div class="row gap wrap"><${Btn} onClick=${() => cmd('CEREMONY_STEP', { delta: -1 })}>« Atrás<//><${Btn} c="pink" onClick=${() => cmd('CEREMONY_STEP', { delta: 1 })} disabled=${g.step >= g.max}>Revelar siguiente »<//></div>
    <ol class="rules sm"><li>Trofeo individual (Kahoot)</li><li>3.er lugar</li><li>2.º lugar</li><li>🥇 CAMPEÓN</li></ol>
  <//>`;

function DiscoP({ s }) {
  const taps = useRef([]);
  const [bpm, setBpm] = useState(s.disco.bpm);
  const tap = () => {
    const now = Date.now(); const t = taps.current; if (t.length && now - t[t.length - 1] > 2000) t.length = 0; t.push(now);
    if (t.length >= 3) { const avg = (t[t.length - 1] - t[0]) / (t.length - 1); setBpm(Math.round(Math.min(200, Math.max(60, 60000 / avg)))); }
    if (t.length > 8) t.shift();
  };
  return html`
    <${Sec} title="🪩 Modo Disco · Hora Loca">
      <div class="row gap wrap"><${Btn} c=${s.disco.on ? 'red' : 'pink'} onClick=${() => cmd('DISCO', { on: !s.disco.on, bpm })}>${s.disco.on ? '⏹ Apagar disco' : '🪩 ENCENDER DISCO'}<//><${Btn} onClick=${tap}>👆 Tap tempo<//><${Btn} onClick=${() => cmd('VIBRATE', { pattern: [300, 100, 300, 100, 600] })}>📳 Vibrar a todos<//></div>
      <label class="row gap">BPM <input type="range" min="60" max="200" value=${bpm} onInput=${(e) => setBpm(Number(e.target.value))} onChange=${() => s.disco.on && cmd('DISCO', { on: true, bpm })} /> <b>${bpm}</b></label>
      <p class="mut sm">Los celulares de los invitados parpadean al ritmo, sincronizados por el reloj del servidor.</p>
    <//>`;
}

/* ─────────── Columna derecha: DJ, puntos, feed ─────────── */
function Pads() {
  const [local, setLocal] = useState(localSound);
  const toggle = () => { if (!local) { sfx.unlock(); sfx.play('pop'); } localSound = !local; setLocal(!local); };
  return html`
    <${Sec} title="🎧 CONSOLA DE AUDIO DJ (8 PADS)" right=${html`<${Btn} c=${local ? 'lime' : 'ghost'} onClick=${toggle} title="Reproducir también en este dispositivo">${local ? '🔊 Aquí ON' : '🔇 Aquí OFF'}<//>`}>
      <div class="pads">${sfx.PADS.map((p, i) => html`<button class="pad" onClick=${() => cmd('PLAY_SOUND', { id: p.id })}><span>${p.icon}</span><b>${i + 1}. ${p.label}</b></button>`)}</div>
      <small class="mut">El sonido sale por la <b>Pantalla Central</b> (conectada al equipo de audio).</small>
    <//>`;
}

function Mesas({ s }) {
  const rank = [...s.tables].sort((a, b) => b.aura - a.aura).map((t) => t.n);
  return html`
    <${Sec} title="EQUIPOS · PUNTOS EN VIVO">
      ${s.tables.map((t) => {
        const off = t.members - t.online;
        return html`<div class="mesa-row" style=${{ '--c': t.color }}>
          <div class="mr-n"><b>${t.emoji} ${t.name}</b><small>${t.members} jug.${t.mult > 1 ? ` · ×${t.mult}` : ''}</small></div>
          <div class=${cx('mr-c', off > 0 && 'warn')}>${t.online}/${t.members} ${off > 0 ? `⚠️ ${off} desconect.` : 'conectados'}</div>
          <div class="mr-a"><b>✨ ${money(t.aura)}</b><small>#${rank.indexOf(t.n) + 1}</small></div>
          <div class="mr-b"><${Btn} onClick=${() => cmd('ADJUST_AURA', { table: t.n, delta: 10, reason: 'ajuste rápido' })}>+10<//><${Btn} onClick=${() => cmd('ADJUST_AURA', { table: t.n, delta: -10, reason: 'ajuste rápido' })}>−10<//></div>
        </div>`;
      })}
      <div class="stars-ctl">Metas: ${[['keiko', '⚡'], ['estatua', '🗿'], ['pixel', '🟦'], ['foto', '📸']].map(([k, i]) => html`<button class=${cx('chip', s.stars[k] && 'ok')} onClick=${() => cmd('SET_STAR', { key: k, on: !s.stars[k] })}>${i} ${s.stars[k] ? '★' : '☆'}</button>`)}</div>
    <//>`;
}

function Feed({ s }) {
  return html`<${Sec} title="📡 ACTIVIDAD" cls="feed"><div class="feed-list">${s.feed.map((f) => html`<div class=${cx('fi', f.kind)}><time>${new Date(f.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>${f.text}</div>`)}</div><//>`;
}

/* ─────────── Pestañas ─────────── */
const STAGE = { test: '📝 test', pool: '🔎 esperando', paired: '💞 pareja', team: '🛡️ equipo' };
function Guests({ s }) {
  const [q, setQ] = useState('');
  const [tf, setTf] = useState(0);
  const list = s.guests.filter((g) => (!tf || g.table === tf) && (!q || (g.name + ' ' + g.alias).toLowerCase().includes(q.toLowerCase())));
  return html`
    <${Sec} title="JUGADORES · AUDITORÍA EN VIVO" right=${html`<span class="chip">${list.length}/${s.guests.length}</span>`}>
      <div class="row gap wrap"><input class="input sm grow" placeholder="Buscar…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <select class="input sm" value=${tf} onChange=${(e) => setTf(Number(e.target.value))}><option value="0">Todos los equipos</option>${s.tables.map((t) => html`<option value=${t.n}>${t.name}</option>`)}</select></div>
      <div class="gtable">
        <div class="gh"><span>Jugador</span><span>Etapa</span><span>Equipo</span><span>Ping</span><span>Bat.</span><span>Sensor</span><span>Ausente</span><span></span></div>
        ${list.map((g) => html`<div class=${cx('gr', !g.online && 'off', g.absent && 'abs')}>
          <span><i class=${cx('dot', g.online ? 'ok' : 'bad')}></i> ${g.animal ? g.animal.emoji : ''} <b>${g.name}</b>${g.alias ? ` “${g.alias}”` : ''}${g.late ? ' 🧳' : ''}</span>
          <span class="sm">${STAGE[g.stage] || g.stage}</span>
          <span><select class="input xs" value=${g.table || 0} onChange=${(e) => cmd('GUEST_MOD', { id: g.id, op: 'move', table: Number(e.target.value) })}><option value="0" disabled>—</option>${s.tables.map((t) => html`<option value=${t.n}>E${t.n}</option>`)}</select></span>
          <span>${g.online && g.rtt ? Math.round(g.rtt) + 'ms' : '—'}</span><span>${g.battery != null ? g.battery + '%' + (g.charging ? '⚡' : '') : '—'}</span>
          <span class=${cx(g.sensor === 'ok' ? 'lime' : 'mut')}>${g.sensor || '—'}</span>
          <span><input type="checkbox" checked=${g.absent} onChange=${() => cmd('GUEST_MOD', { id: g.id, op: 'absent' })} title="Marcar ausente (no recibe rol en la Bomba)" /></span>
          <span><${Btn} c="ghost" onClick=${() => ask(`¿Eliminar a ${g.name}?`, () => cmd('GUEST_MOD', { id: g.id, op: 'remove' }))}>✕<//></span></div>`)}
      </div>
    <//>`;
}

function Teams({ s }) {
  return html`
    <div class="teams-grid">${s.tables.map((t) => {
      const members = s.guests.filter((g) => g.table === t.n);
      return html`<${Sec} title=${`${t.emoji} ${t.name}`} cls="team-sec" right=${html`<span class="chip">${t.members} · ✨${money(t.aura)}${t.mult > 1 ? ` · ×${t.mult}` : ''}</span>`}>
        <div class="row gap-s"><${Btn} c="ghost" onClick=${() => { const n = prompt('Nuevo nombre del equipo', t.name); if (n) cmd('TEAM_RENAME', { table: t.n, name: n }); }}>✏️ Renombrar<//>${t.selfie && html`<${Btn} c="ghost" onClick=${() => ask('¿Borrar la selfie?', () => cmd('ENTRADA_SELFIE_DELETE', { team: t.n }))}>🗑 Selfie<//>`}</div>
        ${t.selfie && html`<img class="selfie sm-img" src=${t.selfie} alt="" />`}
        <div class="roster">${members.map((m) => html`<div class=${cx('mem', m.absent && 'abs')}><span>${m.animal ? m.animal.emoji : '🙂'}</span><div><b>${m.alias || m.name}</b><small>${m.online ? '🟢' : '⚪'} ${m.stage}${m.late ? ' · tardío' : ''}</small></div></div>`)}</div>
      <//>`;
    })}</div>`;
}

const SRC = { entrada: '🚪', caja: '🔐', bomba: '💣', crimen: '🕵️', farmeo: '🎰', admin: '🎛️', deshacer: '↩️', manual: '✋' };
function Points({ s }) {
  const [team, setTeam] = useState(1);
  const [delta, setDelta] = useState(10);
  const [why, setWhy] = useState('');
  return html`
    <${Sec} title="💰 PUNTOS · LEDGER (solo se añade; “deshacer” crea un asiento contrario)">
      <div class="row gap wrap"><select class="input sm" value=${team} onChange=${(e) => setTeam(Number(e.target.value))}>${s.tables.map((t) => html`<option value=${t.n}>${t.emoji} ${t.name}</option>`)}</select>
        <input class="input sm" type="number" style="width:90px" value=${delta} onInput=${(e) => setDelta(Number(e.target.value))} />
        <input class="input sm grow" placeholder="Motivo (obligatorio)" value=${why} onInput=${(e) => setWhy(e.target.value)} />
        <${Btn} c="lime" disabled=${!why.trim() || !delta} onClick=${() => { cmd('ADJUST_AURA', { table: team, delta, reason: why }); setWhy(''); }}>Aplicar<//></div>
      <div class="ledger">
        <div class="lh"><span>Hora</span><span>Equipo</span><span>Fuente</span><span>Δ</span><span>Saldo</span><span>Motivo</span><span></span></div>
        ${s.ledger.map((l) => html`<div class=${cx('lr', l.undone && 'undone', l.source === 'deshacer' && 'rev')}>
          <time>${new Date(l.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
          <span>${tableOf(s, l.team).emoji} E${l.team}</span><span>${SRC[l.source] || ''} ${l.source}</span>
          <b class=${l.delta >= 0 ? 'lime' : 'red'}>${l.delta > 0 ? '+' : ''}${l.delta}</b><span>${l.balance}</span><span class="sm">${l.reason}</span>
          <span>${!l.undone && l.source !== 'deshacer' && html`<${Btn} c="ghost" onClick=${() => ask('¿Deshacer este asiento?', () => cmd('LEDGER_UNDO', { id: l.id }))}>↩<//>`}</span></div>`)}
      </div>
    <//>`;
}

const SECTIONS_NOTE = 'Edita el JSON y guarda. Kahoot: preguntas · caja: emojis, PINs y códigos · bomba: tiempos · crimen: culpable y pistas · aura: trivias · foto: misiones · pixel: dibujo · tables: nombres base · meta: nombre del evento · entrada: umbrales y puntos.';
function Content() {
  const [cfg, setCfg] = useState(null);
  const [files, setFiles] = useState([]);
  const [key, setKey] = useState('config:kahoot');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const H = { 'x-admin-token': atoken };
  const load = async (k = key) => {
    const r = await fetch('/api/config', { headers: H });
    if (!r.ok) return setMsg({ bad: 'No autorizado' });
    const c = await r.json(); setCfg(c);
    const f = (await (await fetch('/api/content', { headers: H })).json()).files; setFiles(f);
    if (k.startsWith('config:')) setText(JSON.stringify(c[k.slice(7)], null, 2));
    else setText(JSON.stringify(await (await fetch('/api/content/' + k.slice(8), { headers: H })).json(), null, 2));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (cfg) load(key); }, [key]);
  const save = async () => {
    try {
      const val = JSON.parse(text);
      let r;
      if (key.startsWith('config:')) r = await fetch('/api/config', { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ ...cfg, [key.slice(7)]: val }) });
      else r = await fetch('/api/content/' + key.slice(8), { method: 'PUT', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(val) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (key.startsWith('config:')) setCfg({ ...cfg, [key.slice(7)]: val });
      setMsg({ ok: '✅ Guardado. Se aplica de inmediato (algunos juegos al reiniciar su fase).' });
    } catch (e) { setMsg({ bad: '❌ ' + e.message }); }
  };
  const keys = cfg ? Object.keys(cfg) : [];
  return html`
    <${Sec} title="📝 CONTENIDO DEL EVENTO">
      <p class="mut sm">${SECTIONS_NOTE}</p>
      <div class="row gap wrap"><select class="input sm" value=${key} onChange=${(e) => setKey(e.target.value)}>
          <optgroup label="Configuración">${keys.map((k) => html`<option value=${'config:' + k}>${k}</option>`)}</optgroup>
          <optgroup label="Contenido (test, animales, charadas, objetos, canciones, acertijos, nombres)">${files.map((f) => html`<option value=${'content:' + f}>${f}</option>`)}</optgroup></select>
        <${Btn} c="lime" onClick=${save}>💾 Guardar<//><${Btn} c="ghost" onClick=${() => load()}>↺ Recargar<//></div>
      ${msg && html`<div class=${msg.ok ? 'ok-card' : 'bad-card'}>${msg.ok || msg.bad}</div>`}
      <textarea class="json" spellcheck="false" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
    <//>`;
}

function Tools({ s }) {
  const [txt, setTxt] = useState('');
  const [base, setBase] = useState('');
  useEffect(() => { joinBase().then(setBase); }, []);
  return html`
    <${Sec} title="📣 ANUNCIO A TODOS">
      <div class="row gap wrap"><input class="input sm grow" placeholder="Ej.: Equipo 3 al escenario" maxlength="140" value=${txt} onInput=${(e) => setTxt(e.target.value)} /><${Btn} c="cyan" onClick=${() => { cmd('ANNOUNCE', { text: txt, seconds: 10 }); setTxt(''); }}>Enviar<//><${Btn} c="ghost" onClick=${() => cmd('ANNOUNCE', { text: '' })}>Quitar<//></div>
    <//>
    <${Sec} title="🔗 VISTAS Y ENLACES">
      <ul class="links">
        <li>🧑 Jugador (QR de la puerta): <code>${base}/</code> · <a href="/qr" target="_blank">🧾 imprimir QR</a></li>
        <li>📺 Pantalla grande: <a href="/pantalla" target="_blank"><code>${base}/pantalla</code></a> (pulsa “Activar sonido”)</li>
        <li>⚖️ Jurado (3 jurados, con PIN): <a href="/jurado" target="_blank"><code>${base}/jurado</code></a></li>
        <li>🎥 Cámara en el trípode: <a href="/camara" target="_blank"><code>${base}/camara</code></a></li>
        <li><a class="btn sm ghost" href=${'/api/export?t=' + atoken}>⬇ Invitados (CSV)</a> <a class="btn sm ghost" href=${'/api/export?what=json&t=' + atoken}>⬇ Respaldo completo (JSON)</a> <${Btn} c="ghost" onClick=${() => cmd('BACKUP')}>💾 Copia de la base de datos<//></li>
      </ul>
    <//>
    <${Sec} title="🗑️ LIMPIEZA AL TERMINAR">
      <div class="row gap wrap"><${Btn} c="ghost" onClick=${() => ask('¿Borrar TODAS las selfies?', () => cmd('DELETE_MEDIA', { kind: 'selfies' }))}>Borrar selfies<//><${Btn} c="ghost" onClick=${() => ask('¿Borrar fotos de Paparazzi?', () => cmd('DELETE_MEDIA', { kind: 'photos' }))}>Borrar fotos<//><${Btn} c="ghost" onClick=${() => ask('¿Borrar los clips?', () => cmd('DELETE_MEDIA', { kind: 'clips' }))}>Borrar clips<//></div>
    <//>
    <${Sec} title="☢️ ZONA PELIGROSA">
      <p class="mut sm">Borra invitados, puntos y progreso y reinicia todo el evento (el ledger anterior se conserva en la base como auditoría).</p>
      <${Btn} c="red" onClick=${() => { const t = prompt('Escribe BORRAR para reiniciar TODO el evento'); if (t === 'BORRAR') cmd('RESET_ALL', { confirm: 'BORRAR' }); }}>Reiniciar evento completo<//>
    <//>`;
}

function App({ s, status }) {
  const [tab, setTab] = useState('control');
  if (!s || s.locked) return html`<${Login} />`;
  const tabs = [['control', '🎮 Control'], ['guests', '👥 Jugadores'], ['teams', '🛡️ Equipos'], ['points', '💰 Puntos'], ['content', '📝 Contenido'], ['tools', '🧰 Herramientas']];
  return html`
    <div class="adm">
      <${Header} s=${s} />
      <nav class="tabs adm-tabs">${tabs.map(([k, l]) => html`<button class=${cx('tab', tab === k && 'on')} onClick=${() => setTab(k)}>${l}</button>`)}</nav>
      ${tab === 'control' && html`
        <div class="adm-grid">
          <div class="col"><${PhaseControl} s=${s} /><${GamePanel} s=${s} /><${Mesas} s=${s} /></div>
          <div class="col"><${Pads} /><${Feed} s=${s} /></div>
        </div>`}
      ${tab === 'guests' && html`<${Guests} s=${s} />`}
      ${tab === 'teams' && html`<${Teams} s=${s} />`}
      ${tab === 'points' && html`<${Points} s=${s} />`}
      ${tab === 'content' && html`<${Content} />`}
      ${tab === 'tools' && html`<${Tools} s=${s} />`}
    </div>`;
}
redraw();
