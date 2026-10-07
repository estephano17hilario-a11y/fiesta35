// Invitado — LA BOMBA: teléfono descompuesto humano (ciego · sordos · mudos) y público que vota, sabotea y marca faltas.
import { html, useState, useEffect, useRef, useEvent, useTick, cx, fmt, secLeft, confetti, vibrate } from './lib.js';
import * as sfx from './sfx.js';

const tokenOf = () => { try { return localStorage.getItem('f35_token'); } catch { return null; } };
const ROLE = {
  blind: { icon: '🙈', name: 'CIEGO', color: '#ff2e93', desc: 'Llevas venda. Estás detrás de la pared: solo oyes la voz de los sordos por la ventanilla.' },
  deaf: { icon: '🙉', name: 'SORDO', color: '#18f0ff', desc: 'Con audífonos: ves la mímica de los mudos pero NO oyes. Tú sí puedes hablar: dile al ciego lo que ves.' },
  mute: { icon: '🙊', name: 'MUDO', color: '#b6ff3b', desc: 'No puedes hablar: solo mímica para tus compañeros sordos. Tú ves el secreto.' },
};
const HOW = {
  charada: { blind: 'Escucha a los sordos y DIBUJA el animal en la hoja de papel.', deaf: 'Mira la mímica de los mudos y descríbeselo al ciego por la ventanilla. ¡Sin decir el nombre del animal!', mute: 'Haz la mímica del animal secreto. ¡Sin hablar!' },
  objeto: { blind: 'Toca el objeto y haz SOLO sonidos (sin palabras). Luego mételo en uno de los 4 vasos.', deaf: 'Los mudos te mimean lo que oyen. Mira tus 4 opciones y GRITA el número que creas (1 a 4).', mute: 'Escuchas los sonidos del ciego a través de la pared: mimeaselo a los sordos.' },
  paparazzi: { blind: 'En la silla giratoria, con la venda: ¡dispara la cámara cuando los sordos te digan!', deaf: 'Traduce por voz la mímica de los mudos al ciego: "gira, un poco más… ¡dispara!".', mute: 'Busca a la persona objetivo entre el público y mimea hacia dónde debe apuntar.' },
  karaoke: { blind: 'Adivina la canción por el tarareo de los sordos y cántala sin música. ¡Cuando digas un título el público canta el coro!', deaf: 'Mira los emojis de los mudos y tararea la melodía al ciego. No puedes decir título ni letra.', mute: 'Arma la canción con hasta 5 emojis. ¡Nada de gesticular (te marcan falta)!' },
};

/* ───────── piezas pequeñas ───────── */
function Stars({ value, onPick, disabled }) {
  return html`<div class="stars-pick">${[1, 2, 3, 4, 5].map((n) => html`<button disabled=${disabled} class=${cx('sp', value >= n && 'on')} onClick=${() => { vibrate(20); onPick(n); }}>★</button>`)}</div>`;
}

function PaparazziCam({ left, link }) {
  const vref = useRef();
  const [err, setErr] = useState(null);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState(null);
  useEffect(() => {
    let st;
    (async () => {
      try {
        st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        setStream(st); vref.current.srcObject = st; await vref.current.play();
      } catch { setErr('No se pudo abrir la cámara (necesita HTTPS). Usa el botón de foto.'); }
    })();
    return () => { if (st) st.getTracks().forEach((t) => t.stop()); };
  }, []);
  const upload = async (blob) => {
    setBusy(true);
    try { await fetch(`/api/upload/photo?t=${tokenOf()}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } }); } catch { /* sin red */ }
    setBusy(false);
  };
  const shoot = async () => {
    if (busy || left <= 0) return;
    vibrate(60); setFlash(true); setTimeout(() => setFlash(false), 180);
    const v = vref.current;
    if (!stream || !v.videoWidth) return;
    const c = document.createElement('canvas');
    const w = Math.min(1000, v.videoWidth); c.width = w; c.height = Math.round(v.videoHeight * (w / v.videoWidth));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    let blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.7));
    if (blob.size > 650 * 1024) blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.4));
    upload(blob);
  };
  const onFile = async (e) => { const f = e.target.files[0]; if (!f) return; const img = await createImageBitmap(f); const c = document.createElement('canvas'); const w = Math.min(900, img.width); c.width = w; c.height = Math.round(img.height * (w / img.width)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); upload(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.6))); e.target.value = ''; };
  return html`
    <div class="paparazzi" onClick=${shoot}>
      <video ref=${vref} playsinline muted></video>
      ${flash && html`<div class="flash"></div>`}
      <div class="pp-ui"><b>${left} disparo${left === 1 ? '' : 's'}</b><span>TOCA CUALQUIER PARTE PARA DISPARAR</span></div>
      ${err && html`<div class="pp-err">${err}<label class="btn cyan"><input type="file" accept="image/*" capture="environment" hidden onChange=${onFile} />📷 Tomar foto</label></div>`}
    </div>`;
}

function KaraokeBoard({ p, link }) {
  return html`
    <div class="karaoke" style=${{ transform: p.flip ? 'rotate(180deg)' : 'none' }}>
      <div class="k-title">🎵 ${p.title}</div>
      <div class="k-seq">${Array.from({ length: p.max }, (_, i) => html`<span class=${p.seq[i] ? 'on' : ''}>${p.seq[i] || ''}</span>`)}
        <button class="btn sm ghost" onClick=${() => link.send('BOMBA_EMOJI', { op: 'undo' })}>⌫</button><button class="btn sm ghost" onClick=${() => link.send('BOMBA_EMOJI', { op: 'clear' })}>🗑</button></div>
      <div class="k-board">${p.board.map((e) => html`<button disabled=${!e || p.seq.length >= p.max} onClick=${() => { vibrate(12); link.send('BOMBA_EMOJI', { op: 'add', emoji: e }); }}>${e || ''}</button>`)}</div>
    </div>`;
}

/* ───────── en escena ───────── */
function OnStage({ s, g, link }) {
  const sc = g.scene, role = g.role, R = ROLE[role], how = HOW[sc.key][role] || '';
  const [audio, setAudio] = useState(false);
  useTick(250);
  const now = link.serverNow();
  useEvent('SABOTAGE_HORN', (p) => { vibrate([400, 100, 400, 100, 600]); let n = 0; const id = setInterval(() => { sfx.play('bocina'); if (++n >= Math.max(1, Math.floor(p.seconds / 1.1))) clearInterval(id); }, 1100); sfx.play('bocina'); });
  const pv = g.priv || {};

  const header = html`
    <div class="role-card" style=${{ '--c': R.color }}>
      <div class="rc-ico">${R.icon}</div>
      <div><small>TU ROL EN ${sc.gameName.toUpperCase()}</small><h2>${R.name}</h2></div>
    </div>`;

  if (sc.status === 'intro' || sc.status === 'ready') {
    return html`
      <div class="stack">
        ${header}
        <div class="card center-col"><p>${R.desc}</p><div class="how">${how}</div>
          <div class="mega-sm">${sc.status === 'intro' ? secLeft(sc.introEndsAt, now) : '🟢'}</div>
          <small class="mut">${sc.status === 'intro' ? 'Posiciónense…' : 'Esperando la señal del anfitrión'}</small>
          ${role === 'blind' && !audio && html`<button class="btn cyan sm" onClick=${() => { sfx.unlock(); setAudio(true); }}>🔊 Activar sonido (por si hay bocinas)</button>`}
          ${(role === 'blind' || role === 'deaf') && html`<button class="btn ghost sm" onClick=${() => link.send('BOMBA_SWAP', {})}>🔄 Prefiero otro rol (sin penalización)</button>`}
        </div>
        ${role === 'mute' && sc.key === 'charada' && pv.animal && html`<div class="card secret"><small>SECRETO (¡no lo digas!)</small><div class="secret-w">${pv.animal.toUpperCase()}</div></div>`}
        ${role === 'mute' && sc.key === 'paparazzi' && pv.target && html`<div class="card secret"><small>OBJETIVO</small><div class="secret-w">${pv.target.animal.emoji} ${pv.target.name}</div></div>`}
      </div>`;
  }

  if (sc.status === 'play' || sc.status === 'mark') {
    return html`
      <div class="stack">
        <div class="play-bar" style=${{ '--c': R.color }}><span>${R.icon} ${R.name}</span><b>${sc.status === 'mark' ? '✔ Marcando…' : fmt(sc.endsAt - now)}</b></div>
        ${role === 'mute' && sc.key === 'charada' && html`<div class="card secret"><small>HAZ LA MÍMICA DE…</small><div class="secret-w">${(pv.animal || '').toUpperCase()}</div></div>`}
        ${role === 'deaf' && sc.key === 'objeto' && pv.options && html`<div class="card"><b>Objeto ${pv.n} · ¿cuál crees que es? Grita el número</b><div class="opt4">${pv.options.map((o, i) => html`<div class=${cx('o4', i === 3 && 'ext')}><span>${i + 1}</span><b>${o}</b></div>`)}</div></div>`}
        ${role === 'deaf' && sc.key === 'objeto' && !pv.options && html`<div class="card center-col">⏳ Esperando el siguiente objeto…</div>`}
        ${role === 'mute' && sc.key === 'objeto' && html`<div class="card center-col"><div class="wait-ico">👂</div><p>Escucha a través de la pared y mimea lo que oigas.</p></div>`}
        ${role === 'blind' && sc.key === 'paparazzi' && html`<${PaparazziCam} left=${pv.shotsLeft ?? 0} link=${link} />`}
        ${role === 'mute' && sc.key === 'paparazzi' && pv.target && html`<div class="card secret"><small>FOTO DE…</small><div class="secret-w">${pv.target.animal.emoji} ${pv.target.name}</div><p class="mut sm">Búscalo/a en el público y mimea hacia dónde apuntar.</p></div>`}
        ${role === 'mute' && sc.key === 'karaoke' && pv.board && html`<${KaraokeBoard} p=${pv} link=${link} />`}
        ${role === 'deaf' && sc.key === 'karaoke' && html`<div class="card center-col"><small>EMOJIS DE LOS MUDOS</small><div class="k-big">${(pv.seq || []).join(' ') || '…'}</div><p class="mut sm">Tarárealo al ciego (¡sin decir título ni letra!).</p></div>`}
        ${['deaf', 'blind'].includes(role) && sc.key === 'charada' && html`<div class="card center-col"><div class="wait-ico">${R.icon}</div><p>${how}</p></div>`}
        ${role === 'blind' && ['objeto', 'karaoke'].includes(sc.key) && html`<div class="card center-col"><div class="wait-ico">${R.icon}</div><p>${how}</p></div>`}
        ${role === 'deaf' && sc.key === 'paparazzi' && html`<div class="card center-col"><div class="wait-ico">${R.icon}</div><p>${how}</p></div>`}
      </div>`;
  }

  return html`
    <div class="stack">
      ${header}
      <div class="card center-col">
        ${sc.status === 'vote' ? html`<div class="wait-ico">🗳️</div><h2>Votando el público y el jurado…</h2>` : ''}
        ${sc.status === 'reveal' || sc.status === 'revealed' ? html`<div class="wait-ico">🏅</div><h2>${sc.result && sc.revealStep >= 3 ? `${sc.result.total} puntos` : 'Resultados…'}</h2>${sc.result && sc.revealStep >= 1 ? html`<p class="mut">Jurado ${sc.result.jury} · Público ${sc.result.pub}${sc.result.fault ? ` · Faltas −${sc.result.fault}` : ''}</p>` : ''}` : ''}
        ${sc.status === 'finished' ? html`<div class="wait-ico">🎬</div><h2>¡Terminaron la Bomba!</h2>` : ''}
        <small class="mut">Mira la pantalla grande</small>
      </div>
    </div>`;
}

/* ───────── público ───────── */
function Audience({ s, g, link }) {
  const sc = g.scene;
  const [stars, setStars] = useState(0);
  useTick(250);
  const now = link.serverNow();
  useEffect(() => { setStars(0); }, [sc.gameIdx, sc.team, g.vote && g.vote.photoIdx]);
  const myTeamColor = (s.tables.find((t) => t.n === s.me.table) || {}).color;
  return html`
    <div class="stack">
      ${g.isTarget && html`<div class="card target-alert"><div class="wait-ico">📍</div><h2>¡ERES EL OBJETIVO!</h2><p>Quédate dentro del círculo marcado en el piso. Te van a fotografiar a ciegas 📸</p></div>`}
      <div class="card center-col" style=${{ '--c': sc.color }}>
        <small class="mut">EN ESCENA</small><h2 style=${{ color: sc.color }}>${sc.emoji} ${sc.teamName}</h2>
        <div class="chip pink">${sc.icon} ${sc.gameName} · ${sc.gameIdx + 1}/${sc.games}</div>
        ${sc.status === 'play' && html`<div class="mega-sm">${fmt(sc.endsAt - now)}</div>`}
        ${sc.status === 'intro' || sc.status === 'ready' ? html`<small class="mut">Preparándose…</small>` : ''}
      </div>

      ${g.vote && g.vote.open && html`
        <div class="card center-col vote-card">
          <h2>${sc.key === 'charada' ? '¿Se parece al animal?' : sc.key === 'paparazzi' ? `¿Qué tan buena salió la foto ${g.vote.photoIdx + 1}?` : '¿Qué tan bien lo hicieron?'}</h2>
          ${g.vote.kind === 'yesno'
            ? html`<div class="row gap"><button class=${cx('btn xl grow', g.vote.mine === 1 ? 'lime' : 'ghost')} onClick=${() => link.send('BOMBA_VOTE', { value: 1 })}>👍 Sí</button><button class=${cx('btn xl grow', g.vote.mine === 0 ? 'red' : 'ghost')} onClick=${() => link.send('BOMBA_VOTE', { value: 0 })}>👎 No</button></div>`
            : html`<${Stars} value=${g.vote.mine || stars} onPick=${(n) => { setStars(n); link.send('BOMBA_VOTE', { value: n }); }} />`}
          <small class="mut">Tu voto es de 10 segundos y cuenta mucho: ${secLeft(sc.voteEndsAt, now)}s</small>
        </div>`}
      ${g.vote && !g.vote.open && sc.status === 'vote' && html`<div class="card center-col mut">⏳ Votos cerrados.</div>`}

      ${(sc.status === 'reveal' || sc.status === 'revealed') && sc.result && html`
        <div class="card center-col result">
          <small>RESULTADO</small>
          ${sc.revealStep >= 1 && html`<div>Jurado <b>${sc.result.jury}</b></div>`}
          ${sc.revealStep >= 2 && html`<div>Público <b>${sc.result.pub}</b></div>`}
          ${sc.revealStep >= 3 && html`<div class="big-num">${sc.result.total} pts</div>`}
        </div>`}

      ${sc.key === 'karaoke' && g.fault && g.fault.active && html`
        <div class="card center-col">
          <button class="btn red block xl" onClick=${() => { vibrate(60); link.send('BOMBA_FAULT', {}); }}>🚩 ¡FALTA! (están gesticulando)</button>
          <small class="mut">Si el 25 % del público la marca en 5 s, cuenta.</small>
        </div>`}
      ${sc.key === 'karaoke' && g.sab && g.sab.active && html`
        <div class="card sab-card">
          <b>😈 Sabotaje (cuesta ${g.sab.cost} pts de tu equipo · quedan ${g.sab.left})</b>
          <div class="sab-grid">
            ${[['flip', '🙃 Voltear emojis'], ['erase', '🧽 Borrar 2 emojis'], ['horn', '📯 Bocina al ciego']].map(([k, l]) => html`<button class="btn ghost" disabled=${g.sab.left <= 0 || !g.sab.canAfford} onClick=${() => { vibrate(40); link.send('BOMBA_SABOTAGE', { kind: k }); }}>${l}</button>`)}
          </div>
          <small class="mut">Si el equipo acierta, se queda tus ${g.sab.cost} pts. Si falla, los recuperas y ganas ${g.sab.cost} más.</small>
        </div>`}
    </div>`;
}

export function Bomba({ s, g, link }) {
  if (!g.scene) {
    return html`
      <div class="stack"><div class="card center-col"><div class="wait-ico">💣</div><h2>La Bomba</h2>
        <p class="mut">Teléfono descompuesto humano: un equipo pasa al frente y los demás votan, sabotean y se ríen.</p>
        ${g.called ? html`<div class="chip pink">¡Tu equipo es el siguiente!</div>` : g.queuePos ? html`<div class="chip">Tu equipo pasa en la posición ${g.queuePos}</div>` : ''}
        ${g.myDone != null && html`<div class="chip ok">Ya jugaron: ${g.myDone} pts</div>`}</div></div>`;
  }
  if (g.onStage && g.role) return html`<${OnStage} s=${s} g=${g} link=${link} />`;
  if (g.onStage && !g.role) return html`<div class="card center-col"><div class="wait-ico">🫥</div><h2>Hoy estás de espectador</h2><p class="mut">Estás marcado como ausente o sin rol. Pide al anfitrión que te reasigne.</p></div>`;
  return html`<${Audience} s=${s} g=${g} link=${link} />`;
}
