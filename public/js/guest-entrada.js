// Invitado — ENTRADA: registro, test "esto o aquello", pareja por afinidad, equipo, selfie y ritual de bienvenida.
import { html, useState, useEffect, useRef, useEvent, useTick, cx, fmt, vibrate, confetti, qrSvg } from './lib.js';
import { Motion } from './sensors.js';

const LS = 'f35_token';
const tokenOf = () => { try { return localStorage.getItem(LS); } catch { return null; } };

export function Choice({ value, onChange, options, cols = 2 }) {
  return html`<div class="choice" style=${{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>${options.map(([v, l]) => html`<button type="button" class=${cx('opt', value === v && 'on')} onClick=${() => onChange(v)}>${l}</button>`)}</div>`;
}

/* ───────── 1. Registro ───────── */
export function Register({ s, link, regError, onSubmit }) {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [fav, setFav] = useState('');
  const [ok, setOk] = useState(false);
  const valid = name.trim().length >= 2 && fav.trim().length >= 2 && ok;
  const submit = (e) => { e.preventDefault(); if (!valid) return; Motion.enable(); onSubmit({ name, alias, fav, consent: true }); };
  return html`
    <form class="register" onSubmit=${submit}>
      <div class="hero">
        <div class="hero-emoji">🎮</div>
        <h1>${s.meta.eventName}</h1>
        <p>La fiesta de <b>${s.meta.birthdayName}</b> es un videojuego… y tú ya eres un jugador.</p>
      </div>
      <div class="card">
        <label>Tu nombre<input class="input" autocomplete="name" placeholder="Ej. Juan Pérez" value=${name} onInput=${(e) => setName(e.target.value)} required /></label>
        <label>Apodo (opcional)<input class="input" placeholder="Ej. Juanito" value=${alias} onInput=${(e) => setAlias(e.target.value)} /></label>
        <label>Tu cosa favorita, en una o dos palabras<input class="input" placeholder="comida, película, juego, lo que sea" maxlength="40" value=${fav} onInput=${(e) => setFav(e.target.value)} required /></label>
        <small class="mut">Se usa en un juego: ¡piensa bien cuál escribes!</small>
      </div>
      <label class="consent card"><input type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} /> <span>${s.consentText}</span></label>
      ${regError && html`<div class="card bad-card">${regError}</div>`}
      <button class="btn pink block xl" type="submit" disabled=${!valid}>🚀 ¡Empezar!</button>
    </form>`;
}

/* ───────── 2. Test "esto o aquello" (8 preguntas de un toque) + 4 rompehielos ───────── */
const COLORS = [['negro', '⚫ Negro'], ['blanco', '⚪ Blanco'], ['azul', '🔵 Azul'], ['rojo', '🔴 Rojo'], ['verde', '🟢 Verde'], ['otro', '🌈 Otro']];
const REL = [['familiar', '👨‍👩‍👧 De toda la vida'], ['colegio', '🎓 Colegio / universidad'], ['juerga', '🍻 Amigo de juerga'], ['victima', '😅 Víctima involuntaria']];
const INN = [['inocente', '😇 100% Inocente'], ['sospechoso', '🕵️ Sospechoso'], ['autor', '😈 Autor intelectual']];

export function TestFlow({ s, link }) {
  const qs = s.test || [];
  const [i, setI] = useState(0);
  const [ans, setAns] = useState({});
  const [sv, setSv] = useState({ color: 'negro', glasses: false, relationship: 'juerga', innocence: 'inocente' });
  const [flash, setFlash] = useState(null);
  const me = s.me;
  const pick = (id, v) => {
    vibrate(20); setFlash(v);
    setTimeout(() => { setAns((a) => ({ ...a, [id]: v })); setI((n) => n + 1); setFlash(null); }, 220);
  };
  if (!qs.length) return html`<div class="boot"><div class="spinner"></div></div>`;
  const done = i >= qs.length;
  return html`
    <div class="app test-app">
      <div class="test-top"><span class="animal-big">${me.animal && me.animal.emoji}</span><div><b>${me.animal && me.animal.name} · ${me.alias || me.name}</b><small class="mut">Tu emoji-animal en esta fiesta</small></div></div>
      ${!done && html`
        <div class="test-prog">${qs.map((_, k) => html`<i class=${cx(k < i && 'done', k === i && 'cur')}></i>`)}</div>
        <div class="test-q">
          <small>${i + 1} / ${qs.length}</small>
          <h2>${qs[i].q}</h2>
          <div class="duo">
            ${['a', 'b'].map((k) => html`<button class=${cx('duo-btn', flash === k && 'pick')} onClick=${() => pick(qs[i].id, k)}><span>${qs[i][k].emoji}</span><b>${qs[i][k].label}</b></button>`)}
          </div>
          ${i > 0 && html`<button class="btn ghost sm" onClick=${() => setI(i - 1)}>← Volver</button>`}
        </div>`}
      ${done && html`
        <div class="stack test-extra">
          <div class="card">
            <h3>Últimas 4 rapiditas <small class="mut">(para los juegos de la noche)</small></h3>
            <p class="q">¿Qué color de prenda llevas?</p>
            <${Choice} value=${sv.color} onChange=${(v) => setSv({ ...sv, color: v })} options=${COLORS} cols=${3} />
            <p class="q">¿Llevas lentes ahora mismo?</p>
            <${Choice} value=${sv.glasses} onChange=${(v) => setSv({ ...sv, glasses: v })} options=${[[true, '👓 Sí'], [false, '🙂 No']]} />
            <p class="q">Tu relación con ${s.meta.birthdayName}</p>
            <${Choice} value=${sv.relationship} onChange=${(v) => setSv({ ...sv, relationship: v })} options=${REL} />
            <p class="q">Si hubiera un crimen hoy, ¿qué tan inocente eres?</p>
            <${Choice} value=${sv.innocence} onChange=${(v) => setSv({ ...sv, innocence: v })} options=${INN} cols=${1} />
          </div>
          <button class="btn lime block xl" onClick=${() => link.send('SUBMIT_TEST', { answers: ans, survey: sv })}>✅ ¡Listo, buscar mi pareja!</button>
        </div>`}
    </div>`;
}

/* ───────── 3. Pool y pareja ───────── */
function PoolView({ s, g, link }) {
  useTick(1000);
  return html`
    <div class="card center-col pool">
      <div class="radar"><span class="animal-big">${s.me.animal.emoji}</span></div>
      <h2>Buscando a tu pareja ideal…</h2>
      ${g.alone ? html`<div class="card ice"><b>👋 Eres de los primeros</b><p>Para hacer pareja hace falta que entre <b>otra persona más</b>. Pídele a alguien que escanee el QR o dile al anfitrión que te empareje.</p>${g.canDemo && html`<button class="btn amber block" onClick=${() => link.send('SOLO_DEMO', {})}>🤖 ¿Probando solo? Emparéjame con un jugador de prueba</button>`}</div>` : html`<p class="mut">Estamos cruzando tus gustos con los de los demás. En cuanto haya alguien compatible te avisamos (vibra el celular). ¡No cierres esta pantalla!</p>`}
      <div class="chip">${g.counts.waiting} esperando · ${g.counts.pairs} parejas formadas</div>
      <div class="card pass"><small>PASE DE ENTRADA</small><b>✅ ${s.me.name}</b><span>${s.me.animal.emoji} ${s.me.animal.name}</span></div>
    </div>`;
}

function Scanner({ onCode, onClose }) {
  const ref = useRef();
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream, stop = false, timer;
    (async () => {
      if (!('BarcodeDetector' in window)) { setErr('Tu navegador no puede escanear aquí: usa el código de 3 dígitos.'); return; }
      try {
        const det = new BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        ref.current.srcObject = stream; await ref.current.play();
        const loop = async () => {
          if (stop) return;
          try { const r = await det.detect(ref.current); if (r[0]) { const m = r[0].rawValue.match(/meet=(\d{3})/); if (m) { onCode(m[1]); return; } } } catch { /* frame */ }
          timer = setTimeout(loop, 300);
        };
        loop();
      } catch { setErr('No se pudo abrir la cámara (¿HTTPS?). Usa el código de 3 dígitos.'); }
    })();
    return () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);
  return html`<div class="scanner"><video ref=${ref} playsinline muted></video><div class="scan-frame"></div><div class="scan-msg">${err || 'Apunta al QR de tu pareja'}</div><button class="btn ghost" onClick=${onClose}>Cerrar</button></div>`;
}

function PairView({ s, g, link }) {
  const [code, setCode] = useState('');
  const [scan, setScan] = useState(false);
  const [calling, setCalling] = useState(false);
  const url = `${location.origin}/?meet=${g.meet}`;
  useEvent('PAIR_CALL', () => { setCalling(true); setTimeout(() => setCalling(false), 4000); });
  useEffect(() => { const m = new URLSearchParams(location.search).get('meet'); if (m && !g.found) { link.send('PAIR_SCAN', { code: m }); history.replaceState(null, '', location.pathname); } }, []);
  const found = g.found;
  const others = g.others;
  return html`
    <div class=${cx('stack', calling && 'blink-all')}>
      <div class="card pair-card center-col">
        <small class="mut">${g.trio ? '¡Tu trío!' : '¡Tu pareja es…!'}</small>
        <div class="pair-faces">${others.map((o) => html`<div><span class="animal-big">${o.animal.emoji}</span><b>${o.name}</b>${o.demo ? html`<small class="chip">🤖 de prueba · código <b>${o.code}</b></small>` : ''}</div>`)}</div>
        <p class="sm">Búscalo/a por la terraza: busca el emoji ${others.map((o) => o.animal.emoji).join(' ')}</p>
        <button class="btn amber block" onClick=${() => { vibrate(40); link.send('PAIR_CALL', {}); }}>📣 Llamar a mi pareja</button>
      </div>
      ${g.icebreaker && html`<div class="card ice"><b>🧊 Rompehielos</b><p>${g.icebreaker.text}</p></div>`}

      ${!found && html`
        <div class="card center-col">
          <b>1 · Confirmen que se encontraron</b>
          <p class="mut sm">Escaneen el QR del otro (o escriban su código de 3 dígitos).</p>
          <div class="qr-mini" dangerouslySetInnerHTML=${{ __html: qrSvg(url) }}></div>
          <div class="meet-code">Mi código: <b>${g.meet}</b></div>
          <div class="row gap"><input class="input word" inputmode="numeric" maxlength="3" placeholder="000" value=${code} onInput=${(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button class="btn lime" disabled=${code.length !== 3} onClick=${() => { link.send('PAIR_SCAN', { code }); setCode(''); }}>OK</button></div>
          <button class="btn cyan block" onClick=${() => setScan(true)}>📷 Escanear su QR</button>
        </div>`}
      ${found && html`
        <div class="card center-col ok-card2">
          <b>✅ ¡Se encontraron!</b>
          <p class="mut sm">2 · Preséntense (nombre, de dónde se conocen con ${s.meta.birthdayName}…) y cuando terminen, toquen:</p>
          <button class="btn pink block xl" disabled=${g.myIntro} onClick=${() => link.send('PAIR_INTRO', {})}>${g.myIntro ? `Esperando a tu pareja (${g.introDone}/${g.introNeeded})` : '🤝 Ya nos presentamos'}</button>
        </div>`}
      ${scan && html`<${Scanner} onCode=${(c) => { setScan(false); link.send('PAIR_SCAN', { code: c }); }} onClose=${() => setScan(false)} />`}
    </div>`;
}

/* ───────── 4. Equipo + selfie ───────── */
async function compress(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  let w = Math.min(960, img.width), h = Math.round(img.height * (w / img.width));
  const c = document.createElement('canvas');
  for (let q = 0.75; q > 0.2; q -= 0.1) {
    c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    if (blob.size < 290 * 1024) return blob;
    w = Math.round(w * 0.85); h = Math.round(h * 0.85);
  }
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.2));
}

function TeamView({ s, g, link }) {
  const t = g.team;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const blob = await compress(f);
      const r = await fetch(`/api/upload/selfie?t=${tokenOf()}`, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
      const j = await r.json();
      setMsg(j.ok ? { ok: j.first ? '📸 ¡Selfie subida! +10 puntos para tu equipo' : '📸 Selfie reemplazada' } : { bad: j.error });
      if (j.ok) confetti({ count: 80 });
    } catch { setMsg({ bad: 'No se pudo subir la foto' }); }
    setBusy(false); e.target.value = '';
  };
  return html`
    <div class="stack">
      <div class="card welcome center-col" style=${{ '--c': t.color }}>
        <div class="wait-ico">${t.emoji}</div>
        <small class="mut">TU EQUIPO</small>
        <h2 style=${{ color: t.color }}>${t.name}</h2>
        <div class="chip">${t.size} integrantes${t.mult > 1 ? html` · multiplicador <b>×${t.mult}</b>` : ''}</div>
        ${!t.renamed && html`<div class="row gap"><input class="input sm" placeholder="Cambiar el nombre (una vez)" maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} /><button class="btn sm lime" disabled=${name.trim().length < 2} onClick=${() => { link.send('TEAM_RENAME', { name }); setName(''); }}>OK</button></div>`}
      </div>
      <div class="card"><b>👥 Búsquenlos: son tu equipo</b>
        <div class="roster">${t.members.map((m) => html`<div class=${cx('mem', m.id === s.me.id && 'me')}><span>${m.animal && m.animal.emoji}</span><div><b>${m.name}</b><small>Le gusta: ${m.fav}</small></div></div>`)}</div>
      </div>
      <div class="card center-col">
        <b>🤳 Selfie de equipo (+10 pts la primera vez)</b>
        ${t.selfie && html`<img class="selfie" src=${t.selfie} alt="Selfie del equipo" />`}
        ${t.canSelfie
          ? html`<label class="btn cyan block"><input type="file" accept="image/*" capture="user" hidden onChange=${onFile} />${busy ? 'Subiendo…' : t.selfie ? '📷 Reemplazar la selfie' : '📷 Tomar la selfie del equipo'}</label>`
          : html`<p class="mut sm">Cuando haya al menos ${t.selfieMin} integrantes en el equipo podrán tomarla.</p>`}
        ${msg && html`<div class=${msg.ok ? 'ok-card' : 'bad-card'}>${msg.ok || msg.bad}</div>`}
      </div>
      <div class="card center-col mut sm">⏳ Cuando el anfitrión cierre la Entrada empiezan los juegos. ¡Quédense juntos!</div>
    </div>`;
}

export function EntradaView({ s, g, link }) {
  if (g.stage === 'pool') return html`<${PoolView} s=${s} g=${g} link=${link} />`;
  if (g.stage === 'paired') return html`<${PairView} s=${s} g=${g} link=${link} />`;
  if (g.stage === 'team' && g.team) return html`<${TeamView} s=${s} g=${g} link=${link} />`;
  return html`<div class="boot"><div class="spinner"></div></div>`;
}

/* ───────── Ritual de bienvenida (llegadas tardías) — aparece en cualquier fase ───────── */
export function RitualCards({ s, link }) {
  const ex = s.extra;
  const [words, setWords] = useState({});
  if (!ex || (!ex.ritual && !(ex.confirms && ex.confirms.length))) return null;
  return html`
    <div class="ritual">
      ${ex.ritual && html`
        <div class="card ritual-card">
          <b>🧳 Ritual de bienvenida (+15 pts para tu equipo)</b>
          <p class="mut sm">Pregúntale a cada integrante en persona cuál es su cosa favorita y escríbela. Ellos te dirán si acertaste.</p>
          ${ex.ritual.items.map((it) => html`
            <div class="rit-row"><span>${it.animal ? it.animal.emoji : '🙂'} <b>${it.name}</b></span>
              ${it.ok === true ? html`<span class="chip ok">✔ ${it.word}</span>` : it.word && it.ok === null ? html`<span class="chip">⏳ ${it.word}</span>`
                : html`<div class="row gap-s"><input class="input sm" placeholder=${it.ok === false ? 'Intenta de nuevo' : 'su cosa favorita'} value=${words[it.memberId] || ''} onInput=${(e) => setWords({ ...words, [it.memberId]: e.target.value })} /><button class="btn sm lime" disabled=${!(words[it.memberId] || '').trim()} onClick=${() => { link.send('WELCOME_WORD', { memberId: it.memberId, word: words[it.memberId] }); }}>✔</button></div>`}
            </div>`)}
        </div>`}
      ${(ex.confirms || []).map((c) => html`
        <div class="card ritual-card">
          <b>${c.animal ? c.animal.emoji : '🙂'} ${c.newcomer} dice que tu cosa favorita es…</b>
          <div class="big-word">${c.word}</div>
          <div class="row gap"><button class="btn lime grow" onClick=${() => link.send('WELCOME_CONFIRM', { newcomerId: c.newcomerId, ok: true })}>✅ Sí</button><button class="btn red grow" onClick=${() => link.send('WELCOME_CONFIRM', { newcomerId: c.newcomerId, ok: false })}>❌ No</button></div>
        </div>`)}
    </div>`;
}
