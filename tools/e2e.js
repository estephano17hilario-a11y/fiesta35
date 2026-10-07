'use strict';
/**
 * Prueba de punta a punta (≈4 min): un "anfitrión" automático recorre TODAS las fases con 35 bots jugando
 * (más 2 llegadas tardías, 3 jurados, una cámara y un invitado que se reconecta).
 *
 *   1) arranca el servidor (npm start)      2) npm run e2e      (¡borra los datos del evento! úsalo solo en ensayos)
 */
const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const HOST = process.argv[2] || 'localhost:3000';
const KEY = process.env.ADMIN_SECRET_KEY || 'CumpleGianella35MasterKey';
const PIN = process.env.JURY_PIN || '2468';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let S = null;
const results = [];
const check = (name, ok, extra = '') => { results.push([name, ok]); console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`); };
const procs = [];

const ws = new WebSocket(`ws://${HOST}/ws?role=admin`);
const send = (w, event, payload = {}) => w.send(JSON.stringify({ event, payload }));
const cmd = (c, args = {}) => send(ws, 'ADMIN_CMD', { cmd: c, args });
async function until(fn, timeout = 60000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (fn(S)) return true; } catch { /* aún no */ } await sleep(200); }
  console.log('   ⏱️ timeout esperando', label);
  return false;
}
function client(role, query = '') {
  const w = new WebSocket(`ws://${HOST}/ws?role=${role}${query}`);
  const c = { w, state: null, events: [] };
  w.on('message', (raw) => { const m = JSON.parse(raw); if (m.event === 'SYNC_STATE') c.state = m.payload; else c.events.push(m); });
  return new Promise((res) => w.on('open', () => res(c)));
}

ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.event === 'SYNC_STATE') S = m.payload;
  if (m.event === 'ADMIN_DENIED') { console.log('Clave incorrecta'); process.exit(1); }
});

async function http(method, p, body, headers = {}) {
  const r = await fetch(`http://${HOST}${p}`, { method, body, headers });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

ws.on('open', async () => {
  send(ws, 'ADMIN_LOGIN', { key: KEY });
  await until((s) => s && !s.locked, 5000, 'login');
  cmd('RESET_ALL', { confirm: 'BORRAR' });
  await sleep(600);
  const token = (await new Promise((res) => { const a = new WebSocket(`ws://${HOST}/ws?role=admin`); a.on('open', () => send(a, 'ADMIN_LOGIN', { key: KEY })); a.on('message', (r) => { const m = JSON.parse(r); if (m.event === 'ADMIN_OK') { res(m.payload.token); a.close(); } }); }));

  // contenido más rápido para la prueba
  const cfgRes = await (await fetch(`http://${HOST}/api/config`, { headers: { 'x-admin-token': token } })).json();
  const fast = { ...cfgRes, bomba: { ...cfgRes.bomba, introSeconds: 1, voteSeconds: 3, charada: { seconds: 5 }, objeto: { objects: 3, secondsPerObject: 2 }, paparazzi: { seconds: 5, shots: 3 }, karaoke: { seconds: 5, maxEmojis: 5, tailSeconds: 1 } }, entrada: { ...cfgRes.entrada, waitSeconds: 8 }, caja: { ...cfgRes.caja, cooldownSeconds: 2 } };
  const put = await http('PUT', '/api/config', JSON.stringify(fast), { 'x-admin-token': token, 'content-type': 'application/json' });
  check('Config editable desde la API', put.status === 200);

  // ───────── ENTRADA ─────────
  const bots = spawn('node', [path.join(__dirname, 'bots.js'), '--host', HOST, '--n', '35', '--skill', '0.9', '--arrive', '120'], { stdio: 'ignore' });
  procs.push(bots);
  await until((s) => s.counts.registered >= 35, 30000, 'registro');
  check('35 invitados registrados', S.counts.registered === 35, String(S.counts.registered));
  await until((s) => s.entrada.counts.inTeam >= 30, 70000, 'equipos formados');
  check('Parejas por afinidad confirmadas y equipos formados', S.entrada.counts.inTeam >= 30, `${S.entrada.counts.inTeam}/35 en equipo, ${S.entrada.counts.pairs} parejas`);
  cmd('ENTRADA_CLOSE');
  await until((s) => s.entrada.closed && s.entrada.counts.inTeam === 35, 10000, 'cerrar equipos');
  const sizes = S.tables.map((t) => t.members);
  check('Equipos cerrados y balanceados (5–6)', S.entrada.counts.inTeam === 35 && sizes.every((n) => n >= 5 && n <= 6), sizes.join(','));
  check('Equipos autonombrados y únicos', new Set(S.tables.map((t) => t.name)).size === 6, S.tables[0].name);
  await until((s) => s.tables.filter((t) => t.selfie).length >= 6, 10000, 'selfies');
  check('Selfies de equipo subidas (+10)', S.tables.filter((t) => t.selfie).length === 6 && S.ledger.some((l) => l.source === 'entrada' && l.reason.includes('Selfie')));
  check('Parejas confirmadas suman puntos al equipo', S.ledger.some((l) => l.source === 'entrada' && l.reason.includes('Pareja')));

  // llegadas tardías → directo a equipo + ritual de bienvenida
  const late = spawn('node', [path.join(__dirname, 'bots.js'), '--host', HOST, '--n', '2', '--offset', '35', '--arrive', '300'], { stdio: 'ignore' });
  procs.push(late);
  await until((s) => s.counts.registered >= 37 && s.entrada.counts.inTeam === 37, 20000, 'tardíos');
  check('Llegadas tardías van directo a un equipo (sin pareja)', S.entrada.counts.inTeam === 37);
  await until((s) => s.ledger.some((l) => l.reason.includes('Bienvenida')), 25000, 'ritual de bienvenida');
  check('Ritual de bienvenida completado (+15)', S.ledger.some((l) => l.reason.includes('Bienvenida')));

  // reconexión: un invitado propio se registra, cierra el socket y vuelve con su token
  const rg = await client('guest');
  send(rg.w, 'REGISTER', { name: 'Reconexión Prueba', fav: 'ajedrez', consent: true });
  await sleep(500);
  const tk = rg.events.find((e) => e.event === 'REGISTERED').payload.token;
  rg.w.close();
  await sleep(300);
  const rg2 = await client('guest', '&token=' + tk);
  await sleep(500);
  check('Reconexión: recupera su sesión y estado', rg2.state && rg2.state.me && rg2.state.me.name === 'Reconexión Prueba' && rg2.state.me.stage === 'test');
  rg2.w.close();
  cmd('GUEST_MOD', { id: rg2.state.me.id, op: 'remove' });

  // ───────── CAJA FUERTE ─────────
  cmd('SET_PHASE', { phase: 'CAJA_FUERTE' });
  await until((s) => s.caja.openCount >= 6, 100000, 'caja');
  check('Caja fuerte: los 6 equipos descifraron y registraron su apertura', S.caja.openCount === 6, String(S.caja.openCount));
  const cajaLedger = S.ledger.filter((l) => l.source === 'caja');
  check('Caja: puntos por orden + multiplicador en el ledger', cajaLedger.length >= 6 && cajaLedger.some((l) => /bono/.test(l.reason)), cajaLedger.slice(0, 2).map((l) => l.reason).join(' | '));
  const emojisConsumed = S.caja.emojis.filter((e) => e.emoji).length;
  check('Emojis consumidos al abrir (uno por equipo)', emojisConsumed === 6, String(emojisConsumed));

  // ───────── BOMBA ─────────
  cmd('SET_PHASE', { phase: 'DESACTIVA_BOMBA' });
  await sleep(500);
  const jurors = [];
  for (let j = 1; j <= 3; j++) { const c = await client('jury'); send(c.w, 'JURY_LOGIN', { pin: PIN, juror: j }); jurors.push(c); }
  const cam = await client('camera');
  send(cam.w, 'CAMERA_LOGIN', { key: KEY });
  await sleep(400);
  send(cam.w, 'CAMERA_READY');
  check('Cola de la bomba creada por orden de apertura', S.bomba.queue.length === 6);
  const jv = setInterval(() => { for (const [i, c] of jurors.entries()) if (c.state && c.state.jury && c.state.jury.canVote && !c.state.jury.myVote) send(c.w, 'JURY_VOTE', { stars: 3 + (i % 3) }); }, 300);

  const stageTeams = S.bomba.queue.slice(0, 2).map((q) => q.n);
  let gamesDone = 0, clipUp = false;
  for (const n of stageTeams) {
    cmd('BOMBA_CALL', { team: n });
    for (let gi = 0; gi < 4; gi++) {
      await until((s) => s.bomba.current && s.bomba.current.team === n && s.bomba.current.gameIdx === gi && ['ready', 'intro'].includes(s.bomba.current.status), 15000, `intro ${gi}`);
      await until((s) => s.bomba.current.status === 'ready', 8000, 'ready');
      if (gi === 0) { const roles = S.bomba.current.roles; check(`Roles del equipo ${n}: 1 ciego, ${roles.deaf.length} sordos, ${roles.mute.length} mudos`, roles.blind && roles.deaf.length >= 1 && roles.mute.length >= 1); }
      cmd('BOMBA_START');
      const key = S.bomba.current.key || ['charada', 'objeto', 'paparazzi', 'karaoke'][gi];
      if (key === 'objeto') for (let o = 0; o < 3; o++) { await until((s) => s.bomba.current.game.step === 'cup' && s.bomba.current.game.idx === o, 8000, 'cup'); cmd('BOMBA_CUP', { cup: 1 + (o % 4) }); await sleep(300); }
      if (key === 'karaoke') {
        await until((s) => s.bomba.current.status === 'mark' || s.bomba.current.status === 'play', 4000, 'karaoke');
        await sleep(2500);
        const rec = cam.events.find((e) => e.event === 'REC_START');
        if (rec && !clipUp) { clipUp = true; const r = await http('POST', `/api/upload/clip?t=${token}&id=${rec.payload.clipId}`, Buffer.from('fake-webm-bytes'), { 'content-type': 'video/webm' }); check('Cámara: clip del Karaoke subido', r.status === 200); }
        cmd('BOMBA_MARK', { ok: n === stageTeams[0] });
      }
      await until((s) => s.bomba.current.status === 'revealed', 30000, `revelado ${key}`);
      gamesDone += S.bomba.current.status === 'revealed' ? 1 : 0;
      if (gi < 3) cmd('BOMBA_NEXT'); else cmd('BOMBA_NEXT');
      await sleep(300);
    }
    await until((s) => s.bomba.current.status === 'finished', 5000, 'finished');
  }
  clearInterval(jv);
  check('Bomba: 2 equipos × 4 juegos puntuados (jurado + público)', gamesDone === 8 && S.bomba.totals[stageTeams[0]] && S.bomba.totals[stageTeams[1]], `${gamesDone}/8`);
  const bl = S.ledger.filter((l) => l.source === 'bomba');
  check('Ledger de la bomba (con multiplicador)', bl.length >= 8, `${bl.length} asientos`);
  const r0 = S.bomba.totals[stageTeams[0]].games[0];
  check('Resultado: jurado + público calculados', r0.jury > 0 && r0.pub >= 0 && r0.total > 0, JSON.stringify({ jury: r0.jury, pub: r0.pub, total: r0.total }));
  const undoId = S.ledger.find((l) => l.source === 'bomba' && !l.undone).id, bal0 = S.aura;
  const teamU = S.ledger.find((l) => l.id === undoId).team, before = S.tables.find((t) => t.n === teamU).aura, delta = S.ledger.find((l) => l.id === undoId).delta;
  cmd('LEDGER_UNDO', { id: undoId });
  await sleep(500);
  check('Ledger: deshacer revierte el asiento (append-only)', S.tables.find((t) => t.n === teamU).aura === Math.max(0, before - delta) && S.ledger.some((l) => l.source === 'deshacer'));
  cmd('FORCE_SUCCESS');
  jurors.forEach((c) => c.w.close()); cam.w.close();

  // ───────── CIERRE ─────────
  cmd('SET_PHASE', { phase: 'CIERRE_JUEGOS' });
  await sleep(400);
  cmd('MOVIE_BUILD');
  await sleep(400);
  check('Cierre: película armada con el clip y premios', S.game.total >= 3, `${S.game.total} escenas`);
  cmd('MOVIE_PLAY');
  await sleep(500);
  check('Cierre: reproduciendo', S.game.playing === true);

  // ───────── HORA LOCA ─────────
  cmd('SET_PHASE', { phase: 'HORA_LOCA' }); cmd('DISCO', { on: true, bpm: 128 });
  await sleep(500);
  check('Hora Loca / disco activo', S.disco.on === true);
  cmd('DISCO', { on: false });

  // ───────── JUEGOS DE LA NOCHE (crimen → ceremonia) ─────────
  cmd('SET_PHASE', { phase: 'GIANELLA_CRIMEN' }); cmd('CRIMEN_NOTE'); cmd('CRIMEN_OPEN');
  await until((s) => Object.values(s.game.verdicts).every((v) => v.done), 25000, 'veredictos');
  cmd('CRIMEN_REVEAL'); await sleep(500);
  check('Crimen: veredictos revelados', S.game.revealed && Object.values(S.game.verdicts).filter((v) => v.correct).length >= 3);

  cmd('SET_PHASE', { phase: 'DESCARGA_MADRE_KEIKO' }); await sleep(500); cmd('KEIKO_START');
  await until((s) => s.game.status === 'success' || s.game.status === 'fail', 30000, 'keiko');
  check('Keiko: descarga exitosa (estrella 1)', S.game.status === 'success' && S.stars.keiko, `pct=${S.game.pct}`);

  cmd('SET_PHASE', { phase: 'KAHOOT' }); await sleep(300);
  for (let i = 0; i < 3; i++) { cmd('KAHOOT_NEXT'); await until((s) => s.game.status === 'reveal', 30000, 'kahoot q' + i); await sleep(300); }
  const k = S.game.top;
  check('Kahoot: ranking con puntajes', k.length === 5 && k[0].score > 0 && k[0].score >= k[1].score, `${k[0].name}=${k[0].score}`);

  cmd('SET_PHASE', { phase: 'FARMEO_AURA' }); await sleep(300);
  cmd('AURA_TRIVIA_NEW'); await until((s) => Object.keys(s.game.bets).length >= 6, 15000, 'apuestas');
  cmd('AURA_SHOW_QUESTION'); await until((s) => s.game.status === 'settled', 40000, 'trivia');
  check('Aura: trivia liquidada', S.game.status === 'settled' && S.game.result.rows.length >= 5);
  cmd('AURA_ROULETTE_NEW'); await until((s) => Object.keys(s.game.bets).length >= 6, 15000, 'apuestas ruleta');
  cmd('AURA_SPIN'); await until((s) => s.game.status === 'settled', 15000, 'ruleta');
  check('Aura: ruleta liquidada y saldos ≥ 0', S.game.status === 'settled' && S.tables.every((t) => t.aura >= 0));

  cmd('SET_PHASE', { phase: 'ESTATUA' }); await sleep(300);
  for (let r = 0; r < 3; r++) { cmd('ESTATUA_START'); await sleep(800); await until((s) => ['success', 'done', 'fail'].includes(s.game.status), 40000, 'estatua r' + r); if (S.game.status === 'fail') { r--; await sleep(300); } }
  check('Estatua: 3 rondas (estrella 2)', S.stars.estatua === true);

  cmd('SET_PHASE', { phase: 'PIXEL_ART' }); await sleep(500); cmd('PIXEL_TURNS');
  await until((s) => s.game.revealed, 40000, 'pixel');
  check('Pixel Art: mural revelado (estrella 3)', S.game.revealed && S.stars.pixel, `${S.game.painted}/${S.game.total}`);

  cmd('SET_PHASE', { phase: 'FOTO_LOCA' }); await sleep(300); cmd('FOTO_START'); await sleep(500);
  check('Foto: misiones asignadas', S.game.assigned >= 36, String(S.game.assigned));
  cmd('FOTO_SKIP'); await until((s) => s.game.status === 'done', 40000, 'foto');
  check('Foto: 4/4 estrellas', S.starCount === 4, String(S.starCount));

  cmd('SET_PHASE', { phase: 'CEREMONIA' });
  for (let i = 0; i < 4; i++) { cmd('CEREMONY_STEP', { delta: 1 }); await sleep(300); }
  await sleep(600);
  check('Ceremonia: podio completo', !!(S.game.podium[1] && S.game.podium[2] && S.game.podium[3]));

  const exp = await fetch(`http://${HOST}/api/export?t=${token}&what=json`);
  check('Respaldo JSON exportable (sin tokens)', exp.status === 200 && !(await exp.text()).includes('"token"'));

  const fails = results.filter((r) => !r[1]).length;
  console.log(`\n${fails ? '❌' : '✅'} ${results.length - fails}/${results.length} comprobaciones OK`);
  procs.forEach((p) => p.kill());
  process.exit(fails ? 1 : 0);
});
