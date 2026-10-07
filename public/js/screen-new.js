// Pantalla Central — Entrada, Caja Fuerte, La Bomba y Cierre (película de la noche).
import { html, useState, useEffect, useRef, useTick, cx, fmt, secLeft, tableOf, money, qrSvg, confetti } from './lib.js';
import * as sfx from './sfx.js';

const Big = ({ icon, title, sub, children }) => html`<div class="scr-center"><div class="scr-ico">${icon}</div><h1>${title}</h1>${sub && html`<p>${sub}</p>`}${children}</div>`;

/* ───────────────────────── ENTRADA ───────────────────────── */
export function ScreenLobby({ s, joinUrl }) {
  const svg = joinUrl ? qrSvg(joinUrl) : '';
  const c = s.lobby.counts;
  const stat = (n, l, cls) => html`<div class=${cx('stat', cls)}><b>${n}</b><small>${l}</small></div>`;
  return html`
    <div class="lobby">
      <div class="lobby-qr">
        <div class="qr-card" dangerouslySetInnerHTML=${{ __html: svg }}></div>
        <h2>Escanea · test · pareja · equipo</h2>
        <code>${(joinUrl || '').replace(/^https?:\/\//, '')}</code>
        <div class="stats">
          ${stat(c.registered, 'registrados')}${stat(c.testing, 'en el test')}${stat(c.waiting, 'esperando pareja', 'amber')}
          ${stat(c.paired, 'emparejados', 'pink')}${stat(c.inTeam, 'en equipo', 'ok')}${stat(`${c.completeTeams}/${c.teams}`, 'equipos completos', 'ok')}
        </div>
        ${s.lobby.closed && html`<div class="chip ok">🔒 Equipos cerrados · los tardíos entran directo</div>`}
      </div>
      <div class="lobby-tables">
        ${s.tables.map((t) => html`
          <div class=${cx('lt', t.members >= 6 && 'full')} style=${{ '--c': t.color }}>
            ${t.selfie && html`<img class="lt-selfie" src=${t.selfie} alt="" />`}
            <div class="lt-h"><span>${t.emoji}</span><b>${t.name}</b><em>${t.members}</em></div>
            <div class="lt-n">${(s.roster[t.n] || []).map((m) => html`<span class=${m.online ? 'on' : ''}>${m.animal ? m.animal.emoji : '🙂'} ${m.name}</span>`)}</div>
          </div>`)}
      </div>
      <div class="pair-ticker">${s.lobby.recent.map((r) => html`<span>💞 ${r.names.map((n) => `${n.name} ${n.animal ? n.animal.emoji : ''}`).join(' + ')}</span>`)}</div>
    </div>`;
}

/* ───────────────────────── CAJA FUERTE ───────────────────────── */
export function ScreenCaja({ s, g }) {
  return html`
    <div class="caja-scr">
      <div class="cs-teams">
        ${s.tables.map((t) => {
          const x = g.teams[t.n] || {};
          return html`<div class=${cx('cj-card', x.opened && 'open', x.solved && !x.opened && 'solved')} style=${{ '--c': t.color }}>
            <div class="cj-door">${x.opened ? '🔓' : x.solved ? '🔑' : '🔒'}</div>
            <b>${t.emoji} ${t.name}</b>
            ${x.opened ? html`<div class="cj-badge">#${x.order} · ${fmt(x.secs * 1000)}${x.forced ? ' (forzada)' : ''}</div>`
              : x.solved ? html`<div class="cj-wait ok">¡Código descifrado! Abriendo…</div>` : html`<div class="cj-wait">${x.attempts ? `${x.attempts} intento${x.attempts > 1 ? 's' : ''}` : 'Descifrando…'}</div>`}
            <div class="cj-fails">${'✖'.repeat(Math.min(10, x.fails || 0)) || ' '}</div>
          </div>`;
        })}
      </div>
      <div class="cj-emojis">
        <h3>Los 6 emojis escondidos</h3>
        <div class="em-row">${g.emojis.map((e) => html`<div class=${cx('em-slot', e.emoji && 'used')}>${e.emoji ? html`<span>${e.emoji}</span><small>${tableOf(s, e.team).emoji} Equipo ${e.team}</small>` : html`<span>❔</span><small>libre</small>`}</div>`)}</div>
        <div class="cj-flags">${g.free ? html`<span class="chip ok">💡 Pistas gratis</span>` : ''}${g.force ? html`<span class="chip pink">⏰ El anfitrión puede forzar la apertura</span>` : ''}<span class="chip">${g.openCount}/${s.tables.length} cajas abiertas</span></div>
      </div>
    </div>`;
}

/* ───────────────────────── LA BOMBA ───────────────────────── */
const KIND = { charada: '🐾', objeto: '🧤', paparazzi: '📸', karaoke: '🎤' };
function Roles({ r }) {
  const person = (p) => html`<span class="rp">${p.animal ? p.animal.emoji : '🙂'} ${p.name}</span>`;
  return html`<div class="roles-scr">
    <div class="rcol blind"><small>🙈 CIEGO</small>${person(r.blind)}</div>
    <div class="rcol deaf"><small>🙉 SORDOS</small>${r.deaf.map(person)}</div>
    <div class="rcol mute"><small>🙊 MUDOS</small>${r.mute.map(person)}</div>
  </div>`;
}
function Cups({ o }) {
  return html`<div class="cups">${[1, 2, 3, 4].map((n) => html`<div class=${cx('cup', o && o.cup === n && (o.ok ? 'ok' : 'bad'), o && o.pos === n && 'real')}><span>🥤</span><div class="dots">${'•'.repeat(n)}</div>${n === 4 ? html`<small>Espacio exterior</small>` : ''}</div>`)}</div>`;
}

function Scene({ s, g, now }) {
  const c = g.current;
  const secs = c.status === 'play' ? secLeft(c.endsAt, now) : 0;
  useEffect(() => { if (c.status === 'play' && secs > 0 && secs <= 5) sfx.play('tick'); }, [secs, c.status]);
  const gm = c.game || {};
  const stageLine = html`<div class="bs-head" style=${{ '--c': c.color }}><span>${c.emoji}</span><div><b>${c.teamName}</b><small>${c.icon} ${c.gameName} · juego ${c.gameIdx + 1} de ${c.games}</small></div>
    ${(c.status === 'play') && html`<div class=${cx('bs-time', secs <= 10 && 'hot')}>${fmt(c.endsAt - now)}</div>`}</div>`;

  let body = null;
  if (c.status === 'intro' || c.status === 'ready') body = html`<${Roles} r=${c.roles} /><div class="bs-big">${c.status === 'intro' ? secLeft(c.introEndsAt, now) : '🟢 LISTOS'}</div><p class="center big-p">Los roles se reparten… ${c.swaps ? '(hubo cambios de rol)' : ''}</p>`;
  else if (c.status === 'play' || c.status === 'mark') {
    if (c.key === 'charada') body = html`<div class="bs-center"><div class="bs-emoji">🎭</div><h1>¿Qué animal es?</h1><p class="big-p">Los mudos lo mimean · los sordos lo describen · el ciego lo dibuja</p></div>`;
    if (c.key === 'objeto') body = html`<div class="bs-center"><h1>Objeto ${Math.min(gm.idx + 1, gm.total)} de ${gm.total}</h1>
      <div class="obj-dots">${gm.reveal.map((o, i) => html`<span class=${cx(o && (o.ok ? 'ok' : 'bad'), i === gm.idx && 'cur')}>${o ? (o.ok ? '✔' : '✖') : i + 1}</span>`)}</div>
      ${gm.step === 'cup' ? html`<p class="big-p amber">🥤 ¿En qué vaso lo metió? El ayudante lo marca…</p>` : gm.step === 'reveal' && gm.reveal[gm.idx] ? html`<div class="obj-rev"><small>ERA…</small><h1>${gm.reveal[gm.idx].name}</h1><${Cups} o=${gm.reveal[gm.idx]} /></div>` : html`<p class="big-p">El ciego toca el objeto y hace solo sonidos…</p>`}</div>`;
    if (c.key === 'paparazzi') body = html`<div class="bs-center"><div class="bs-emoji">📸</div><h1>Paparazzi a ciegas</h1><p class="big-p">Disparos: <b>${gm.shots}</b> de 3 · objetivo secreto entre el público</p></div>`;
    if (c.key === 'karaoke') body = html`<div class="bs-center karaoke-scr" style=${{ transform: gm.flip ? 'rotate(180deg)' : 'none' }}><h1>🎵 Adivina la canción</h1>
      <div class="k-bigseq">${Array.from({ length: 5 }, (_, i) => html`<span class=${gm.seq[i] ? 'on' : ''}>${gm.seq[i] || ''}</span>`)}</div>
      <div class="k-info"><span>🚩 Faltas: ${gm.faults}/${gm.maxFaults}</span><span>😈 Sabotajes: ${gm.saboteurs.length}/3</span></div>
      ${c.status === 'mark' ? html`<p class="big-p amber">¿Acertaron? El ayudante lo marca…</p>` : ''}</div>`;
  } else if (c.status === 'vote') {
    const sv = (n) => html`<div class="vote-meter"><span>🗳️ Público</span><b>${c.publicVotes}</b><span>⚖️ Jurado</span><b>${c.juryVotes}/${c.jurors}</b><span class="vt">${secLeft(c.voteEndsAt, now)}s</span></div>`;
    if (c.key === 'charada') body = html`<div class="bs-center"><small>EL ANIMAL ERA…</small><h1 class="reveal-w">${(gm.animal || '').toUpperCase()}</h1><p class="big-p">¿Se parece el dibujo? Voten 👍 / 👎 en su celular</p>${sv()}</div>`;
    if (c.key === 'objeto') body = html`<div class="bs-center"><h1>Resumen</h1><div class="obj-sum">${gm.reveal.map((o) => o && html`<div class=${o.ok ? 'ok' : 'bad'}><b>${o.name}</b><span>vaso ${o.cup} ${o.ok ? '✔' : '✖'}</span></div>`)}</div>${sv()}</div>`;
    if (c.key === 'paparazzi') body = html`<div class="bs-center"><small>FOTO ${gm.photoIdx + 1} DE ${gm.photos.length}</small>${gm.photos.length ? html`<img class="photo-big" key=${gm.photos[gm.photoIdx]} src=${gm.photos[gm.photoIdx]} alt="" />` : html`<h1>😅 ¡Ninguna foto!</h1>`}<p class="big-p">Objetivo: ${gm.target ? `${gm.target.animal.emoji} ${gm.target.name}` : '—'}</p>${sv()}</div>`;
    if (c.key === 'karaoke') body = html`<div class="bs-center"><small>LA CANCIÓN ERA…</small><h1 class="reveal-w">${gm.song}</h1><div class="k-bigseq">${(gm.seq || []).map((e) => html`<span class="on">${e}</span>`)}</div><p class=${cx('big-p', gm.correct ? 'lime' : 'red')}>${gm.correct ? '🎉 ¡ACERTARON!' : '😅 No la adivinaron'}</p>${sv()}</div>`;
  } else if (c.status === 'reveal' || c.status === 'revealed') {
    const r = c.result, st = c.status === 'revealed' ? 3 : c.revealStep;
    body = html`<div class="reveal-row">
      <div class=${cx('rv-box', st >= 1 && 'show')}><small>⚖️ JURADO</small><b>${st >= 1 ? r.jury : '?'}</b><em>/ 50</em></div>
      <div class=${cx('rv-box', st >= 2 && 'show')}><small>🗳️ PÚBLICO</small><b>${st >= 2 ? r.pub : '?'}</b><em>/ 50</em></div>
      <div class=${cx('rv-box total', st >= 3 && 'show')}><small>🏅 TOTAL</small><b>${st >= 3 ? r.total : '?'}</b><em>${st >= 3 ? `${r.fault ? `faltas −${r.fault} · ` : ''}${r.mult > 1 ? `×${r.mult}` : 'puntos'}` : ''}</em></div></div>`;
  } else if (c.status === 'finished') {
    const tot = c.results.reduce((a, r) => a + r.total, 0);
    body = html`<div class="bs-center"><div class="bs-emoji">🎬</div><h1>¡${c.teamName} terminó la Bomba!</h1><div class="finish-list">${c.results.map((r) => html`<div><span>${KIND[r.key]} ${r.name}</span><b>${r.total}</b></div>`)}</div><div class="bs-big">${tot} pts</div></div>`;
  }
  return html`<div class="bomba-stage">${stageLine}${body}</div>`;
}

export function ScreenBomba({ s, g, now }) {
  const q = g.queue;
  return html`
    <div class="bomba-scr">
      <aside class="bq"><h3>🎟️ Cola</h3>
        ${q.map((t, i) => html`<div class=${cx('bq-row', t.current && 'on', t.done != null && 'done')} style=${{ '--c': t.color }}><span class="bq-n">${i + 1}</span><span>${t.emoji} ${t.name}</span><b>${t.done != null ? `${t.done} pts` : t.current ? '🎤' : ''}</b></div>`)}</aside>
      <section>${g.current ? html`<${Scene} s=${s} g=${g} now=${now} />` : html`<${Big} icon="💣" title="La Bomba" sub="Teléfono descompuesto humano · el siguiente equipo al frente…" />`}</section>
    </div>`;
}

/* ───────────────────────── CIERRE: película de la noche ───────────────────────── */
export function ScreenCierre({ s, g, now, link }) {
  const it = g.item;
  const vref = useRef();
  useEffect(() => { if (it && it.type === 'clip' && vref.current) { vref.current.play().catch(() => {}); } }, [g.idx, it && it.type]);
  if (!g.playing || !it) {
    return html`<${Big} icon="🎬" title="Película de la noche" sub=${g.total ? `${g.total} escenas listas · el anfitrión la proyectará` : `${g.clips} clip(s) del Karaoke listos`} />`;
  }
  if (it.type === 'title') return html`<div class="movie title-card" style=${{ '--c': it.color || 'var(--pink)' }} key=${g.idx}><h1>${it.text}</h1><p>${it.sub}</p></div>`;
  if (it.type === 'clip') return html`<div class="movie" key=${g.idx}><video ref=${vref} src=${it.url} autoplay playsinline onEnded=${() => link.send('MOVIE_ENDED', { idx: g.idx })} onError=${() => link.send('MOVIE_ERROR', { idx: g.idx })}></video><div class="movie-cap">${it.caption}</div></div>`;
  if (it.type === 'photo') return html`<div class="movie photo" key=${g.idx}><img src=${it.url} alt="" /><div class="movie-cap big">${it.caption}</div></div>`;
  if (it.type === 'ranking') return html`<div class="movie title-card" key=${g.idx}><h1>🏆 Así van los equipos</h1><div class="rank-list">${it.ranking.map((r, i) => html`<div style=${{ '--c': tableOf(s, r.n).color }}><b>${i + 1}</b><span>${tableOf(s, r.n).emoji} ${r.name}</span><em>${money(r.pts)}</em></div>`)}</div></div>`;
  return html`<div class="movie title-card end" key=${g.idx}><h1>🎂 ${it.text}</h1><div class="lyrics">${it.lyrics.map((l) => html`<p>${l}</p>`)}</div></div>`;
}
