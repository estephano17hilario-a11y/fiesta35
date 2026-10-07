'use strict';
/**
 * 🤖 Simulador de invitados — para ENSAYAR la fiesta sin 35 celulares.
 *
 *   npm run bots                      -> 35 bots contra http://localhost:3000 (llegan escalonados)
 *   node tools/bots.js --n 20 --host 192.168.1.50:3000 --skill 0.8 --arrive 600
 *
 * Los bots se registran, hacen el test, se encuentran con su pareja, forman equipos y juegan cada fase
 * (caja, bomba como público/escena, crimen, keiko, kahoot, aura, estatua, pixel…). Sirven para probar
 * la pantalla central, el panel Admin y el jurado con datos vivos.
 */
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : true]] : acc), []));
const N = Number(args.n || 35);
const HOST = args.host || 'localhost:3000';
const SKILL = Number(args.skill ?? 0.8);
const ARRIVE = Number(args.arrive ?? 150); // ms entre llegadas
const OFFSET = Number(args.offset ?? 0);   // para lanzar un segundo grupo (llegadas tardías) con otros nombres
const SECURE = HOST.startsWith('https') || args.secure;
const BASE = HOST.replace(/^https?:\/\//, '');
const HTTP = `${SECURE ? 'https' : 'http'}://${BASE}`;

const NAMES = ['Valeria Torres', 'Diego Salazar', 'Camila Reyes', 'Mateo Vargas', 'Sofía Paredes', 'Andrés Cáceres', 'Lucía Montoya', 'Joaquín Ríos', 'Daniela Castro', 'Sebastián Luna',
  'Fernanda Rojas', 'Nicolás Herrera', 'Valentina Cruz', 'Gabriel Soto', 'Mariana Ponce', 'Emilio Navarro', 'Renata Campos', 'Tomás Aguirre', 'Isabela Mena', 'Bruno Delgado',
  'Paula Ibáñez', 'Rodrigo Pinto', 'Carla Benítez', 'Hugo Zavala', 'Antonella Gil', 'Julián Peña', 'Ximena Lara', 'Óscar Medina', 'Brenda Cortez', 'Iván Robles',
  'Alejandra Neira', 'Martín Fuentes', 'Jimena Quispe', 'Ricardo Alva', 'Karina Bravo', 'Leo Marín', 'Sara Duarte', 'Pablo Ortiz', 'Elena Cano', 'Víctor Rey'];
const FAVS = ['pizza', 'lasaña', 'ceviche', 'matrix', 'fútbol', 'guitarra', 'chocolate', 'viajar', 'dormir', 'pasta', 'helado', 'karaoke', 'montaña', 'ajedrez', 'sushi', 'cerveza'];
const COLORS = ['negro', 'blanco', 'azul', 'rojo', 'verde', 'otro'];
const REL = ['familiar', 'colegio', 'juerga', 'victima'];
const INN = ['inocente', 'sospechoso', 'autor'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const favOf = (name) => FAVS[hash(name) % FAVS.length];
const aliasToName = (alias) => NAMES.find((n, i) => n.split(' ')[0] + (i >= NAMES.length ? i : '') === alias) || alias;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]/g, '');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8')); } catch { return {}; } };
const cfg = read('config.json');
const riddles = (read('content/acertijos.json').riddles) || [];

const shared = { byId: {}, byAlias: {} };

class Bot {
  constructor(i) {
    this.i = i;
    this.name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + Math.floor(i / NAMES.length + 1) : '');
    this.alias = this.name.split(' ')[0] + (i >= NAMES.length ? i : '');
    this.fav = favOf(this.name); // determinista: cualquier bot puede 'preguntarle' su cosa favorita a otro por su nombre
    this.token = null; this.s = null; this.acted = {}; this.id = null;
  }
  connect() {
    const url = `${SECURE ? 'wss' : 'ws'}://${BASE}/ws?role=guest${this.token ? '&token=' + this.token : ''}`;
    this.ws = new WebSocket(url, { rejectUnauthorized: false });
    this.ws.on('open', () => {
      if (!this.token) this.send('REGISTER', { name: this.name, alias: this.alias, fav: this.fav, consent: true });
      this.hb = setInterval(() => this.send('HEARTBEAT', { t0: Date.now(), battery: 30 + Math.random() * 70, sensor: 'ok', visible: true, rtt: 20 + Math.random() * 60 }), 5000);
    });
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.event === 'REGISTERED') { this.token = m.payload.token; this.id = m.payload.id; shared.byId[this.id] = this; }
      if (m.event === 'SYNC_STATE') { this.s = m.payload; this.think(); }
      if (m.event === 'SABOTAGE_HORN') this.horned = true;
    });
    this.ws.on('close', () => { clearInterval(this.hb); setTimeout(() => this.connect(), 1500 + Math.random() * 1500); });
    this.ws.on('error', () => {});
  }
  send(event, payload = {}) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ event, payload, timestamp: Date.now() })); }
  once(key, fn, delay = 400 + Math.random() * 1800) { if (this.acted[key]) return; this.acted[key] = true; setTimeout(fn, delay); }
  async post(kind, buf) { try { await fetch(`${HTTP}/api/upload/${kind}?t=${this.token}`, { method: 'POST', body: buf, headers: { 'content-type': 'image/jpeg' } }); } catch { /* ignorar */ } }

  think() {
    const s = this.s, g = s.game, me = s.me, ex = s.extra;
    if (!me) return;
    this.meet = g && g.meet || this.meet;
    this.alias = me.alias || this.alias;
    const good = Math.random() < SKILL;

    // ── Entrada ──
    if (me.stage === 'test' && s.test && s.test.length)
      return this.once('test', () => this.send('SUBMIT_TEST', { answers: Object.fromEntries(s.test.map((q) => [q.id, Math.random() < 0.5 ? 'a' : 'b'])), survey: { color: pick(COLORS), glasses: Math.random() < 0.3, relationship: pick(REL), innocence: pick(INN) } }), 200 + Math.random() * 800);
    if (me.stage === 'paired' && g && g.pairId) {
      const other = shared.byId[g.others[0].id];
      if (!g.found && other && other.meet) this.once('scan' + g.pairId, () => this.send('PAIR_SCAN', { code: other.meet }), 800 + Math.random() * 2500);
      if (g.found && !g.myIntro) this.once('intro' + g.pairId, () => this.send('PAIR_INTRO', {}), 600 + Math.random() * 1500);
    }
    if (me.stage === 'team' && g && g.team && g.team.canSelfie && !g.team.selfie && g.team.members[0].id === me.id) this.once('selfie', () => this.post('selfie', JPEG), 1500);

    // ritual de bienvenida (llegadas tardías)
    if (ex && ex.ritual) for (const it of ex.ritual.items) if (!it.word && it.ok !== true) this.once('w' + it.memberId + (it.ok === false ? 'r' : ''), () => { this.send('WELCOME_WORD', { memberId: it.memberId, word: favOf(aliasToName(it.name)) }); }, 500 + Math.random() * 1500);
    if (ex && ex.confirms) for (const cf of ex.confirms) this.once('c' + cf.newcomerId + cf.word, () => this.send('WELCOME_CONFIRM', { newcomerId: cf.newcomerId, ok: flat(cf.word) === flat(this.fav) }), 400 + Math.random() * 1200);

    if (me.stage !== 'team' || !g) return;
    const ph = s.phase.id;

    // ── Caja fuerte ──
    if (ph === 'CAJA_FUERTE' && g.mine) {
      if (!g.mine.solved && Date.now() > (g.mine.cooldownUntil || 0)) {
        const m = g.pieces.p1.match(/favorita de (.+?)\? /);
        const p1 = m ? flat(favOf(aliasToName(m[1]))).length : 5;
        const consumed = g.emojis.filter((e) => e.emoji).map((e) => e.emoji);
        const real = (cfg.caja.realEmojis || []).filter((e) => !consumed.includes(e));
        const r = riddles.find((x) => x.text === g.pieces.p3);
        this.once('cj' + g.mine.fails + g.openCount, () => this.send('CAJA_ATTEMPT', { p1: good ? p1 : 9, p2: good ? pick(real) : '🍕', p3: good && r ? r.answers[0] : 'hormiga', p4: cfg.caja.stickerDigit }), 2000 + Math.random() * 6000);
      }
      if (g.mine.solved && !g.mine.opened && g.lockCode) this.once('cf', () => this.send('CAJA_CONFIRM', { code: ((cfg.caja.boxes || {})[me.table] || {}).confirmCode }), 2500 + Math.random() * 3000);
    }

    // ── Bomba: público vota, equipo en escena colabora ──
    if (ph === 'DESACTIVA_BOMBA' && g.scene) {
      const sc = g.scene;
      if (g.audience && g.vote && g.vote.open && g.vote.mine == null) this.once(`bv${sc.team}${sc.gameIdx}${g.vote.photoIdx}`, () => this.send('BOMBA_VOTE', { value: sc.key === 'charada' ? (Math.random() < 0.7 ? 1 : 0) : 3 + Math.floor(Math.random() * 3) }), 500 + Math.random() * 3000);
      if (g.audience && g.fault && g.fault.active && Math.random() < 0.02) this.send('BOMBA_FAULT', {});
      if (g.onStage && g.role === 'blind' && sc.key === 'paparazzi' && sc.status === 'play' && g.priv && g.priv.shotsLeft > 0) this.once(`ph${sc.team}${g.priv.shotsLeft}`, () => this.post('photo', JPEG), 1500);
      if (g.onStage && g.role === 'mute' && sc.key === 'karaoke' && sc.status === 'play' && g.priv && g.priv.seq.length < 3 && g.priv.board) this.once(`em${sc.team}${g.priv.seq.length}`, () => this.send('BOMBA_EMOJI', { op: 'add', emoji: g.priv.board.find(Boolean) }), 1000);
    }

    // ── Crimen ──
    if (ph === 'GIANELLA_CRIMEN' && g.voting && g.voting.open && !g.verdict && !g.myVote) {
      const tgt = cfg.crimen || {};
      this.once('vote' + g.voting.endsAt, () => this.send('CRIMEN_VOTE', { s: good ? tgt.culprit : pick(g.suspects).id, w: good ? tgt.weapon : pick(g.weapons).id, m: good ? tgt.motive : pick(g.motives).id }), 1500 + Math.random() * 5000);
    }
    // ── Keiko ──
    if (ph === 'DESCARGA_MADRE_KEIKO' && g.status === 'live' && !this.shaking) {
      this.shaking = setInterval(() => { if (this.s?.game?.status !== 'live') { clearInterval(this.shaking); this.shaking = null; return; } this.send('SHAKE_PULSE', { power: Math.random() < SKILL ? 4 + Math.floor(Math.random() * 6) : 1 }); }, 220);
    }
    // ── Kahoot ──
    if (ph === 'KAHOOT' && g.status === 'question' && g.myAnswer == null) {
      const correct = cfg.kahoot?.questions?.[g.q]?.correct ?? 0;
      this.once('k' + g.q, () => this.send('SUBMIT_KAHOOT_ANSWER', { q: g.q, choice: good ? correct : Math.floor(Math.random() * g.question.options.length) }), 800 + Math.random() * 7000);
    }
    // ── Aura ──
    if (ph === 'FARMEO_AURA') {
      if (g.status === 'betting' && !g.myBet) this.once(`bet${g.round}${g.kind}${g.history?.length}`, () => this.send('PLACE_AURA_BET', { type: pick(['PERCENT_20', 'PERCENT_50', 'PERCENT_20', 'ALL_IN']), pick: g.kind === 'duel' ? pick(['A', 'B']) : g.kind === 'roulette' ? pick(g.roulette).id : undefined }), 800 + Math.random() * 3000);
      if (g.status === 'question' && g.myVote == null) {
        const idx = (cfg.aura?.trivia || []).findIndex((t) => t.q === g.question?.q);
        this.once('a' + g.question?.q, () => this.send('AURA_ANSWER', { choice: good ? cfg.aura.trivia[idx]?.correct ?? 0 : Math.floor(Math.random() * 4) }), 800 + Math.random() * 7000);
      }
    }
    // ── Estatua ──
    if (ph === 'ESTATUA' && (g.status === 'ready' || g.status === 'still') && !this.still) {
      this.still = setInterval(() => {
        const st = this.s?.game?.status;
        if (st !== 'ready' && st !== 'still') { clearInterval(this.still); this.still = null; return; }
        const moving = Math.random() > SKILL + 0.18;
        this.send('MOTION_SENSOR_TICK', { is_moving: moving, v: moving ? 3 : 0.2 });
      }, 250);
    }
    // ── Pixel ──
    if (ph === 'PIXEL_ART' && g.mine && g.canPaint) for (const c of g.mine) if (!c.painted) this.once(`px${c.x},${c.y}`, () => this.send('CONFIRM_PIXEL', { x: c.x, y: c.y }), 1000 + Math.random() * 12000);
  }
}

(async () => {
  console.log(`🤖 Lanzando ${N} bots hacia ${BASE} (habilidad ${SKILL}, llegadas cada ~${ARRIVE} ms)…`);
  for (let i = 0; i < N; i++) { new Bot(i + OFFSET).connect(); await sleep(ARRIVE); }
  console.log('Listo. Ctrl+C para terminar.');
})();
