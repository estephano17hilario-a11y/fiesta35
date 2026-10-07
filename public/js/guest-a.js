// Pantallas de invitado — parte A: utilidades de espera y ¿Quién mató a Gianella?
import { html, useState, useEffect, useRef, useEvent, useTick, cx, fmt, confetti, vibrate, tableOf } from './lib.js';

export const Waiting = ({ icon = '⏳', title, text, children }) => html`
  <div class="card center-col wait">
    <div class="wait-ico">${icon}</div>
    <h2>${title}</h2>
    ${text && html`<p class="mut">${text}</p>`}
    ${children}
  </div>`;

/* ───────────────────────── 3. CRIMEN ───────────────────────── */
export function Crimen({ s, g, link }) {
  const [tab, setTab] = useState('file');
  const [sel, setSel] = useState({ s: null, w: null, m: null });
  const [open, setOpen] = useState({});
  useTick(500);
  const now = link.serverNow();
  const names = (list, id) => (list.find((x) => x.id === id) || {}).name || '?';
  const mine = g.myVote;
  useEffect(() => { if (mine) setSel(mine); }, [mine && mine.s + mine.w + mine.m]);
  useEffect(() => { if (g.revealed) confetti({ count: 160 }); }, [g.revealed]);

  const tabs = [['file', '📁 Expediente'], ['proof', '🧪 Pruebas'], ['audio', `🎙️ Audios${g.notes.length ? ` (${g.notes.length})` : ''}`], ['vote', '⚖️ Acusar']];
  return html`
    <div class="crimen">
      <div class="tabs">${tabs.map(([k, l]) => html`<button class=${cx('tab', tab === k && 'on')} onClick=${() => setTab(k)}>${l}</button>`)}</div>

      ${tab === 'file' && html`
        <div class="stack">
          <div class="card note">🕵️ <b>EL CRIMEN OCURRIÓ EN PLENA FIESTA.</b> Alguien acabó con <b>${s.meta.birthdayName}</b>… y todos son sospechosos. Investiguen, crucen pistas con su equipo y acusen.</div>
          ${g.suspects.map((p) => html`
            <div class="card suspect"><div class="face">${p.emoji}</div><div><b>${p.name}</b><p class="mut sm">“${p.alibi}”</p></div></div>`)}
        </div>`}

      ${tab === 'proof' && html`
        <div class="stack">
          <div class="card note">🔒 <b>Tus evidencias</b> — solo tú las ves. ¡Compártelas con tu equipo!</div>
          ${g.cards.length ? g.cards.map((c) => html`<div class="card evidence"><div class="ev-ico">${c.emoji}</div><div><b>${c.title}</b><p>${c.text}</p></div></div>`) : html`<div class="card mut">No tienes evidencias asignadas.</div>`}
          ${g.testimonies.length > 0 && html`<div class="card note">🗣️ <b>Testimonios recogidos en la sala</b></div>`}
          ${g.testimonies.map((t) => html`<div class="card testimony">${t}</div>`)}
        </div>`}

      ${tab === 'audio' && html`
        <div class="stack wa">
          ${g.notes.length === 0 && html`<div class="card mut center-col">Aún no han llegado audios filtrados… 📵</div>`}
          ${g.notes.map((n) => html`
            <div class="wa-msg">
              <div class="wa-from">${n.emoji} ${n.from}</div>
              <div class="wa-row">
                <button class="wa-play" onClick=${() => setOpen({ ...open, [n.id]: !open[n.id] })}>${open[n.id] ? '⏸' : '▶'}</button>
                <div class=${cx('wave', open[n.id] && 'run')}>${Array.from({ length: 28 }, (_, i) => html`<i style=${{ height: 6 + ((i * 37 + n.id.charCodeAt(1) * 11) % 20) + 'px' }}></i>`)}</div>
                <span class="wa-dur">${n.duration}</span>
              </div>
              ${open[n.id] && html`<div class="wa-text">“${n.text}”</div>`}
            </div>`)}
          <small class="mut center">🔇 Los audios se leen en pantalla; la Pantalla Central pone los efectos.</small>
        </div>`}

      ${tab === 'vote' && html`
        <div class="stack">
          ${g.verdict && html`<div class="card verdict">
            <b>⚖️ Veredicto de tu equipo</b>
            <div>${names(g.suspects, g.verdict.s)} · ${names(g.weapons, g.verdict.w)} · ${names(g.motives, g.verdict.m)}</div>
            ${g.revealed && html`<div class=${g.verdict.correct ? 'ok-card' : 'bad-card'}>${g.verdict.correct ? `🎉 ¡ACERTARON! +${g.myPoints} Aura` : '❌ Fallaron el culpable'}</div>`}
          </div>`}
          ${g.revealed && g.answer && html`<div class="card reveal"><b>🔎 LA VERDAD</b><div class="truth"><span>${g.suspects.find((x) => x.id === g.answer.s).emoji} ${names(g.suspects, g.answer.s)}</span><span>${g.weapons.find((x) => x.id === g.answer.w).emoji} ${names(g.weapons, g.answer.w)}</span><span>🎯 ${names(g.motives, g.answer.m)}</span></div></div>`}
          ${!g.voting.open && !g.verdict && !g.revealed && html`<div class="card mut center-col">🗳️ La votación aún no está abierta. Sigan investigando.</div>`}
          ${g.voting.open && html`<div class="card note">⏱️ Votación abierta: <b>${fmt(g.voting.endsAt - now)}</b> · Se necesitan <b>${g.need}</b> votos iguales en tu equipo.</div>`}
          ${(g.voting.open || (!g.verdict && !g.revealed)) && !g.verdict && html`
            <div class="card">
              <b>1 · Sospechoso</b>
              <div class="pick-grid">${g.suspects.map((p) => html`<button class=${cx('pick', sel.s === p.id && 'on')} onClick=${() => setSel({ ...sel, s: p.id })}><span>${p.emoji}</span>${p.name}</button>`)}</div>
              <b>2 · Arma</b>
              <div class="pick-grid">${g.weapons.map((p) => html`<button class=${cx('pick', sel.w === p.id && 'on')} onClick=${() => setSel({ ...sel, w: p.id })}><span>${p.emoji}</span>${p.name}</button>`)}</div>
              <b>3 · Móvil</b>
              <div class="pick-grid one">${g.motives.map((p) => html`<button class=${cx('pick', sel.m === p.id && 'on')} onClick=${() => setSel({ ...sel, m: p.id })}>${p.name}</button>`)}</div>
              <button class="btn pink block xl" disabled=${!g.voting.open || !sel.s || !sel.w || !sel.m} onClick=${() => { link.send('CRIMEN_VOTE', sel); vibrate(60); }}>⚖️ Confirmar acusación${mine ? ' (cambiar voto)' : ''}</button>
            </div>`}
          ${g.tally.length > 0 && html`<div class="card"><b>Votos de tu equipo</b>
            ${g.tally.map((t) => html`<div class="tally"><div><b>${names(g.suspects, t.s)}</b> · ${names(g.weapons, t.w)} · ${names(g.motives, t.m)}</div><div class="row gap-s"><span class="chip">${t.count}/${g.need}</span><small class="mut">${t.voters.join(', ')}</small></div></div>`)}
          </div>`}
        </div>`}
    </div>`;
}
