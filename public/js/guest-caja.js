// Invitado — CAJA FUERTE (código de 4 piezas; la apertura se confirma con el código impreso DENTRO de la caja).
import { html, useState, useEffect, useEvent, useTick, cx, fmt, confetti, vibrate, tableOf } from './lib.js';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function Digits({ value, onChange, disabled }) {
  return html`<div class="digits">${DIGITS.map((d) => html`<button type="button" disabled=${disabled} class=${cx('dg', value === d && 'on')} onClick=${() => { vibrate(10); onChange(d); }}>${d}</button>`)}</div>`;
}

export function Caja({ s, g, link }) {
  const [p1, setP1] = useState(null);
  const [p2, setP2] = useState(null);
  const [p3, setP3] = useState('');
  const [p4, setP4] = useState(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [shake, setShake] = useState(false);
  useTick(500);
  const now = link.serverNow();
  const m = g.mine;

  useEvent('CAJA_RESULT', (p) => {
    if (p.ok) { confetti({ count: 140 }); setMsg({ ok: '🧩 ¡Las 4 piezas son correctas!' }); return; }
    setShake(true); setTimeout(() => setShake(false), 500); vibrate([300]);
    setMsg({ bad: p.cooldown && p.good == null && !('good' in p) ? `Enfriamiento: espera ${p.cooldown}s` : `❌ Intento fallido${p.good != null ? ` · ${p.good} de 4 correctas` : ''}` });
  });
  useEvent('CAJA_OPENED', () => confetti({ count: 260, duration: 4500 }));
  useEffect(() => { if (g.mine && !g.mine.last) setMsg(null); }, [g.mine && g.mine.last]);
  if (g.none) return html`<div class="card">Aún no tienes equipo.</div>`;

  const cool = Math.max(0, Math.ceil((m.cooldownUntil - now) / 1000));
  const consumed = new Set(g.emojis.filter((e) => e.emoji).map((e) => e.emoji));
  const board = html`
    <div class="card cj-board"><b>🏁 Cajas</b>
      <div class="cj-teams">${s.tables.map((t) => { const x = g.teams[t.n] || {}; return html`<div class=${cx('cj-t', x.opened && 'open', t.n === s.me.table && 'me')} style=${{ '--c': t.color }}><span>${t.emoji}</span><b>${x.opened ? `#${x.order}` : x.solved ? '🔑' : '🔒'}</b><small>${x.fails ? `✖${x.fails}` : ''}</small></div>`; })}</div>
    </div>`;

  /* ── caja ya abierta ── */
  if (m.opened) {
    return html`
      <div class="stack"><div class="card center-col win"><div class="wait-ico">🔓</div><h2>¡CAJA ABIERTA!</h2>
        <p>Fueron el <b class="lime">#${m.order}</b> en abrir · en <b>${fmt(m.secs * 1000)}</b></p>
        <div class="chip ok">Puntos sumados al equipo</div></div>${board}</div>`;
  }

  /* ── 4 piezas resueltas: a abrir la caja física ── */
  if (m.solved) {
    return html`
      <div class="stack">
        <div class="card center-col win"><div class="wait-ico">🧩</div><h2>¡Código descifrado!</h2><p class="mut">Premio asegurado: <b class="lime">${m.prize} pts</b></p></div>
        <div class="card center-col">
          <b>1 · Abran el candado</b>
          ${g.lockCode ? html`<div class="lock-code">${g.lockCode}</div><p class="mut sm">Esta es la combinación de la caja de su equipo.</p>` : html`<p class="mut">Pídele la llave o combinación al anfitrión.</p>`}
        </div>
        <div class="card center-col">
          <b>2 · Dentro de la caja hay un código</b>
          <p class="mut sm">Escríbanlo aquí para que quede registrado <b>en tiempo real</b> (cuenta el orden de apertura).</p>
          <input class="input word" inputmode="numeric" maxlength="6" placeholder="••••" value=${code} onInput=${(e) => setCode(e.target.value)} />
          <button class="btn lime block xl" disabled=${code.trim().length < 3} onClick=${() => { link.send('CAJA_CONFIRM', { code }); setCode(''); }}>📦 ¡La abrimos!</button>
        </div>
        ${board}
      </div>`;
  }

  /* ── resolver las 4 piezas ── */
  const hintBtn = (k) => m.hints[k]
    ? html`<div class="hint-text">💡 ${m.hints[k].text}</div>`
    : html`<button class="btn ghost sm" onClick=${() => link.send('CAJA_HINT', { piece: k })}>💡 Pedir pista ${g.free ? '(gratis)' : `(−${g.hintCost} pts)`}</button>`;
  const ready = p1 != null && p2 && p3.trim() && p4 != null && cool === 0;
  return html`
    <div class="stack">
      <div class=${cx('card cj-head', shake && 'shake')}>
        <div class="row between"><div><small class="mut">Premio actual</small><div class="big-num">${m.prize} <small>pts</small></div></div>
          <div class="cj-meta"><span>✖ ${m.fails} fallos</span>${g.free ? html`<span class="chip ok">pistas gratis</span>` : ''}</div></div>
        <small class="mut">Cada intento fallido baja el premio ${/* constante en servidor */ ''}(mínimo 20). Cualquiera del equipo puede intentar.</small>
        ${msg && html`<div class=${msg.ok ? 'ok-card' : 'bad-card'}>${msg.ok || msg.bad}</div>`}
      </div>

      <div class="card piece"><div class="pc-h"><span class="pc-n">1</span><b>Dato del equipo</b></div><p>${g.pieces.p1}</p>
        ${g.pieces.p1pending ? html`<div class="chip">⏳ Esperando la pregunta del anfitrión</div>` : html`<${Digits} value=${p1} onChange=${setP1} />`}${hintBtn('p1')}</div>

      <div class="card piece"><div class="pc-h"><span class="pc-n">2</span><b>Emoji escondido</b></div><p class="mut sm">Hay 6 emojis impresos en la terraza. Cualquiera de los 6 sirve… si no fue consumido por otro equipo.</p>
        <div class="egrid">${g.pieces.grid.map((e) => html`<button type="button" class=${cx('em', p2 === e && 'on', consumed.has(e) && 'used')} onClick=${() => { vibrate(10); setP2(e); }}>${e}</button>`)}</div>${hintBtn('p2')}</div>

      <div class="card piece"><div class="pc-h"><span class="pc-n">3</span><b>Acertijo del animal</b></div><p class="riddle">${g.pieces.p3}</p>
        <input class="input" placeholder="¿Qué animal es?" autocapitalize="none" value=${p3} onInput=${(e) => setP3(e.target.value)} />${hintBtn('p3')}</div>

      <div class="card piece"><div class="pc-h"><span class="pc-n">4</span><b>El número del sticker</b></div><p>${g.pieces.p4}</p>
        <${Digits} value=${p4} onChange=${setP4} />${hintBtn('p4')}</div>

      <button class="btn pink block xl" disabled=${!ready} onClick=${() => { link.send('CAJA_ATTEMPT', { p1, p2, p3, p4 }); setMsg(null); }}>
        ${cool > 0 ? `⏳ Espera ${cool}s` : '🔐 Probar el código'}</button>
      ${board}
    </div>`;
}
