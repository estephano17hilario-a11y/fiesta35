// Vistas de la Pantalla Central (proyector / TV) por fase.
import { html, useState, useEffect, useRef, useTick, cx, fmt, secLeft, tableOf, money, qrSvg, confetti } from './lib.js';
import * as sfx from './sfx.js';

const T = (s, n) => tableOf(s, n);
export const Big = ({ icon, title, sub, children }) => html`<div class="scr-center"><div class="scr-ico">${icon}</div><h1>${title}</h1>${sub && html`<p>${sub}</p>`}${children}</div>`;

/* ───────── 3. Crimen ───────── */
export function ScreenCrimen({ s, g, now }) {
  const nm = (list, id) => (list.find((x) => x.id === id) || {});
  const last = g.notes[g.notes.length - 1];
  const culprit = g.answer && nm(g.suspects, g.answer.s);
  return html`
    <div class="crimen-scr">
      <div class="cs-suspects">${g.suspects.map((p) => html`<div class=${cx('cs-sus', culprit && culprit.id === p.id && 'guilty', culprit && culprit.id !== p.id && 'cleared')}><span>${p.emoji}</span><b>${p.name}</b><small>${p.alibi}</small></div>`)}</div>
      <div class="cs-mid">
        ${g.revealed && culprit
          ? html`<div class="reveal-big"><small>EL CULPABLE ES…</small><div class="face">${culprit.emoji}</div><h1>${culprit.name}</h1><p>con ${nm(g.weapons, g.answer.w).emoji} ${nm(g.weapons, g.answer.w).name} · ${nm(g.motives, g.answer.m).name}</p></div>`
          : last
            ? html`<div class="wa-big"><div class="wa-from">🎙️ Nota de voz filtrada · ${last.emoji} ${last.from} <em>${last.duration}</em></div><div class="wa-wave">${Array.from({ length: 40 }, (_, i) => html`<i style=${{ animationDelay: i * 40 + 'ms', height: 10 + ((i * 53) % 40) + 'px' }}></i>`)}</div><p>“${last.text}”</p><small>${g.notes.length}/${g.notesTotal} audios filtrados</small></div>`
            : html`<div class="wa-big"><h1>🕵️ Investiguen</h1><p>Cada integrante tiene evidencias distintas. ¡Hablen entre ustedes!</p></div>`}
        ${g.voting.open && html`<div class="vote-clock">🗳️ VOTACIÓN ABIERTA · ${fmt(g.voting.endsAt - now)}</div>`}
      </div>
      <div class="cs-verd">
        <h3>⚖️ Veredictos</h3>
        ${s.tables.map((t) => {
          const v = g.verdicts[t.n] || {};
          return html`<div class=${cx('cs-v', v.done && 'done', v.correct === true && 'right', v.correct === false && 'wrong')} style=${{ '--c': t.color }}><span>${t.emoji} Equipo ${t.n}</span>
            <b>${v.done ? (g.revealed ? (v.correct ? '✔ Acertó' : '✖ Falló') : '🔒 Entregado') : g.voting.open ? `${v.votes || 0}/${v.need} votos` : '…'}</b></div>`;
        })}
      </div>
    </div>`;
}

/* ───────── 4. Keiko ───────── */
export function ScreenKeiko({ s, g, now }) {
  useEffect(() => {
    if (g.status === 'live') sfx.hum(g.pct / 100); else sfx.humStop();
    return () => sfx.humStop();
  }, [g.status, g.pct]);
  const left = g.status === 'live' ? secLeft(g.endsAt, now) : null;
  return html`
    <div class="keiko-scr">
      <div class="k-title">${g.status === 'success' ? '⚡ ¡LA MADRE DE KEIKO VOLVIÓ A LA VIDA!' : g.status === 'live' ? '⚡ ¡¡SACUDAN SUS CELULARES!!' : g.status === 'fail' ? '❌ Descarga insuficiente' : '⚡ Descarga a la Madre de Keiko'}</div>
      <div class=${cx('energy', g.status)}>
        <div class="e-fill" style=${{ height: g.pct + '%' }}></div>
        <div class="e-pct">${g.pct}%</div>
        ${g.status === 'live' && html`<div class="e-time">${left}s</div>`}
      </div>
      <div class="k-side">
        ${g.status === 'idle' && html`<p class="big-p">Objetivo colectivo: ${g.seconds} s de sacudidas.<br />Todos juntos al mismo tiempo.</p>`}
        ${g.top.length > 0 && html`<h3>🔥 Los que más agitan</h3>${g.top.map((p, i) => html`<div class="top-row"><span>${i + 1}. ${p.name}</span><b>${p.energy}</b></div>`)}`}
        ${g.status === 'success' && html`<div class="msg-box">${g.message}${g.videoUrl && html`<video src=${g.videoUrl} autoplay controls playsinline></video>`}</div>`}
      </div>
    </div>`;
}

/* ───────── 5. Kahoot ───────── */
const KCOL = [['▲', '#e21b3c'], ['◆', '#1368ce'], ['●', '#d89e00'], ['■', '#26890c']];
export function ScreenKahoot({ s, g, now }) {
  const left = secLeft(g.endsAt, now);
  useEffect(() => { if (g.status === 'question' && left > 0 && left <= 5) sfx.play('tick'); }, [left, g.status]);
  if (g.status === 'idle') return html`<${Big} icon="🧠" title="Kahoot: ¿Quién conoce más a ${s.meta.birthdayName}?" sub="${g.total} preguntas · cuanto más rápido, más puntos · ¡celulares listos!" />`;
  if (g.status === 'final') {
    const top = g.top;
    return html`<div class="k-final"><h1>🏆 ¡Campeón del Kahoot!</h1>
      ${g.winner && html`<div class="winner">${g.winner.name}<small>${money(g.winner.score)} pts</small></div>`}
      <div class="k-top5">${top.map((p, i) => html`<div style=${{ '--c': T(s, p.table).color }}><b>${i + 1}</b><span>${p.name}</span><em>${money(p.score)}</em></div>`)}</div></div>`;
  }
  const q = g.question;
  const total = g.dist.reduce((a, b) => a + b, 0) || 1;
  return html`
    <div class="k-scr">
      <div class="k-bar"><span>Pregunta ${g.q + 1} / ${g.total}</span><span>✋ ${g.answered}/${g.online}</span>${g.status === 'question' && html`<b class=${cx('k-count', left <= 5 && 'hot')}>${left}</b>`}</div>
      ${g.status === 'question' && html`<div class="bar thin"><i style=${{ width: Math.max(0, ((g.endsAt - now) / (g.seconds * 1000)) * 100) + '%' }}></i></div>`}
      <div class="k-question">${q.q}</div>
      ${q.image && html`<img class="k-img" src=${q.image} alt="" />`}
      <div class="k-opts">
        ${q.options.map((o, i) => html`
          <div class=${cx('k-opt', g.status === 'reveal' && (q.correct === i ? 'right' : 'wrong'))} style=${{ '--c': KCOL[i][1] }}>
            <span class="sh">${KCOL[i][0]}</span><span class="tx">${o}</span>
            ${g.status === 'reveal' && html`<span class="ct">${g.dist[i]}</span><i class="db" style=${{ width: (g.dist[i] / total) * 100 + '%' }}></i>`}
          </div>`)}
      </div>
      ${g.status === 'reveal' && html`<div class="k-top5 mini">${g.top.map((p, i) => html`<div><b>${i + 1}</b><span>${p.name}</span><em>${money(p.score)}</em></div>`)}</div>`}
    </div>`;
}

/* ───────── 6. Aura ───────── */
function Wheel({ segs, spin, now }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'), W = c.width, R = W / 2 - 8, total = segs.reduce((a, b) => a + b.weight, 0);
    let rot = 0;
    if (spin) {
      const idx = segs.findIndex((x) => x.id === spin.seg);
      const f0 = segs.slice(0, idx).reduce((a, b) => a + b.weight, 0) / total;
      const f = f0 + (segs[idx].weight / total) * spin.r;
      const final = Math.PI * 2 * 6 - Math.PI * 2 * f;
      const k = Math.min(1, Math.max(0, (now - spin.at) / 6500));
      rot = final * (1 - Math.pow(1 - k, 3));
    }
    g.clearRect(0, 0, W, W);
    g.save(); g.translate(W / 2, W / 2); g.rotate(rot - Math.PI / 2);
    let a = 0;
    for (const sg of segs) {
      const w = (sg.weight / total) * Math.PI * 2;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a, a + w); g.closePath();
      g.fillStyle = sg.color; g.fill(); g.strokeStyle = '#0b0d24'; g.lineWidth = 4; g.stroke();
      g.save(); g.rotate(a + w / 2); g.fillStyle = '#fff'; g.font = 'bold 34px system-ui'; g.textAlign = 'right'; g.fillText(`${sg.label} x${sg.mult}`, R - 24, 12); g.restore();
      a += w;
    }
    g.restore();
    g.beginPath(); g.arc(W / 2, W / 2, 34, 0, 7); g.fillStyle = '#0b0d24'; g.fill();
    g.beginPath(); g.moveTo(W / 2 - 22, 4); g.lineTo(W / 2 + 22, 4); g.lineTo(W / 2, 54); g.closePath(); g.fillStyle = '#fff'; g.fill();
  });
  return html`<canvas ref=${ref} width="620" height="620" class="wheel"></canvas>`;
}

export function ScreenAura({ s, g, now }) {
  const kindName = { trivia: 'Ronda 1 · Trivia de alto riesgo', duel: 'Ronda 2 · Duelo de representantes', roulette: 'Ronda 3 · Ruleta ALL-IN' }[g.kind] || '';
  useTick(60);
  const bets = g.bets;
  const showPick = g.status !== 'betting';
  const settledRows = g.status === 'settled' ? g.result.rows : [];
  return html`
    <div class="aura-scr">
      <div class="as-main">
        <div class="as-kind">${g.kind ? kindName : '🎰 Casino de Aura'}</div>
        ${(!g.kind || g.status === 'idle') && html`<${Big} icon="🎰" title="Farmeo de Aura" sub="Arriesguen su Aura. Quien mejor apueste, gana." />`}
        ${g.kind === 'trivia' && g.status === 'betting' && html`<div class="as-q hidden">🔒 La pregunta se revelará cuando todos los equipos apuesten…<small>${Object.keys(bets).length}/${s.tables.length} equipos apostaron</small></div>`}
        ${g.kind === 'trivia' && g.question && html`
          <div class="as-q"><div class="k-question">${g.question.q}</div>
          <div class="k-opts">${g.question.options.map((o, i) => html`<div class=${cx('k-opt', g.question.correct === i && 'right', g.status === 'settled' && g.question.correct !== i && 'wrong')} style=${{ '--c': KCOL[i][1] }}><span class="sh">${KCOL[i][0]}</span><span class="tx">${o}</span></div>`)}</div>
          ${g.status === 'question' && html`<div class="k-bar"><b class="k-count">${secLeft(g.endsAt, now)}</b></div>`}</div>`}
        ${g.kind === 'duel' && html`<div class="duel"><div class=${cx('dl a', g.result?.winner === 'A' && 'win')}><small>RINCÓN A</small><h1>${g.duel.a}</h1></div><div class="vs">VS</div><div class=${cx('dl b', g.result?.winner === 'B' && 'win')}><small>RINCÓN B</small><h1>${g.duel.b}</h1></div></div><p class="center mut">Paga x${g.multiplier} · ${g.status === 'betting' ? 'apuestas abiertas' : g.status === 'locked' ? 'apuestas cerradas' : ''}</p>`}
        ${g.kind === 'roulette' && html`<div class="roulette-wrap"><${Wheel} segs=${g.roulette} spin=${g.spin} now=${now} />${g.status === 'settled' && html`<div class="spin-res">${(g.roulette.find((r) => r.id === g.result.seg) || {}).label}</div>`}</div>`}
      </div>
      <div class="as-side">
        <h3>${g.status === 'settled' ? '💸 Resultado' : '🎲 Apuestas'}</h3>
        ${s.tables.map((t) => {
          const b = bets[t.n]; const r = settledRows.find((x) => x.table === t.n);
          return html`<div class=${cx('as-row', r && (r.win ? 'win' : 'lose'))} style=${{ '--c': t.color }}>
            <span>${t.emoji} Equipo ${t.n}</span>
            <b>${r ? `${r.delta > 0 ? '+' : ''}${money(r.delta)}` : b ? `${money(b.amount)} ✨${showPick && b.pick ? ' · ' + pickName(g, b.pick) : ''}` : '—'}</b>
          </div>`;
        })}
      </div>
    </div>`;
}
const pickName = (g, p) => (g.kind === 'duel' ? (p === 'A' ? g.duel.a : g.duel.b) : (g.roulette.find((r) => r.id === p) || {}).label);

/* ───────── 7. Estatua ───────── */
function Seismo({ series, tolerance }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, (H / 5) * i); g.lineTo(W, (H / 5) * i); g.stroke(); }
    const y = (v) => H - 20 - (Math.min(100, v * 3) / 100) * (H - 40); // zoom x3 para ver el ruido
    // umbral crítico
    g.strokeStyle = '#ff3b5c'; g.setLineDash([14, 10]); g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, y(tolerance)); g.lineTo(W, y(tolerance)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ff3b5c'; g.font = 'bold 22px system-ui'; g.fillText('UMBRAL CRÍTICO', 12, y(tolerance) - 10);
    if (series.length > 1) {
      const step = W / 59;
      const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, 'rgba(60,255,160,.45)'); grad.addColorStop(1, 'rgba(60,255,160,0)');
      g.beginPath(); series.forEach((p, i) => { const x = W - (series.length - 1 - i) * step, yy = y(p.m); i ? g.lineTo(x, yy) : g.moveTo(x, yy); });
      g.lineTo(W, H); g.lineTo(W - (series.length - 1) * step, H); g.closePath(); g.fillStyle = grad; g.fill();
      g.beginPath(); series.forEach((p, i) => { const x = W - (series.length - 1 - i) * step, yy = y(p.m); i ? g.lineTo(x, yy) : g.moveTo(x, yy); });
      const last = series[series.length - 1].m;
      g.strokeStyle = last > tolerance ? '#ff3b5c' : '#3cffa0'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
      g.beginPath(); g.arc(W - 4, y(last), 9, 0, 7); g.fillStyle = g.strokeStyle; g.fill();
    }
  });
  return html`<canvas ref=${ref} width="1100" height="420" class="seismo"></canvas>`;
}

export function ScreenEstatua({ s, g, now }) {
  const rdy = g.status === 'ready' ? secLeft(g.readyUntil, now) : 0;
  useEffect(() => { if (g.status === 'ready' && rdy > 0) sfx.play('tick'); }, [rdy, g.status]);
  const last = g.series.length ? g.series[g.series.length - 1].m : 0;
  const hot = g.status === 'still' && last > g.tolerancePct;
  return html`
    <div class=${cx('estatua-scr', hot && 'hot')}>
      <div class="es-rounds">${Array.from({ length: g.rounds }, (_, i) => html`<span class=${cx(i < g.successes && 'done', i === g.successes && g.status !== 'done' && 'cur')}>🗿 ${i + 1}</span>`)}</div>
      ${g.status === 'idle' && html`<${Big} icon="🗿" title="La Estatua Colectiva" sub="Celular en el bolsillo · cero movimiento · ${Math.round(g.holdTarget / 1000)} segundos seguidos" />`}
      ${g.status === 'ready' && html`<${Big} icon="🤫" title="¡Congélense en ${rdy}!" sub="Celulares al bolsillo…" />`}
      ${(g.status === 'still' || g.status === 'success' || g.status === 'fail' || g.status === 'done') && html`
        <${Seismo} series=${g.series} tolerance=${g.tolerancePct} />
        <div class="es-hold"><div class="bar big"><i style=${{ width: Math.min(100, (g.holdMs / g.holdTarget) * 100) + '%' }}></i><span>${(g.holdMs / 1000).toFixed(1)} s / ${Math.round(g.holdTarget / 1000)} s</span></div></div>
        <div class="es-stats"><div><small>Moviéndose</small><b class=${hot ? 'red' : 'lime'}>${last}%</b></div><div><small>Teléfonos</small><b>${g.participants}</b></div><div><small>Límite</small><b>${g.tolerancePct}%</b></div></div>
        ${g.status === 'success' && html`<div class="es-banner ok">✅ ¡RONDA SUPERADA!</div>`}
        ${g.status === 'fail' && html`<div class="es-banner bad">💥 ¡SE MOVIERON! Intento fallido</div>`}
        ${g.status === 'done' && html`<div class="es-banner ok">🗿 ¡ESTATUA COLECTIVA COMPLETADA!</div>`}`}
    </div>`;
}

/* ───────── 8. Pixel Art ───────── */
export function ScreenPixel({ s, g, now }) {
  const [showImg, setShowImg] = useState(false);
  useEffect(() => { if (g.revealed) { confetti({ count: 240 }); const t = setTimeout(() => setShowImg(true), 3500); return () => clearTimeout(t); } setShowImg(false); }, [g.revealed]);
  const cells = g.revealed ? g.full : g.cells;
  const tb = g.turnTable ? T(s, g.turnTable) : null;
  const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, g.cols).split('');
  return html`
    <div class="pixel-scr">
      <div class="px-side">
        <h2>🟦 Pixel Art Secreto</h2>
        <div class="big-num">${g.painted}<small> / ${g.total}</small></div>
        <div class="bar big"><i style=${{ width: (g.painted / g.total) * 100 + '%' }}></i><span>meta ${g.threshold}</span></div>
        ${g.useTurns && tb && !g.revealed && html`<div class="turn" style=${{ '--c': tb.color }}><small>TURNO DE</small><b>${tb.emoji} Equipo ${tb.n}</b><em>${fmt(g.turnEndsAt - now)}</em></div>`}
        ${!g.useTurns && !g.revealed && html`<div class="turn"><small>MODO</small><b>¡Todos pintan!</b></div>`}
        ${g.revealed && html`<div class="turn done"><b>🖼️ ¡MURAL REVELADO!</b></div>`}
      </div>
      <div class="px-board" style=${{ '--cols': g.cols, '--rows': g.rows }}>
        <div class="px-cols">${cols.map((c) => html`<span>${c}</span>`)}</div>
        <div class="px-rows">${Array.from({ length: g.rows }, (_, i) => html`<span>${i + 1}</span>`)}</div>
        <div class="px-grid" style=${{ gridTemplateColumns: `repeat(${g.cols}, 1fr)` }}>
          ${cells.map((c, i) => html`<i class=${cx(c && 'p', g.revealed && 'rv')} style=${{ background: c || undefined }}>${!c ? html`<small>${cols[i % g.cols]}${Math.floor(i / g.cols) + 1}</small>` : ''}</i>`)}
        </div>
        ${g.revealed && showImg && g.revealImageUrl && html`<img class="px-final" src=${g.revealImageUrl} alt="" />`}
      </div>
    </div>`;
}

/* ───────── 9. Foto ───────── */
export function ScreenFoto({ s, g, now }) {
  const cd = secLeft(g.countEndsAt, now);
  const pose = secLeft(g.poseEndsAt, now);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (g.status === 'countdown' && cd > 0) sfx.play(cd <= 3 ? 'beep' : 'tick');
  }, [cd, g.status]);
  useEffect(() => {
    if (g.status === 'countdown' && cd <= 3 && cd > 0) { const t = setTimeout(() => sfx.play('beep'), 500); return () => clearTimeout(t); }
  }, [cd, g.status]);
  useEffect(() => { if (g.status === 'pose2' && pose > 0 && pose <= 3) sfx.play('beep'); }, [pose, g.status]);
  useEffect(() => { if (g.status === 'shot1' || g.status === 'shot2') { setFlash(true); const t = setTimeout(() => setFlash(false), 600); return () => clearTimeout(t); } }, [g.status]);
  useEffect(() => { if (g.status === 'done') confetti({ count: 300 }); }, [g.status]);
  return html`
    <div class="foto-scr">
      ${flash && html`<div class="flash"></div>`}
      ${g.status === 'idle' && html`<${Big} icon="📸" title="La Foto Loca Exprés" sub="Cada uno recibirá una misión SECRETA en su celular" />`}
      ${g.status === 'reading' && html`<${Big} icon="🤫" title="Lean su misión en secreto" sub="No se la muestren a nadie · memoricen la pose"><div class="mega-num">${secLeft(g.readEndsAt, now)}</div><//>`}
      ${g.status === 'countdown' && html`<div class="countdown"><small>¡A POSICIÓN!</small><div class=${cx('mega-num', cd <= 3 && 'hot')}>${cd}</div></div>`}
      ${(g.status === 'shot1' || g.status === 'shot2') && html`<${Big} icon="📸" title=${g.status === 'shot1' ? '¡FOTO 1!' : '¡FOTO 2!'} sub="¡Aguanten la pose!" />`}
      ${g.status === 'pose2' && html`<div class="countdown"><small>FOTO 2 · TODOS JUNTOS</small><h1>${g.finalPose}</h1><div class=${cx('mega-num', pose <= 3 && 'hot')}>${pose}</div></div>`}
      ${g.status === 'done' && html`<${Big} icon="🌟" title="¡META COLECTIVA 4/4 CONSEGUIDA!" sub="Gracias por jugar. ¡Que siga la fiesta!" />`}
    </div>`;
}

/* ───────── Ceremonia ───────── */
export function ScreenCeremonia({ s, g }) {
  useEffect(() => { if (g.step >= 4) confetti({ count: 400, duration: 5000 }); else if (g.step > 0) confetti({ count: 80 }); }, [g.step]);
  const order = [3, 2, 1];
  return html`
    <div class="ceremony">
      <h1>🏆 Ceremonia de Premiación</h1>
      ${g.step === 0 && html`<p class="big-p">Redoble de tambores…</p>`}
      ${g.kahoot.length > 0 && html`<div class="cer-kahoot"><h3>🧠 Trofeo Individual · Kahoot</h3>${g.kahoot.map((p, i) => html`<div style=${{ '--c': T(s, p.table).color }}><b>${['🥇', '🥈', '🥉'][i]}</b><span>${p.name}</span><em>${money(p.score)}</em></div>`)}</div>`}
      <div class="podium">
        ${order.map((k) => g.podium[k] ? html`<div class=${cx('pod-col', 'p' + k)} style=${{ '--c': g.podium[k].color }}><div class="pod-name">${g.podium[k].emoji}<b>${g.podium[k].name}</b><small>Equipo ${g.podium[k].n}</small><em>${money(g.podium[k].aura)} ✨</em></div><div class="pod-step">${['', '1', '2', '3'][k]}</div></div>` : html`<div class=${cx('pod-col', 'p' + k, 'empty')}><div class="pod-step">${k}</div></div>`)}
      </div>
      <div class="cer-stars">${['keiko', 'estatua', 'pixel', 'foto'].map((k) => html`<span class=${g.stars[k] ? 'on' : ''}>★</span>`)}<small>${Object.values(g.stars).filter(Boolean).length}/4 metas colectivas</small></div>
    </div>`;
}

/* ───────── Hora Loca / Fiesta libre ───────── */
export function ScreenLibre({ s, joinUrl, now }) {
  const bars = Array.from({ length: 48 });
  const d = s.disco;
  const beat = d.on ? ((now - d.startedAt) % (60000 / d.bpm)) / (60000 / d.bpm) : 0;
  return html`
    <div class=${cx('libre', d.on && 'disco-on')} style=${{ '--beat': beat }}>
      <div class="ball">🪩</div>
      <h1>${s.phase.name}</h1>
      <div class="eq">${bars.map((_, i) => html`<i style=${{ animationDelay: (i * 83) % 900 + 'ms', animationDuration: 500 + ((i * 131) % 600) + 'ms' }}></i>`)}</div>
      <p class="big-p">${d.on ? '¡Levanten sus celulares!' : 'Manden reacciones desde su celular 🎉'}</p>
    </div>`;
}
