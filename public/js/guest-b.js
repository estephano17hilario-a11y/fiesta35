// Pantallas de invitado — parte B: Keiko, Kahoot, Aura, Estatua, Pixel, Foto, Ceremonia, Disco.
import { html, useState, useEffect, useRef, useEvent, useTick, cx, fmt, secLeft, confetti, vibrate, tableOf, money } from './lib.js';
import { Motion } from './sensors.js';
import { Waiting } from './guest-a.js';

function useMotionStatus() {
  const [st, setSt] = useState(Motion.status);
  useEffect(() => Motion.onChange(setSt), []);
  return st;
}

export function SensorChip() {
  const st = useMotionStatus();
  if (st === 'ok') return html`<div class="chip ok">📡 Sensores activos</div>`;
  return html`
    <div class="sensor-box">
      <button class="btn cyan" onClick=${() => Motion.enable()}>📡 Activar sensores de movimiento</button>
      ${st === 'denied' && html`<small class="bad">Permiso denegado. En iPhone: Ajustes › Safari › Movimiento y orientación.</small>`}
      ${st === 'none' && html`<small class="mut">${Motion.secure ? 'Tu celular no reporta sensores.' : 'Sin HTTPS el navegador bloquea los sensores.'} Jugarás en <b>modo táctil</b> (toca la pantalla).</small>`}
    </div>`;
}

/* ───────────────────────── 4. KEIKO ───────────────────────── */
export function Keiko({ s, g, link }) {
  const st = useMotionStatus();
  const last = useRef(0);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (g.status !== 'live') return;
    const id = setInterval(() => {
      if (Motion.status !== 'ok') return;
      const peak = Motion.takePeak();
      setPulse(Math.min(1, peak / 25));
      if (peak > g.threshold) {
        link.send('SHAKE_PULSE', { power: Math.min(10, Math.floor(peak / 2)) });
        vibrate(35);
      }
    }, 200);
    return () => clearInterval(id);
  }, [g.status, g.threshold]);
  useEffect(() => { if (g.status === 'success') confetti({ count: 220 }); }, [g.status]);
  useTick(200);
  const now = link.serverNow();

  const tap = () => {
    const t = performance.now();
    if (t - last.current < 130) return;
    last.current = t;
    setPulse(1); setTimeout(() => setPulse(0), 90);
    vibrate(25);
    link.send('SHAKE_PULSE', { power: 8 });
  };

  if (g.status === 'success') return html`<div class="card center-col win"><div class="wait-ico">⚡</div><h2>¡DESCARGA EXITOSA!</h2><p class="mut">${g.message}</p><div class="chip ok">⭐ Estrella colectiva 1/4</div></div>`;
  return html`
    <div class="card center-col keiko">
      <div class=${cx('paddles', g.status === 'live' && 'live')} style=${{ '--p': pulse }}><span>⚡</span><span>⚡</span></div>
      ${g.status === 'idle' && html`<h2>Prepárate para la descarga</h2><p class="mut">Cuando el anfitrión lo indique, <b>agita tu celular con TODA tu fuerza</b> durante ${g.seconds} segundos. ¡Entre los 35 reviven a la Madre de Keiko!</p>`}
      ${g.status === 'fail' && html`<h2 class="bad">Descarga insuficiente (${g.pct}%)</h2><p class="mut">Hay que sacudir MÁS fuerte. Esperen la siguiente oportunidad.</p>`}
      ${g.status === 'live' && html`
        <h2 class="pulse-text">¡¡AGITA!!</h2>
        <div class="timer-big">${secLeft(g.endsAt, now)}s</div>
        <div class="bar big"><i style=${{ width: g.pct + '%' }}></i><span>${g.pct}% colectivo</span></div>
        <div class="mut">Tu aporte: <b class="cyan">${g.mine}</b></div>`}
      ${st !== 'ok' && g.status === 'live' && html`<button class="tap-pad" onPointerDown=${tap}>¡TOCA RÁPIDO!<small>Modo táctil</small></button>`}
      <${SensorChip} />
    </div>`;
}

/* ───────────────────────── 5. KAHOOT ───────────────────────── */
const KSHAPES = [['▲', 'k-red'], ['◆', 'k-blue'], ['●', 'k-yellow'], ['■', 'k-green']];
export function Kahoot({ s, g, link }) {
  useTick(250);
  const now = link.serverNow();
  const answered = g.myAnswer != null;
  if (g.status === 'idle') return html`<${Waiting} icon="🧠" title="Kahoot: ¿Quién conoce más a ${s.meta.birthdayName}?" text="Mira la pantalla grande. Responde rápido: ¡más velocidad = más puntos!"><div class="chip">Tu puntaje: ${money(g.myTotal)}</div><//>`;
  if (g.status === 'final') {
    return html`<div class="card center-col win"><div class="wait-ico">${g.myRank === 1 ? '🏆' : '🧠'}</div><h2>Fin del Kahoot</h2><p>Quedaste en el puesto <b class="cyan">#${g.myRank}</b> con <b>${money(g.myTotal)}</b> pts</p>
      <div class="podium-mini">${g.top.slice(0, 3).map((p, i) => html`<div><b>${['🥇', '🥈', '🥉'][i]}</b> ${p.name} <span class="mut">${money(p.score)}</span></div>`)}</div></div>`;
  }
  const left = secLeft(g.endsAt, now);
  return html`
    <div class="kahoot">
      <div class="k-head"><span>Pregunta ${g.q + 1}/${g.total}</span><b>${g.status === 'question' ? left + 's' : ''}</b></div>
      ${g.status === 'question' && html`<div class="bar thin"><i style=${{ width: Math.max(0, ((g.endsAt - now) / (g.seconds * 1000)) * 100) + '%' }}></i></div>`}
      <div class="k-q">${g.question?.q}</div>
      <div class="k-grid">
        ${g.question?.options.map((o, i) => html`
          <button class=${cx('k-btn', KSHAPES[i][1], answered && g.myAnswer !== i && 'dim', g.myAnswer === i && 'chosen', g.status === 'reveal' && g.question.correct === i && 'right')}
            disabled=${answered || g.status !== 'question'} onClick=${() => { vibrate(30); link.send('SUBMIT_KAHOOT_ANSWER', { q: g.q, choice: i }); }}>
            <span class="shape">${KSHAPES[i][0]}</span><span class="opt">${o}</span>
          </button>`)}
      </div>
      ${answered && g.status === 'question' && html`<div class="card center-col sm">✅ ¡Respuesta enviada! Esperando al resto…</div>`}
      ${g.status === 'reveal' && g.result && html`
        <div class=${cx('card center-col', g.result.correct ? 'ok-card' : 'bad-card')}>
          <b>${g.result.correct ? `¡Correcto! +${g.result.score}` : answered ? '¡Casi! Sumaste 0' : '⏰ Sin respuesta'}</b>
          <small>Total ${money(g.result.total)} · Puesto #${g.result.rank}</small>
        </div>`}
    </div>`;
}

/* ───────────────────────── 6. AURA ───────────────────────── */
const BETS = [['PERCENT_20', '20%'], ['PERCENT_50', '50%'], ['ALL_IN', '¡ALL-IN!']];
export function Aura({ s, g, link }) {
  useTick(250);
  const now = link.serverNow();
  const [pick, setPick] = useState(null);
  const tb = tableOf(s, s.me.table);
  useEffect(() => { setPick(null); }, [g.round, g.kind, g.status === 'betting']);
  const amountFor = (t) => (t === 'ALL_IN' ? g.myAura : Math.max(g.myAura > 0 ? 1 : 0, Math.floor(g.myAura * (t === 'PERCENT_20' ? 0.2 : 0.5))));

  const header = html`<div class="card aura-head"><div><small class="mut">Puntos de tu equipo</small><b class="big-num">✨ ${money(g.myAura)}</b></div>${g.myBet ? html`<div class="chip pink">Apostado: ${money(g.myBet.amount)}</div>` : ''}</div>`;

  if (g.status === 'idle' || !g.kind) return html`<div class="stack">${header}<${Waiting} icon="🎰" title="Casino de Aura" text="El anfitrión abrirá la próxima ronda. Piensen cuánto arriesgar…" /></div>`;

  const betPanel = g.status === 'betting' && !g.myBet && html`
    <div class="card">
      <b>${g.kind === 'trivia' ? '¿Cuánto apuesta tu equipo? (antes de ver la pregunta)' : g.kind === 'duel' ? 'Elige a tu favorito y tu apuesta' : 'Elige color y apuesta'}</b>
      ${g.kind === 'duel' && html`<div class="duel-pick">${['A', 'B'].map((k) => html`<button class=${cx('duelist', pick === k && 'on')} onClick=${() => setPick(k)}><small>${k === 'A' ? 'Rincón A' : 'Rincón B'}</small><b>${g.duel[k.toLowerCase()]}</b><small>x${g.multiplier}</small></button>`)}</div>`}
      ${g.kind === 'roulette' && html`<div class="duel-pick">${g.roulette.map((r) => html`<button class=${cx('duelist', pick === r.id && 'on')} style=${{ '--c': r.color }} onClick=${() => setPick(r.id)}><b>${r.label}</b><small>paga x${r.mult}</small></button>`)}</div>`}
      <div class="bet-grid">
        ${BETS.map(([t, l]) => html`<button class=${cx('bet', t === 'ALL_IN' && 'allin')} disabled=${g.kind !== 'trivia' && !pick}
          onClick=${() => { vibrate(40); link.send('PLACE_AURA_BET', { type: t, pick }); }}><b>${l}</b><small>${money(amountFor(t))}</small></button>`)}
      </div>
      <small class="mut">La primera apuesta de un compañero compromete a toda el equipo.</small>
    </div>`;

  const betInfo = g.myBet && html`<div class="card center-col sm">🔒 Tu equipo apostó <b class="pink">${money(g.myBet.amount)}</b>${g.myBet.pick ? html` por <b>${g.kind === 'duel' ? g.duel[g.myBet.pick.toLowerCase()] : (g.roulette.find((r) => r.id === g.myBet.pick) || {}).label}</b>` : ''} (${g.myBet.by})</div>`;

  const quiz = (g.status === 'question' || (g.status === 'settled' && g.question)) && g.question && html`
    <div class="card">
      <div class="row between"><b>Trivia de alto riesgo</b>${g.status === 'question' && html`<b class="timer-sm">${secLeft(g.endsAt, now)}s</b>`}</div>
      <div class="k-q sm">${g.question.q}</div>
      <div class="pick-grid one">${g.question.options.map((o, i) => html`
        <button class=${cx('pick', g.myVote === i && 'on', g.question.correct === i && 'right')} disabled=${g.status !== 'question' || !g.myBet} onClick=${() => { vibrate(25); link.send('AURA_ANSWER', { choice: i }); }}>
          ${o} ${g.tableVotes[i] ? html`<span class="chip">${g.tableVotes[i]}</span>` : ''}</button>`)}</div>
      ${!g.myBet && g.status === 'question' && html`<small class="mut">Tu equipo no apostó: solo observan.</small>`}
      <small class="mut">Se toma la respuesta mayoritaria de tu equipo.</small>
    </div>`;

  const spin = (g.status === 'spinning' || g.status === 'locked') && html`<div class="card center-col">${g.status === 'spinning' ? '🎡 ¡La ruleta está girando! Mira la pantalla grande…' : '🔒 Apuestas cerradas'}</div>`;

  const res = g.status === 'settled' && g.result && (() => {
    const mine = g.result.rows.find((r) => r.table === s.me.table);
    return html`<div class=${cx('card center-col', mine ? (mine.win ? 'ok-card' : 'bad-card') : '')}>
      <b>${g.result.label}</b>
      ${mine ? html`<div class="big-num">${mine.delta > 0 ? '+' : ''}${money(mine.delta)} ✨</div><small>${mine.win ? '¡Ganaron!' : 'Perdieron lo apostado'}</small>` : html`<small class="mut">Tu equipo no participó.</small>`}
      ${g.result.winnerName && html`<small>Ganador del duelo: <b>${g.result.winnerName}</b></small>`}
      ${g.result.seg && html`<small>Salió: <b>${(g.roulette.find((r) => r.id === g.result.seg) || {}).label}</b></small>`}
    </div>`;
  })();

  return html`<div class="stack">${header}${betPanel}${betInfo}${quiz}${spin}${res}</div>`;
}

/* ───────────────────────── 7. ESTATUA ───────────────────────── */
export function Estatua({ s, g, link }) {
  const st = useMotionStatus();
  const pressed = useRef(false);
  const [moving, setMoving] = useState(false);
  useTick(250);
  const now = link.serverNow();
  const active = g.status === 'ready' || g.status === 'still';
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      let m, v;
      if (Motion.status === 'ok' && Motion.fresh) { v = Motion.takePeak(); m = v > g.threshold; }
      else { m = !pressed.current; v = m ? 4 : 0; }
      setMoving(m);
      link.send('MOTION_SENSOR_TICK', { is_moving: m, v: Math.round(v * 100) / 100 });
    }, 250);
    return () => clearInterval(id);
  }, [active, g.threshold]);
  useEffect(() => { if (g.status === 'done') confetti({ count: 200 }); }, [g.status]);
  useEffect(() => { if (g.status === 'still' && moving) vibrate(30); }, [moving]);

  if (g.status === 'done') return html`<div class="card center-col win"><div class="wait-ico">🗿</div><h2>¡ESTATUA COLECTIVA!</h2><div class="chip ok">⭐ Estrella colectiva 2/4</div></div>`;
  const noSensor = st !== 'ok';
  return html`
    <div class=${cx('card center-col statue', g.status === 'still' && 'dark', g.status === 'still' && moving && 'alert')}>
      <div class="wait-ico">🗿</div>
      <h2>Ronda ${Math.min(g.successes + 1, g.rounds)}/${g.rounds}</h2>
      ${g.status === 'idle' && html`<p class="mut">Cuando empiece: <b>celular en el bolsillo</b> y quédate completamente quieto ${Math.round(g.holdTarget / 1000)} segundos. ¡Ignora los ruidos!</p>`}
      ${g.status === 'ready' && html`<p class="big-num">Prepárate… ${secLeft(g.readyUntil, now)}</p><p class="mut">Guarda el celular y congélate.</p>`}
      ${g.status === 'still' && html`<div class="ring" style=${{ '--p': Math.min(100, (g.holdMs / g.holdTarget) * 100) }}><b>${moving ? '¡QUIETO!' : 'QUIETO'}</b><small>${Math.round(g.holdMs / 1000)}s / ${Math.round(g.holdTarget / 1000)}s</small></div>`}
      ${g.status === 'success' && html`<h2 class="lime">¡Ronda superada!</h2>`}
      ${g.status === 'fail' && html`<h2 class="bad">La estatua se movió…</h2><p class="mut">Esperen al anfitrión para reintentar.</p>`}
      ${noSensor && active && html`
        <div class=${cx('hold-pad', pressed.current && 'down')}
          onPointerDown=${() => { pressed.current = true; }} onPointerUp=${() => { pressed.current = false; }} onPointerLeave=${() => { pressed.current = false; }} onPointerCancel=${() => { pressed.current = false; }}>
          MANTÉN EL DEDO AQUÍ<small>Modo táctil: suéltalo y "te moviste"</small>
        </div>`}
      <${SensorChip} />
    </div>`;
}

/* ───────────────────────── 8. PIXEL ART ───────────────────────── */
export function Pixel({ s, g, link }) {
  useTick(500);
  const now = link.serverNow();
  useEffect(() => { if (g.revealed) confetti({ count: 200 }); }, [g.revealed]);
  const tb = g.turnTable ? tableOf(s, g.turnTable) : null;
  const myTurn = !g.useTurns || !g.turnTable || g.turnTable === s.me.table;
  return html`
    <div class="stack">
      <div class=${cx('card center-col', myTurn ? 'ok-card' : '')} style=${tb ? { '--c': tb.color } : {}}>
        ${g.revealed ? html`<b>🖼️ ¡Mural completo! Mira la pantalla grande.</b>` : g.useTurns && tb
          ? html`<b>${myTurn ? '¡ES EL TURNO DE TU MESA!' : `Turno de ${tb.emoji} Equipo ${tb.n}`}</b><small>${fmt(g.turnEndsAt - now)} · ${g.painted}/${g.total} píxeles</small>`
          : html`<b>Pinten libremente</b><small>${g.painted}/${g.total} píxeles</small>`}
      </div>
      <div class="px-cards">
        ${g.mine.length === 0 && html`<div class="card mut">No tienes píxeles asignados (te registraste tarde). ¡Anima a los demás!</div>`}
        ${g.mine.map((c) => html`
          <div class=${cx('card px-card', c.painted && 'done')}>
            <div class="px-sw" style=${{ background: c.hex }}></div>
            <div class="px-info"><b class="px-label">${c.label}</b><span>Pinta de <b>${c.name}</b></span></div>
            <${MiniGrid} cols=${g.cols} rows=${g.rows} x=${c.x} y=${c.y} />
            <button class="btn lime" disabled=${c.painted || !myTurn} onClick=${() => { link.send('CONFIRM_PIXEL', { x: c.x, y: c.y }); }}>${c.painted ? '✔ Listo' : 'Pintado'}</button>
          </div>`)}
      </div>
      <small class="mut center">Acércate al mural, pinta tu casilla y confírmala aquí. No sabrás qué dibujo forma… 🤫</small>
    </div>`;
}
function MiniGrid({ cols, rows, x, y }) {
  return html`<div class="mini" style=${{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>${Array.from({ length: cols * rows }, (_, i) => html`<i class=${(i % cols) + 1 === x && Math.floor(i / cols) + 1 === y ? 'me' : ''}></i>`)}</div>`;
}

/* ───────────────────────── 9. FOTO ───────────────────────── */
export function Foto({ s, g, link }) {
  useTick(250);
  const now = link.serverNow();
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (g.status === 'shot1' || g.status === 'shot2') { setFlash(true); const t = setTimeout(() => setFlash(false), 700); return () => clearTimeout(t); } }, [g.status]);
  useEffect(() => { if (g.status === 'done') confetti({ count: 260 }); }, [g.status]);
  const cd = secLeft(g.countEndsAt, now);
  return html`
    <div class="stack">
      ${flash && html`<div class="flash"></div>`}
      ${g.status === 'idle' && html`<${Waiting} icon="📸" title="La Foto Loca Exprés" text="En cuanto el anfitrión lo indique recibirás tu misión SECRETA. ¡No se la muestres a nadie!" />`}
      ${g.status === 'reading' && html`
        <div class="card mission">
          <small>🤫 TU MISIÓN SECRETA</small>
          <p>${g.mission}</p>
          <div class="bar thin"><i style=${{ width: Math.max(0, ((g.readEndsAt - now) / (g.readSeconds * 1000)) * 100) + '%' }}></i></div>
          <b>${secLeft(g.readEndsAt, now)}s para memorizarla</b>
        </div>`}
      ${g.status === 'countdown' && html`<div class="card mission center-col"><small>🎬 ¡A POSICIÓN!</small><p>${g.mission}</p><div class="mega-num">${cd}</div></div>`}
      ${(g.status === 'shot1') && html`<div class="card center-col win"><div class="wait-ico">📸</div><h2>¡FOTO 1!</h2><p class="mut">¡Aguanta la pose!</p></div>`}
      ${g.status === 'pose2' && html`<div class="card mission center-col"><small>🔁 SEGUNDA FOTO · TODOS JUNTOS</small><p>${g.finalPose}</p><div class="mega-num">${secLeft(g.poseEndsAt, now)}</div></div>`}
      ${g.status === 'shot2' && html`<div class="card center-col win"><div class="wait-ico">📸</div><h2>¡FOTO 2!</h2></div>`}
      ${g.status === 'done' && html`<div class="card center-col win"><div class="wait-ico">🌟</div><h2>¡META COLECTIVA 4/4!</h2><p class="mut">Lo lograron. ¡Gracias por jugar!</p></div>`}
    </div>`;
}

/* ───────────────────────── CEREMONIA ───────────────────────── */
export function Ceremonia({ s, g }) {
  useEffect(() => { if (g.step >= 4) confetti({ count: 300 }); }, [g.step]);
  return html`
    <div class="stack">
      <div class="card center-col"><div class="wait-ico">🏆</div><h2>Ceremonia de Premiación</h2>${g.step === 0 && html`<p class="mut">Atentos a la pantalla grande…</p>`}</div>
      ${g.kahoot.length > 0 && html`<div class="card"><b>🧠 Trofeo individual (Kahoot)</b>${g.kahoot.map((p, i) => html`<div class="rank-row"><span>${['🥇', '🥈', '🥉'][i]} ${p.name}</span><b>${money(p.score)}</b></div>`)}</div>`}
      ${[3, 2, 1].filter((k) => g.podium[k]).map((k) => html`<div class="card pod" style=${{ '--c': g.podium[k].color }}><span class="medal">${['', '🥇', '🥈', '🥉'][k]}</span><div><b>${g.podium[k].emoji} ${g.podium[k].name}</b><small class="mut">Equipo ${g.podium[k].n}</small></div><b>${money(g.podium[k].aura)} ✨</b></div>`)}
    </div>`;
}

/* ───────────────────────── HORA LOCA / FIESTA LIBRE ───────────────────────── */
const EMOJIS = ['🎉', '🔥', '💃', '😂', '❤️', '🤩', '🥳', '👏'];
export function Reactions({ link }) {
  return html`<div class="reactions">${EMOJIS.map((e) => html`<button onClick=${() => { vibrate(15); link.send('REACTION', { emoji: e }); }}>${e}</button>`)}</div>`;
}

export function DiscoLayer({ s, link }) {
  const d = s.disco;
  const [color, setColor] = useState('#000');
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(false); }, [d.startedAt]);
  useEffect(() => {
    if (!d.on) return;
    let raf;
    const pal = ['#ff2e93', '#18f0ff', '#b6ff3b', '#ffb800', '#8a5cff', '#ffffff', '#ff3b3b'];
    const loop = () => {
      const beat = 60000 / d.bpm;
      const k = Math.floor((link.serverNow() - d.startedAt) / beat);
      const ph = ((link.serverNow() - d.startedAt) % beat) / beat;
      setColor(ph < 0.55 ? pal[k % pal.length] : '#05060f');
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [d.on, d.bpm, d.startedAt]);
  if (!d.on || hidden) return null;
  return html`<div class="disco" style=${{ background: color }}><button class="btn ghost sm" onClick=${() => setHidden(true)}>Salir del modo disco</button><div class="disco-t">🪩 ¡Levanta el celular!</div></div>`;
}

export function Libre({ s, link }) {
  return html`<div class="stack"><div class="card center-col"><div class="wait-ico">${s.phase.icon}</div><h2>${s.phase.name}</h2><p class="mut">${s.phase.id === 'HORA_LOCA' ? '¡A bailar! Manda reacciones a la pantalla grande. Cuando el DJ active el modo disco, tu celular se vuelve luz.' : '¡La fiesta continúa! Manda reacciones a la pantalla grande 👇'}</p></div><${Reactions} link=${link} /></div>`;
}
