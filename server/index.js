'use strict';
/**
 * FIESTA 35 — servidor central ("la fiesta como videojuego").
 * HTTP (estáticos + API + subidas) + WebSocket (tiempo real, servidor autoritativo) + máquina de fases + SQLite.
 * Sin dependencias de nube: corre en la laptop del anfitrión, en un VPS o en Docker.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const db = require('./db');
const U = require('./util');
const games = require('./games');
const M = require('./engine/matchmaker');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const USE_HTTPS = process.env.HTTPS === '1' || process.argv.includes('--https');

// ─────────────────────────────── Configuración y contenido ───────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const d of ['selfies', 'clips', 'photos']) fs.mkdirSync(path.join(UPLOADS, d), { recursive: true });
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const DEFAULT_FILE = path.join(__dirname, 'config.default.json');
if (!fs.existsSync(CONFIG_FILE)) fs.copyFileSync(DEFAULT_FILE, CONFIG_FILE);
const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
{ // completa secciones nuevas si el config del usuario es de una versión anterior
  const def = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'));
  for (const k of Object.keys(def)) if (config[k] === undefined) config[k] = def[k];
}
if (process.env.ADMIN_SECRET_KEY) config.adminKey = process.env.ADMIN_SECRET_KEY;
if (process.env.JURY_PIN) config.juryPin = process.env.JURY_PIN;

const CONTENT_DIR = path.join(DATA_DIR, 'content');
const CONTENT_SEED = path.join(__dirname, 'content');
fs.mkdirSync(CONTENT_DIR, { recursive: true });
for (const f of fs.readdirSync(CONTENT_SEED)) if (!fs.existsSync(path.join(CONTENT_DIR, f))) fs.copyFileSync(path.join(CONTENT_SEED, f), path.join(CONTENT_DIR, f));
const content = {};
function loadContent() {
  for (const f of fs.readdirSync(CONTENT_DIR)) if (f.endsWith('.json')) {
    try { content[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8')); } catch (e) { console.error('contenido inválido', f, e.message); }
  }
}
loadContent();

function replaceConfig(next) {
  const adminKey = config.adminKey;
  for (const k of Object.keys(config)) delete config[k];
  Object.assign(config, next);
  config.adminKey = process.env.ADMIN_SECRET_KEY || next.adminKey || adminKey;
}

// ─────────────────────────────── Estado ───────────────────────────────
const store = db.open(path.join(DATA_DIR, 'fiesta35.db'));

function freshState() {
  const aura = {}, teams = {};
  for (const t of config.tables) { aura[t.n] = config.startingAura ?? 0; teams[t.n] = { name: t.name, renamed: false, selfie: null }; }
  return {
    phase: config.phases[0].id,
    clock: { endsAt: null, totalMs: 0, paused: false, remainingMs: null, startedAt: Date.now() },
    stars: { keiko: false, estatua: false, pixel: false, foto: false },
    aura, teams, ledger: [],
    disco: { on: false, bpm: 120, startedAt: 0 },
    announce: null,
    g: {},
  };
}
function normalizeState(s) {
  for (const t of config.tables) {
    if (s.aura[t.n] == null) s.aura[t.n] = config.startingAura ?? 0;
    s.teams ||= {};
    s.teams[t.n] ||= { name: t.name, renamed: false, selfie: null };
  }
  s.ledger ||= [];
  return s;
}

let state = normalizeState(store.loadState() || freshState());
const guests = new Map();
for (const g of store.loadGuests()) guests.set(g.id, g);
const clients = new Set();
const feedLog = [];
let dirty = true;
let persistDirty = true;

const phaseIndex = (id) => config.phases.findIndex((p) => p.id === id);
const gameForPhase = (id) => games.list.find((g) => g.phases.includes(id));
const gameById = (id) => games.list.find((g) => g.id === id);

// ─────────────────────────────── Contexto compartido con los juegos ───────────────────────────────
const ctx = {
  config, content, db: store, guests, clients,
  get state() { return state; },
  now: () => Date.now(),
  dirty() { dirty = true; persistDirty = true; },
  /** Datos de un equipo con nombre dinámico (autonombrado / renombrado). */
  tableCfg(n) {
    const t = config.tables.find((x) => x.n === Number(n));
    if (!t) return undefined;
    const dyn = state.teams && state.teams[t.n];
    return { ...t, name: (dyn && dyn.name) || t.name };
  },
  membersOf: (n) => [...guests.values()].filter((g) => g.table === Number(n)).sort((a, b) => a.createdAt - b.createdAt),
  isOnline,
  onlineGuests: () => [...guests.values()].filter(isOnline),
  teamSizes: () => config.tables.map((t) => ctx.membersOf(t.n).length),
  /** Multiplicador por equipo incompleto: tamaño del mayor / tamaño del tuyo (tope ×1.5), recalculado en vivo. */
  multiplier(n) {
    const sizes = ctx.teamSizes();
    return M.multiplier(sizes, ctx.membersOf(n).length);
  },

  /**
   * Movimiento de puntos con ledger append-only.
   * source: caja | bomba | entrada | crimen | farmeo | admin | deshacer …   (no se permite saldo negativo)
   */
  addAura(n, delta, reason, source = 'manual', ref = null) {
    n = Number(n);
    const before = state.aura[n] ?? 0;
    const after = Math.max(0, before + Math.round(delta));
    state.aura[n] = after;
    const applied = after - before;
    let id = null;
    try { id = store.ledgerAdd({ team: n, source, delta: applied, balance: after, reason, ref }); } catch (e) { console.error(e); }
    state.ledger.unshift({ id, at: Date.now(), team: n, source, delta: applied, balance: after, reason, ref, undone: false });
    if (state.ledger.length > 400) state.ledger.pop();
    ctx.dirty();
    return applied;
  },
  /** Premio por jugar: aplica el multiplicador (solo si delta > 0 y mult !== false). */
  award(n, base, { source = 'juego', reason = '', mult = true } = {}) {
    const m = mult && base > 0 ? ctx.multiplier(n) : 1;
    const delta = Math.round(base * m);
    return ctx.addAura(n, delta, reason + (m !== 1 ? ` (×${m})` : ''), source);
  },
  undoLedger(id) {
    const e = state.ledger.find((x) => x.id === Number(id));
    if (!e || e.undone || e.source === 'deshacer') return false;
    e.undone = true;
    ctx.addAura(e.team, -e.delta, `Deshacer #${e.id}: ${e.reason}`, 'deshacer', e.id);
    return true;
  },

  sound(id) { toRoles(['screen', 'admin'], 'PLAY_AUDIO_EFFECT', { id }); },
  vibrateGuest(guestId, pattern) { toGuest(guestId, 'VIBRATE_TRIGGER', { pattern }); },
  vibrateTable(n, pattern) { for (const g of ctx.membersOf(n)) toGuest(g.id, 'VIBRATE_TRIGGER', { pattern }); },
  vibrateAll(pattern) { toRoles(['guest'], 'VIBRATE_TRIGGER', { pattern }); },
  toGuest, toRoles,
  toTable(n, ev, p) { for (const g of ctx.membersOf(n)) toGuest(g.id, ev, p); },
  star(key) {
    if (state.stars[key]) return;
    state.stars[key] = true;
    toRoles(['guest', 'screen', 'admin'], 'STAR_UNLOCKED', { key, count: starCount() });
    ctx.feed(`⭐ ¡Estrella colectiva ${starCount()}/4 desbloqueada!`, 'star');
    ctx.dirty();
  },
  feed(text, kind = 'info') {
    feedLog.unshift({ at: Date.now(), text, kind });
    if (feedLog.length > 80) feedLog.pop();
    ctx.dirty();
  },
  setPhase,
  saveGuest(g) { store.saveGuest(g); ctx.dirty(); },
  uploadsDir: UPLOADS,
};

const starCount = () => Object.values(state.stars).filter(Boolean).length;

// ─────────────────────────────── Mensajería ───────────────────────────────
function pack(event, payload) { return JSON.stringify({ event, payload, timestamp: Date.now() }); }
function sendRaw(c, str) { if (c.ws.readyState === 1) { try { c.ws.send(str); } catch { /* socket cerrado */ } } }
function send(c, event, payload) { sendRaw(c, pack(event, payload)); }
const PRIVATE_ROLES = ['admin', 'jury', 'camera'];
function toRoles(roles, event, payload) {
  const str = pack(event, payload);
  for (const c of clients) if (roles.includes(c.role) && (!PRIVATE_ROLES.includes(c.role) || c.authed)) sendRaw(c, str);
}
function toGuest(guestId, event, payload) {
  const str = pack(event, payload);
  for (const c of clients) if (c.role === 'guest' && c.guestId === guestId) sendRaw(c, str);
}

// ─────────────────────────────── Presencia ───────────────────────────────
const BEAT_TIMEOUT = 15000;
function guestClients(id) { const r = []; for (const c of clients) if (c.role === 'guest' && c.guestId === id) r.push(c); return r; }
function isOnline(g) {
  const now = Date.now();
  for (const c of clients) if (c.role === 'guest' && c.guestId === g.id && now - c.lastBeat < BEAT_TIMEOUT) return true;
  return false;
}
function telemetry(g) {
  let best = null;
  for (const c of guestClients(g.id)) if (!best || c.lastBeat > best.lastBeat) best = c;
  return best
    ? { online: Date.now() - best.lastBeat < BEAT_TIMEOUT, rtt: best.rtt, battery: best.battery, charging: best.charging, sensor: best.sensor, visible: best.visible, ip: best.ip }
    : { online: false };
}

// ─────────────────────────────── Fases ───────────────────────────────
function setPhase(id) {
  const idx = phaseIndex(id);
  if (idx < 0) return;
  const prev = state.phase;
  const ph = config.phases[idx];
  const now = Date.now();
  // Al salir de la Entrada se cierran los equipos automáticamente (nadie se queda sin equipo).
  if (prev === 'REGISTRATION' && id !== 'REGISTRATION') gameById('entrada').closeTeams(ctx);
  state.phase = id;
  state.clock = {
    startedAt: now, totalMs: ph.minutes * 60000, paused: false, remainingMs: null,
    endsAt: ph.minutes > 0 ? now + ph.minutes * 60000 : null,
  };
  const gm = gameForPhase(id);
  if (gm && gm.enter) gm.enter(ctx);
  ctx.feed(`${ph.icon} Fase: ${ph.name}`, 'phase');
  toRoles(['guest', 'screen'], 'ROUND_START', { phase: id });
  ctx.dirty();
}

function togglePause() {
  const now = Date.now();
  const c = state.clock;
  if (!c.paused) {
    c.paused = true;
    c.pausedAt = now;
    if (c.endsAt) c.remainingMs = Math.max(0, c.endsAt - now);
  } else {
    const delta = now - (c.pausedAt || now);
    c.paused = false;
    if (c.endsAt) c.endsAt = now + (c.remainingMs ?? 0);
    c.remainingMs = null;
    for (const g of games.list) if (g.shift) g.shift(ctx, delta);
  }
  ctx.feed(c.paused ? '⏸️ Reloj en pausa' : '▶️ Reloj reanudado', 'clock');
  ctx.dirty();
}

function addTime(sec) {
  const c = state.clock;
  const ms = sec * 1000;
  if (c.paused && c.remainingMs != null) c.remainingMs = Math.max(0, c.remainingMs + ms);
  else if (c.endsAt) c.endsAt += ms;
  else { c.endsAt = Date.now() + Math.max(0, ms); c.totalMs = Math.max(0, ms); }
  c.totalMs += ms;
  ctx.dirty();
}

// ─────────────────────────────── Invitados ───────────────────────────────
const meView = (g) => ({
  id: g.id, name: g.name, alias: g.alias, table: g.table, survey: g.survey, kahootScore: g.kahootScore,
  animal: g.animal, stage: g.stage, fav: g.fav, absent: !!g.absent, late: !!g.late,
});

function attachClient(c, g) { c.guestId = g.id; }

// ─────────────────────────────── Snapshots ───────────────────────────────
function tablesView() {
  return config.tables.map((t) => {
    const m = ctx.membersOf(t.n);
    const dyn = ctx.tableCfg(t.n);
    return {
      n: t.n, name: dyn.name, color: t.color, emoji: t.emoji, aura: state.aura[t.n] ?? 0, members: m.length,
      online: m.filter(isOnline).length, selfie: state.teams[t.n].selfie, mult: ctx.multiplier(t.n),
    };
  });
}
function phaseView() {
  const idx = phaseIndex(state.phase);
  const p = config.phases[idx] || {};
  return { id: p.id, idx, name: p.name, icon: p.icon, time: p.time, total: config.phases.length };
}
function common() {
  const all = [...guests.values()];
  return {
    phase: phaseView(), clock: state.clock, stars: state.stars, starCount: starCount(),
    tables: tablesView(), disco: state.disco, announce: state.announce,
    counts: { registered: all.length, online: all.filter(isOnline).length },
    meta: config.meta,
  };
}
const entrada = () => gameById('entrada');
function snapshot(c) {
  const base = common();
  const gm = gameForPhase(state.phase);
  if (c.role === 'guest') {
    const g = c.guestId && guests.get(c.guestId);
    let game = null;
    if (g) {
      // quien aún no está en un equipo ve el flujo de Entrada sin importar la fase global
      if (g.stage !== 'team') game = { id: 'entrada', ...entrada().viewGuest(ctx, g) };
      else if (gm) game = { id: gm.id, ...(gm.viewGuest ? gm.viewGuest(ctx, g) : gm.viewScreen(ctx)) };
    }
    const team = g && g.table ? ctx.membersOf(g.table).map((m) => ({ id: m.id, name: m.alias || m.name, animal: m.animal, online: isOnline(m) })) : [];
    return { ...base, me: g ? meView(g) : null, team, game, extra: g ? entrada().viewExtra(ctx, g) : null, test: entrada().publicTest(ctx), consentText: config.entrada.consentText };
  }
  if (c.role === 'screen') {
    const roster = {};
    for (const t of config.tables) roster[t.n] = ctx.membersOf(t.n).map((m) => ({ name: m.alias || m.name, animal: m.animal, online: isOnline(m) }));
    return { ...base, game: gm ? { id: gm.id, ...gm.viewScreen(ctx) } : null, roster, lobby: entrada().viewScreen(ctx) };
  }
  if (!c.authed) return { locked: true };
  if (c.role === 'jury') return { ...base, jury: gameById('bomba').viewJury(ctx, c.juror), juror: c.juror };
  if (c.role === 'camera') return { phase: base.phase, camera: gameById('bomba').viewCamera(ctx) };
  // admin
  const list = [...guests.values()].map((g) => ({
    id: g.id, name: g.name, alias: g.alias, table: g.table, kahootScore: g.kahootScore, survey: g.survey, animal: g.animal, stage: g.stage, absent: !!g.absent, late: !!g.late, ...telemetry(g),
  }));
  return {
    ...base,
    game: gm ? { id: gm.id, ...(gm.viewAdmin ? gm.viewAdmin(ctx) : gm.viewScreen(ctx)) } : null,
    entrada: entrada().viewAdmin(ctx), caja: gameById('caja').viewAdmin(ctx), bomba: gameById('bomba').viewAdmin(ctx),
    guests: list, feed: feedLog.slice(0, 50), phases: config.phases, ledger: state.ledger.slice(0, 120),
    example: !!(config.meta && config.meta.example),
  };
}

function flush() {
  if (!dirty) return;
  dirty = false;
  for (const c of clients) {
    if (PRIVATE_ROLES.includes(c.role) && !c.authed) continue;
    const payload = JSON.stringify(snapshot(c));
    if (payload === c.lastSent) continue;
    c.lastSent = payload;
    sendRaw(c, `{"event":"SYNC_STATE","timestamp":${Date.now()},"payload":${payload}}`);
  }
}

// ─────────────────────────────── Mensajes de clientes ───────────────────────────────
const failedLogins = new Map(); // ip -> {n, until}

function throttleLogin(c) {
  const f = failedLogins.get(c.ip) || { n: 0, until: 0 };
  if (Date.now() < f.until) return { blocked: true, f };
  return { blocked: false, f };
}
function loginFail(c, f) { f.n += 1; if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; } failedLogins.set(c.ip, f); }

function onMessage(c, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  const ev = m.event;
  const p = m.payload || {};
  c.lastBeat = Date.now();

  if (ev === 'HEARTBEAT') {
    c.rtt = Number(p.rtt) || c.rtt;
    c.battery = typeof p.battery === 'number' ? p.battery : c.battery;
    c.charging = p.charging;
    c.sensor = p.sensor || c.sensor;
    c.visible = p.visible !== false;
    send(c, 'PONG', { t0: p.t0, serverTime: Date.now() });
    if (c.guestId) { const g = guests.get(c.guestId); if (g) g.lastSeen = Date.now(); }
    dirty = true;
    return;
  }

  if (c.role === 'admin') return onAdmin(c, ev, p);
  if (c.role === 'jury') return onJury(c, ev, p);
  if (c.role === 'camera') return onCamera(c, ev, p);
  if (c.role === 'screen') { const cg = gameById('cierre'); if (cg && cg.screen && cg.screen(ctx, ev, p)) ctx.dirty(); return; }

  // ── invitado ──
  const en = entrada();
  if (ev === 'REGISTER') { en.register(ctx, c, p, { send: (e, pl) => send(c, e, pl), attach: (g) => attachClient(c, g) }); return; }
  const g = c.guestId && guests.get(c.guestId);
  if (!g) return send(c, 'NEED_REGISTER', {});
  if (ev === 'REACTION') {
    const now = Date.now();
    if (now - (c.lastReact || 0) < 250) return;
    c.lastReact = now;
    toRoles(['screen'], 'REACTION', { emoji: String(p.emoji || '🎉').slice(0, 4), name: g.alias || g.name, table: g.table });
    return;
  }
  // módulos "siempre activos" (Entrada y Bomba reciben eventos aunque la fase global sea otra, p. ej. llegadas tardías)
  for (const gm of games.list) if (gm.always && gm.guest && gm.guest(ctx, g, ev, p, c)) { ctx.dirty(); return; }
  const gm = gameForPhase(state.phase);
  if (gm && !gm.always && gm.guest) {
    const handled = gm.guest(ctx, g, ev, p, c);
    if (handled) ctx.dirty();
  }
}

function onJury(c, ev, p) {
  if (ev === 'JURY_LOGIN') {
    const { blocked, f } = throttleLogin(c);
    if (blocked) return send(c, 'LOGIN_DENIED', { message: 'Demasiados intentos. Espera un minuto.' });
    const juror = Math.max(1, Math.min(config.jurors || 3, Number(p.juror) || 1));
    if (U.safeEq(p.pin || '', config.juryPin)) {
      c.authed = true; c.juror = juror; failedLogins.delete(c.ip);
      send(c, 'LOGIN_OK', { token: U.sha(config.juryPin + ':jury'), juror });
      ctx.dirty();
    } else { loginFail(c, f); send(c, 'LOGIN_DENIED', { message: 'PIN incorrecto.' }); }
    return;
  }
  if (!c.authed) return;
  const bm = gameById('bomba');
  if (bm.jury && bm.jury(ctx, c.juror, ev, p)) ctx.dirty();
}

function onCamera(c, ev, p) {
  if (ev === 'CAMERA_LOGIN') {
    const { blocked, f } = throttleLogin(c);
    if (blocked) return send(c, 'LOGIN_DENIED', { message: 'Demasiados intentos. Espera un minuto.' });
    if (U.safeEq(p.key || '', config.adminKey)) { c.authed = true; failedLogins.delete(c.ip); send(c, 'LOGIN_OK', { token: adminToken() }); ctx.dirty(); }
    else { loginFail(c, f); send(c, 'LOGIN_DENIED', { message: 'Clave incorrecta.' }); }
    return;
  }
  if (!c.authed) return;
  const bm = gameById('bomba');
  if (bm.camera && bm.camera(ctx, ev, p)) ctx.dirty();
}

function onAdmin(c, ev, p) {
  if (ev === 'ADMIN_LOGIN') {
    const { blocked, f } = throttleLogin(c);
    if (blocked) return send(c, 'ADMIN_DENIED', { message: 'Demasiados intentos. Espera un minuto.' });
    if (U.safeEq(p.key || '', config.adminKey)) {
      c.isAdmin = true; c.authed = true;
      failedLogins.delete(c.ip);
      send(c, 'ADMIN_OK', { token: adminToken() });
      ctx.dirty();
    } else { loginFail(c, f); send(c, 'ADMIN_DENIED', { message: 'Clave incorrecta.' }); }
    return;
  }
  if (!c.isAdmin) return;
  if (ev !== 'ADMIN_CMD') return;
  try { runAdmin(String(p.cmd), p.args || {}); } catch (e) { console.error('ADMIN_CMD', p.cmd, e); send(c, 'TOAST', { message: 'Error: ' + e.message }); }
  ctx.dirty();
}

function runAdmin(cmd, a) {
  switch (cmd) {
    case 'SET_PHASE': return setPhase(a.phase);
    case 'NEXT_PHASE': { const i = phaseIndex(state.phase); if (i < config.phases.length - 1) setPhase(config.phases[i + 1].id); return; }
    case 'PREV_PHASE': { const i = phaseIndex(state.phase); if (i > 0) setPhase(config.phases[i - 1].id); return; }
    case 'PAUSE_TOGGLE': return togglePause();
    case 'ADD_TIME': return addTime(Number(a.seconds) || 120);
    case 'FORCE_SUCCESS': { const gm = gameForPhase(state.phase); if (gm && gm.force) gm.force(ctx); return; }
    case 'RESET_GAME': { const gm = gameById(a.game) || gameForPhase(state.phase); if (gm) { delete state.g[gm.id]; if (gm.init) gm.init(ctx); if (gm.enter && gm.phases.includes(state.phase)) gm.enter(ctx); } return; }
    case 'ADJUST_AURA': {
      const n = Number(a.table);
      const why = String(a.reason || '').slice(0, 120) || 'ajuste manual';
      if (a.reset) return ctx.addAura(n, -(state.aura[n] || 0), 'Admin: reset · ' + why, 'admin');
      if (a.set != null) return ctx.addAura(n, Number(a.set) - (state.aura[n] || 0), 'Admin: fijar · ' + why, 'admin');
      ctx.addAura(n, Number(a.delta) || 0, 'Admin: ' + why, 'admin');
      ctx.feed(`✋ Admin ajustó los puntos del Equipo ${n}: ${a.delta > 0 ? '+' : ''}${a.delta} (${why})`, 'aura');
      return;
    }
    case 'LEDGER_UNDO': return ctx.undoLedger(a.id);
    case 'SET_STAR': state.stars[a.key] = !!a.on; return;
    case 'PLAY_SOUND': return ctx.sound(String(a.id));
    case 'VIBRATE': return ctx.vibrateAll(a.pattern || [200, 100, 200]);
    case 'ANNOUNCE': {
      const sec = Math.max(2, Math.min(60, Number(a.seconds) || 8));
      state.announce = a.text ? { text: String(a.text).slice(0, 140), at: Date.now(), until: Date.now() + sec * 1000 } : null;
      if (a.text) ctx.vibrateAll([150, 80, 150]);
      return;
    }
    case 'DISCO': {
      const d = state.disco;
      d.on = !!a.on;
      if (a.bpm) d.bpm = Math.max(60, Math.min(200, Number(a.bpm)));
      if (d.on) d.startedAt = Date.now();
      return;
    }
    case 'GUEST_MOD': return entrada().adminGuestMod(ctx, a);
    case 'TEAM_RENAME': {
      const t = state.teams[Number(a.table)];
      if (t && a.name) { t.name = String(a.name).slice(0, 40); t.renamed = true; }
      return;
    }
    case 'BACKUP': {
      const f = path.join(DATA_DIR, `respaldo-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
      store.saveState(state); store.backup(f); ctx.feed('💾 Respaldo creado: ' + path.basename(f), 'info');
      return;
    }
    case 'DELETE_MEDIA': {
      const kind = ['selfies', 'clips', 'photos'].includes(a.kind) ? a.kind : null;
      if (!kind) return;
      for (const f of fs.readdirSync(path.join(UPLOADS, kind))) fs.rmSync(path.join(UPLOADS, kind, f), { force: true });
      for (const g of games.list) if (g.onMediaDeleted) g.onMediaDeleted(ctx, kind);
      ctx.feed('🗑️ Archivos borrados: ' + kind, 'info');
      return;
    }
    case 'RESET_ALL': {
      if (a.confirm !== 'BORRAR') return;
      store.saveState(state);
      store.resetAll();
      guests.clear();
      state = freshState();
      feedLog.length = 0;
      for (const f of ['selfies', 'clips', 'photos']) for (const x of fs.readdirSync(path.join(UPLOADS, f))) fs.rmSync(path.join(UPLOADS, f, x), { force: true });
      for (const g of games.list) if (g.init) g.init(ctx);
      ctx.feed('🧹 Evento reiniciado desde cero', 'info');
      return;
    }
    default: {
      for (const gm of games.list) if (gm.admin && gm.admin(ctx, cmd, a)) return;
    }
  }
}

const adminToken = () => U.sha(config.adminKey + ':admin-session');

// ─────────────────────────────── HTTP ───────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};
const PAGES = {
  '/': 'index.html', '/play': 'index.html', '/jugador': 'index.html', '/screen': 'screen.html', '/projector': 'screen.html', '/pantalla': 'screen.html',
  '/admin': 'admin.html', '/qr': 'qr.html', '/jurado': 'jurado.html', '/camara': 'camara.html',
};

function lanUrls(secure) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  out.sort((a, b) => (/^(192\.168|10\.)/.test(a) ? -1 : 1) - (/^(192\.168|10\.)/.test(b) ? -1 : 1));
  return out.map((ip) => `${secure ? 'https' : 'http'}://${ip}:${secure ? HTTPS_PORT : PORT}`);
}

function serveFile(res, file, req) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-cache' : 'public, max-age=60' };
    if (req.headers.range && (ext === '.mp4' || ext === '.webm' || ext === '.mp3')) {
      const [s, e] = req.headers.range.replace('bytes=', '').split('-');
      const start = parseInt(s, 10) || 0;
      const end = e ? parseInt(e, 10) : st.size - 1;
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

function readBuf(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (d) => { size += d.length; if (size > limit) { reject(new Error('Archivo demasiado grande')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (p === '/api/info') {
    const secure = !!req.socket.encrypted;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({
      lan: lanUrls(secure), lanHttp: lanUrls(false), lanHttps: USE_HTTPS ? lanUrls(true) : [],
      publicUrl: process.env.PUBLIC_URL || '', secure, https: USE_HTTPS,
      tables: config.tables.map((t) => ({ n: t.n, name: ctx.tableCfg(t.n).name, color: t.color, emoji: t.emoji })), meta: config.meta,
    }));
  }

  // ── configuración y contenido editables (solo admin) ──
  if (p === '/api/config' || p.startsWith('/api/content')) {
    if (req.headers['x-admin-token'] !== adminToken()) return json(res, 401, { error: 'No autorizado' });
    try {
      if (p === '/api/config' && req.method === 'GET') { const { adminKey, ...safe } = config; return json(res, 200, safe); }
      if (p === '/api/config' && req.method === 'PUT') {
        const next = JSON.parse((await readBuf(req, 512 * 1024)).toString('utf8'));
        if (!next || !Array.isArray(next.tables) || !next.tables.length || !Array.isArray(next.phases) || !next.phases.length) throw new Error('Faltan "tables" o "phases".');
        for (const k of ['caja', 'bomba', 'crimen', 'keiko', 'kahoot', 'aura', 'estatua', 'pixel', 'foto', 'entrada']) if (typeof next[k] !== 'object') throw new Error(`Falta la sección "${k}".`);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
        replaceConfig(next);
        normalizeState(state);
        ctx.feed('📝 Contenido actualizado desde el panel', 'info');
        return json(res, 200, { ok: true });
      }
      if (p === '/api/content' && req.method === 'GET') return json(res, 200, { files: Object.keys(content) });
      const m = p.match(/^\/api\/content\/([a-z0-9-]+)$/);
      if (m && req.method === 'GET') return json(res, 200, content[m[1]] || {});
      if (m && req.method === 'PUT') {
        const next = JSON.parse((await readBuf(req, 512 * 1024)).toString('utf8'));
        if (!content[m[1]]) throw new Error('Archivo de contenido desconocido');
        fs.writeFileSync(path.join(CONTENT_DIR, m[1] + '.json'), JSON.stringify(next, null, 2));
        content[m[1]] = next;
        ctx.feed('📝 Contenido "' + m[1] + '" actualizado', 'info');
        return json(res, 200, { ok: true });
      }
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  // ── subidas (selfie de equipo, foto de Paparazzi, clips de la cámara) ──
  if (p.startsWith('/api/upload/') && req.method === 'POST') {
    try {
      const kind = p.slice(12);
      const limit = kind === 'clip' ? 8 * 1024 * 1024 : 700 * 1024;
      const buf = await readBuf(req, limit);
      const q = Object.fromEntries(url.searchParams);
      let out;
      if (kind === 'clip') {
        if (q.t !== adminToken()) return json(res, 401, { error: 'No autorizado' });
        out = gameById('bomba').onClip(ctx, q, buf, req.headers['content-type'] || '');
      } else {
        const g = [...guests.values()].find((x) => x.token === q.t);
        if (!g) return json(res, 401, { error: 'Invitado desconocido' });
        out = kind === 'selfie' ? entrada().onSelfie(ctx, g, buf) : kind === 'photo' ? gameById('bomba').onPhoto(ctx, g, buf) : { error: 'Tipo desconocido' };
      }
      ctx.dirty();
      return json(res, out && out.error ? 400 : 200, out || { ok: true });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  if (p === '/api/export') {
    if (url.searchParams.get('t') !== adminToken()) { res.writeHead(401); return res.end('No autorizado'); }
    if (url.searchParams.get('what') === 'json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="fiesta35-respaldo.json"' });
      const safeGuests = [...guests.values()].map(({ token, answers, vec, ...g }) => g);
      return res.end(JSON.stringify({ exportedAt: new Date().toISOString(), state, guests: safeGuests, ledger: store.ledgerAll() }, null, 2));
    }
    const rows = [...guests.values()].map((g) => ({ nombre: g.name, alias: g.alias, animal: g.animal && g.animal.emoji, equipo: g.table, kahoot: g.kahootScore, cosa_favorita: g.fav, ...g.survey }));
    const head = rows.length ? Object.keys(rows[0]) : [];
    const csv = [head.join(','), ...rows.map((r) => head.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="fiesta35-invitados.csv"' });
    return res.end('﻿' + csv);
  }
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (PAGES[p]) return serveFile(res, path.join(PUBLIC, PAGES[p]), req);
  if (p.startsWith('/uploads/')) {
    const f = path.normalize(path.join(UPLOADS, p.slice(9)));
    if (!f.startsWith(UPLOADS)) { res.writeHead(403); return res.end(); }
    return serveFile(res, f, req);
  }
  if (p.startsWith('/media/')) {
    const f = path.normalize(path.join(DATA_DIR, 'media', p.slice(7)));
    if (!f.startsWith(path.join(DATA_DIR, 'media'))) { res.writeHead(403); return res.end(); }
    return serveFile(res, f, req);
  }
  const f = path.normalize(path.join(PUBLIC, p));
  if (!f.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  serveFile(res, f, req);
}

// ─────────────────────────────── WebSocket ───────────────────────────────
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function attach(server) {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req, url));
  });
}

function onConnection(ws, req, url) {
  const r = url.searchParams.get('role');
  const role = ['guest', 'screen', 'admin', 'jury', 'camera'].includes(r) ? r : 'guest';
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].replace('::ffff:', '').trim();
  const c = { ws, role, ip, ua: req.headers['user-agent'] || '', lastBeat: Date.now(), lastSent: '', isAdmin: false, authed: false, guestId: null };
  clients.add(c);

  if (role === 'admin' && url.searchParams.get('atoken') === adminToken()) { c.isAdmin = true; c.authed = true; }
  if (role === 'camera' && url.searchParams.get('atoken') === adminToken()) c.authed = true;
  if (role === 'jury' && url.searchParams.get('jtoken') === U.sha(config.juryPin + ':jury')) { c.authed = true; c.juror = Math.max(1, Math.min(config.jurors || 3, Number(url.searchParams.get('juror')) || 1)); }
  if (role === 'guest') {
    const tk = url.searchParams.get('token');
    const g = tk && [...guests.values()].find((x) => x.token === tk);
    if (g) {
      const had = guestClients(g.id).length > 0;
      c.guestId = g.id;
      store.log(g.id, had ? 'RECONNECT' : 'CONNECT', ip, c.ua);
      ctx.feed(`📶 ${g.name} ${had ? 'reconectó' : 'conectó'}`, 'net');
    }
  }
  send(c, 'HELLO', { serverTime: Date.now(), role, admin: c.isAdmin });
  ctx.dirty();

  ws.on('message', (raw) => onMessage(c, raw.toString()));
  ws.on('close', () => {
    clients.delete(c);
    if (c.guestId) {
      const g = guests.get(c.guestId);
      if (g && !guestClients(g.id).length) { store.log(g.id, 'DISCONNECT', ip, c.ua); ctx.feed(`📴 ${g.name} se desconectó`, 'net'); }
    }
    ctx.dirty();
  });
  ws.on('error', () => {});
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
}

setInterval(() => {
  for (const c of clients) {
    if (c.ws.isAlive === false) { c.ws.terminate(); continue; }
    c.ws.isAlive = false;
    try { c.ws.ping(); } catch { /* ignore */ }
  }
}, 5000);

// ─────────────────────────────── Bucle principal ───────────────────────────────
let lastOnlineSig = '';
setInterval(() => {
  const now = Date.now();
  if (state.announce && now > state.announce.until) { state.announce = null; dirty = true; }
  for (const gm of games.list) if (gm.tick) { try { gm.tick(ctx, now); } catch (e) { console.error('tick', gm.id, e); } }
  const sig = [...guests.values()].map((g) => (isOnline(g) ? 1 : 0)).join('');
  if (sig !== lastOnlineSig) { lastOnlineSig = sig; dirty = true; }
  flush();
}, 200);

setInterval(() => {
  if (!persistDirty) return;
  persistDirty = false;
  try { store.saveState(state); } catch (e) { console.error('persist', e); }
}, 2000);

for (const gm of games.list) if (gm.init) gm.init(ctx);

function shutdown() {
  try { store.saveState(state); store.close(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─────────────────────────────── Arranque ───────────────────────────────
async function start() {
  const httpServer = http.createServer(handler);
  attach(httpServer);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('\n🎉  FIESTA 35 lista\n');
    console.log(`   Invitados : ${lanUrls(false).map((u) => u + '/').join('  |  ') || `http://localhost:${PORT}/`}`);
    console.log(`   Pantalla  : http://localhost:${PORT}/pantalla   (TV / proyector)`);
    console.log(`   Admin     : http://localhost:${PORT}/admin      (clave: ADMIN_SECRET_KEY o config.json)`);
    console.log(`   Jurado    : http://localhost:${PORT}/jurado     (PIN: JURY_PIN o config.json)`);
    console.log(`   Cámara    : http://localhost:${PORT}/camara     (celular en el trípode)`);
    console.log(`   QR equipos: http://localhost:${PORT}/qr\n`);
    if (!USE_HTTPS) console.log('   ⚠️  Sin HTTPS la cámara y el movimiento NO funcionan en iPhone/Android. Usa un túnel (README) o  npm run start:https\n');
  });
  if (USE_HTTPS) {
    const keyF = path.join(DATA_DIR, 'key.pem'), certF = path.join(DATA_DIR, 'cert.pem');
    if (!fs.existsSync(keyF) || !fs.existsSync(certF)) {
      const selfsigned = require('selfsigned');
      const ips = [...Object.values(os.networkInterfaces())].flat().filter((i) => i && i.family === 'IPv4').map((i) => ({ type: 7, ip: i.address }));
      const pems = await selfsigned.generate([{ name: 'commonName', value: 'fiesta35.local' }], {
        days: 365, keySize: 2048, algorithm: 'sha256',
        extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, ...ips] }],
      });
      fs.writeFileSync(keyF, pems.private); fs.writeFileSync(certF, pems.cert);
    }
    const httpsServer = https.createServer({ key: fs.readFileSync(keyF), cert: fs.readFileSync(certF) }, handler);
    attach(httpsServer);
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒  HTTPS (cámara + sensores): ${lanUrls(true).join('  |  ')}/`);
      console.log('    (el navegador avisará de certificado no confiable: "Avanzado → Continuar")\n');
    });
  }
}
start();
