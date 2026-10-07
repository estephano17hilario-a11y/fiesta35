'use strict';
/**
 * FASE 1 — ENTRADA (25 min): registro → test "esto o aquello" → pareja por afinidad → equipos de 6 → selfie.
 * Módulo "siempre activo": las llegadas tardías pueden ocurrir en cualquier fase.
 */
const fs = require('fs');
const path = require('path');
const U = require('../util');
const M = require('../engine/matchmaker');

const id = 'entrada';
const st = (ctx) => ctx.state.g[id];
const mm = (ctx) => st(ctx).mm;
const ecfg = (ctx) => ({ ...M.DEFAULTS, ...ctx.config.entrada, waitMs: (ctx.config.entrada.waitSeconds ?? 60) * 1000 });
const opts = (ctx) => ({ cfg: ecfg(ctx), rng: Math.random, now: Date.now() });
const questions = (ctx) => (ctx.content.test && ctx.content.test.questions) || [];
const label = (g) => ({ id: g.id, name: g.alias || g.name, animal: g.animal });

const COLORS = ['negro', 'blanco', 'azul', 'rojo', 'verde', 'otro'];
const REL = ['familiar', 'colegio', 'juerga', 'victima'];
const INN = ['inocente', 'sospechoso', 'autor'];
function cleanSurvey(s = {}) {
  return {
    color: COLORS.includes(s.color) ? s.color : 'otro',
    glasses: s.glasses === true || s.glasses === 'si',
    relationship: REL.includes(s.relationship) ? s.relationship : 'juerga',
    innocence: INN.includes(s.innocence) ? s.innocence : 'inocente',
  };
}

function normalizeFav(s) { return U.norm(s).replace(/[^a-z0-9ñ]/g, ''); }

function assignAnimal(ctx) {
  const all = (ctx.content['animales-emoji'] && ctx.content['animales-emoji'].animals) || [{ emoji: '🙂', name: 'Invitado' }];
  const used = new Set([...ctx.guests.values()].map((g) => g.animal && g.animal.emoji));
  const free = all.filter((a) => !used.has(a.emoji));
  return U.pick(free.length ? free : all);
}
function assignMeet(ctx) {
  const used = new Set([...ctx.guests.values()].map((g) => g.meet));
  for (let i = 0; i < 500; i++) { const c = String(100 + Math.floor(Math.random() * 900)); if (!used.has(c)) return c; }
  return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

/* ─────────── aplicar eventos del motor al mundo real ─────────── */
function ensureName(ctx, n, force = false) {
  const team = ctx.state.teams[n];
  if (!team || team.renamed) return;
  const ids = mm(ctx).teams[n];
  if (!ids.length || (!force && team.autoNamed)) return;
  const used = Object.entries(ctx.state.teams).filter(([k]) => Number(k) !== n).map(([, t]) => t.name);
  team.name = M.teamName(mm(ctx), ids, ctx.content['nombres-equipo'], used, Math.random);
  team.autoNamed = true;
}

function startRitual(ctx, newcomerId, teamN) {
  const g = ctx.guests.get(newcomerId);
  const mates = ctx.membersOf(teamN).filter((m) => m.id !== newcomerId && !m.absent);
  const s = st(ctx);
  if (!mates.length) return;
  s.ritual[newcomerId] = { team: teamN, words: Object.fromEntries(mates.map((m) => [m.id, { word: '', ok: null }])), done: false, at: Date.now() };
  ctx.feed(`🧳 ${g.name} llegó tarde y se unió al equipo ${ctx.tableCfg(teamN).name}`, 'join');
}

function apply(ctx, events) {
  const s = st(ctx);
  for (const e of events) {
    if (e.t === 'pair') {
      for (const pid of e.members) {
        const g = ctx.guests.get(pid);
        if (!g) continue;
        g.stage = 'paired';
        ctx.db.saveGuest(g);
        ctx.vibrateGuest(pid, [200, 100, 200, 100, 400]);
      }
      s.recent.unshift({ at: Date.now(), names: e.members.map((m) => label(ctx.guests.get(m))) });
      s.recent = s.recent.slice(0, 8);
      ctx.feed(`💞 Pareja formada: ${e.members.map((m) => ctx.guests.get(m).alias || ctx.guests.get(m).name).join(' + ')}`, 'join');
    } else if (e.t === 'team') {
      for (const gid of e.ids) {
        const g = ctx.guests.get(gid);
        if (!g) continue;
        g.table = e.team; g.stage = 'team';
        if (e.late) g.late = true;
        ctx.db.saveGuest(g);
        ctx.vibrateGuest(gid, [300, 100, 300]);
        ctx.toGuest(gid, 'TEAM_ASSIGNED', { team: e.team });
      }
      ensureName(ctx, e.team);
      if (e.bank) ctx.addAura(e.team, e.bank, 'Pareja confirmada (+' + ctx.config.entrada.pairPoints + ' c/u)', 'entrada');
      if (e.late) startRitual(ctx, e.ids[0], e.team);
      ctx.feed(`🛡️ ${e.ids.map((x) => ctx.guests.get(x).alias || ctx.guests.get(x).name).join(' + ')} → ${ctx.tableCfg(e.team).name}`, 'join');
    } else if (e.t === 'move') {
      const g = ctx.guests.get(e.id);
      if (g) { g.table = e.to; ctx.db.saveGuest(g); ctx.toGuest(e.id, 'TEAM_ASSIGNED', { team: e.to }); }
    } else if (e.t === 'trio') {
      const g = ctx.guests.get(e.id);
      if (g) { g.stage = 'paired'; ctx.db.saveGuest(g); ctx.vibrateGuest(e.id, [200, 100, 200]); }
    } else if (e.t === 'pairConfirmed') {
      ctx.feed('🤝 Pareja confirmada: se presentaron', 'join');
    }
  }
  ctx.dirty();
}

function closeTeams(ctx) {
  const m = mm(ctx);
  if (m.closed) return;
  apply(ctx, M.closeTeams(m, opts(ctx)));
  for (const n of Object.keys(m.teams)) ensureName(ctx, Number(n), true);
  for (const g of ctx.guests.values()) if (m.players[g.id] && m.players[g.id].team) { g.table = m.players[g.id].team; g.stage = 'team'; ctx.db.saveGuest(g); }
  ctx.feed('🔒 Equipos cerrados', 'phase');
}

/* ─────────── API del módulo ─────────── */
module.exports = {
  id,
  always: true,
  phases: ['REGISTRATION'],
  closeTeams,

  init(ctx) {
    ctx.state.g[id] ||= { mm: M.newMM(ctx.config.tables.length), recent: [], met: {}, ritual: {}, selfieAwarded: {}, welcomeAwarded: {} };
    // reconstruir el motor si cambió el número de equipos
    const m = mm(ctx);
    for (const t of ctx.config.tables) m.teams[t.n] ||= [];
  },

  /** Registro (nombre + cosa favorita + consentimiento). Es idempotente: volver a entrar recupera la sesión. */
  register(ctx, c, p, io) {
    const name = String(p.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const fav = String(p.fav || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (name.length < 2) return io.send('REGISTER_ERROR', { message: 'Escribe tu nombre (mínimo 2 letras).' });
    let g = (p.token && [...ctx.guests.values()].find((x) => x.token === p.token)) || [...ctx.guests.values()].find((x) => U.norm(x.name) === U.norm(name));
    let kind = 'RECONNECT';
    if (!g) {
      if (fav.length < 2) return io.send('REGISTER_ERROR', { message: 'Cuéntanos tu cosa favorita (1 o 2 palabras).' });
      if (!p.consent) return io.send('REGISTER_ERROR', { message: 'Necesitamos que aceptes el aviso de fotos y videos.' });
      kind = 'CHECK_IN';
      g = {
        id: U.uid(), token: U.token(), name, alias: String(p.alias || '').trim().slice(0, 30), fav, consent: true,
        table: null, stage: 'test', animal: assignAnimal(ctx), meet: assignMeet(ctx), survey: cleanSurvey({}),
        kahootScore: 0, createdAt: Date.now(), lastSeen: Date.now(),
      };
      ctx.guests.set(g.id, g);
      ctx.toRoles(['screen'], 'GUEST_JOINED', { name: g.name, animal: g.animal });
      ctx.feed(`👋 ${g.name} ${g.animal.emoji} llegó (test pendiente)`, 'join');
    }
    io.attach(g);
    ctx.db.saveGuest(g);
    ctx.db.log(g.id, kind, c.ip, c.ua);
    io.send('REGISTERED', { token: g.token, id: g.id });
    ctx.dirty();
  },

  tick(ctx, now) {
    const m = mm(ctx);
    if (m.closed) return;
    const ev = M.tick(m, { cfg: ecfg(ctx), rng: Math.random, now });
    if (ev.length) apply(ctx, ev);
  },

  guest(ctx, g, ev, p) {
    const s = st(ctx), m = mm(ctx);

    if (ev === 'SUBMIT_TEST') {
      if (g.stage !== 'test') return true;
      const qs = questions(ctx);
      const answers = {};
      for (const q of qs) { const a = p.answers && p.answers[q.id]; if (a !== 'a' && a !== 'b') return true; answers[q.id] = a; }
      const prof = M.profile(answers, qs);
      g.answers = answers; g.vec = prof.vec; g.taste = prof.taste;
      g.survey = cleanSurvey(p.survey);
      g.stage = 'pool';
      ctx.db.saveGuest(g);
      apply(ctx, M.addPlayer(m, { id: g.id, vec: prof.vec, taste: prof.taste, answers }, opts(ctx)));
      ctx.vibrateGuest(g.id, [80]);
      ctx.feed(`✅ ${g.name} terminó el test`, 'join');
      return true;
    }

    const pl = m.players[g.id];
    if (ev === 'PAIR_CALL') { // "Llamar a mi pareja": vibra y parpadea su celular
      if (!pl || !pl.pair) return true;
      const now = Date.now();
      if (now - (g._lastCall || 0) < 2500) return true;
      g._lastCall = now;
      for (const o of m.pairs[pl.pair].members) if (o !== g.id) { ctx.vibrateGuest(o, [300, 120, 300, 120, 300]); ctx.toGuest(o, 'PAIR_CALL', { from: label(g) }); }
      return true;
    }
    if (ev === 'PAIR_SCAN') { // escanear el QR / escribir el código de 3 dígitos de la pareja
      if (!pl || !pl.pair) return true;
      const pair = m.pairs[pl.pair];
      const code = String(p.code || '').replace(/\D/g, '').slice(0, 3);
      const other = [...ctx.guests.values()].find((x) => x.meet === code);
      if (!other || other.id === g.id || !pair.members.includes(other.id)) {
        ctx.toGuest(g.id, 'TOAST', { message: other ? 'Ese no es tu pareja 😅' : 'Código no válido' });
        ctx.vibrateGuest(g.id, [200]);
        return true;
      }
      if (!s.met[pair.id]) { s.met[pair.id] = Date.now(); ctx.vibrateAll; for (const o of pair.members) ctx.vibrateGuest(o, [100, 60, 100, 60, 300]); ctx.feed('📲 Una pareja se encontró', 'join'); }
      return true;
    }
    if (ev === 'PAIR_INTRO') { // "Ya nos presentamos"
      if (!pl || !pl.pair || !s.met[pl.pair]) return true;
      apply(ctx, M.confirm(m, pl.pair, g.id, opts(ctx)));
      const pr = m.pairs[pl.pair];
      if (pr && !pr.team) for (const x of pr.members) { const og = ctx.guests.get(x); if (og && og.demo) apply(ctx, M.confirm(m, pl.pair, x, opts(ctx))); }
      return true;
    }
    if (ev === 'TEAM_RENAME') {
      const t = g.table && ctx.state.teams[g.table];
      const name = String(p.name || '').trim().slice(0, 40);
      if (!t || t.renamed || name.length < 2) return true; // una sola vez
      t.name = name; t.renamed = true;
      ctx.feed(`✏️ Un equipo se renombró: ${name}`, 'join');
      return true;
    }

    // Ritual de bienvenida (llegadas tardías): el recién llegado escribe la cosa favorita de cada integrante
    if (ev === 'WELCOME_WORD') {
      const r = s.ritual[g.id];
      const item = r && !r.done && r.words[p.memberId];
      if (!item) return true;
      item.word = String(p.word || '').trim().slice(0, 40);
      item.ok = null;
      if (item.word) ctx.toGuest(p.memberId, 'VIBRATE_TRIGGER', { pattern: [100] });
      return true;
    }
    if (ev === 'WELCOME_CONFIRM') {
      const r = s.ritual[p.newcomerId];
      const item = r && !r.done && r.words[g.id];
      if (!item || !item.word) return true;
      item.ok = !!p.ok;
      if (!item.ok) item.word = ''; // el recién llegado debe volver a preguntar
      if (Object.values(r.words).every((w) => w.ok === true)) {
        r.done = true;
        if (!s.welcomeAwarded[p.newcomerId]) {
          s.welcomeAwarded[p.newcomerId] = true;
          ctx.addAura(r.team, ctx.config.entrada.welcomePoints, `Bienvenida a ${ctx.guests.get(p.newcomerId).name}`, 'entrada');
          ctx.vibrateTable(r.team, [200, 100, 200, 100, 400]);
          ctx.feed(`🎉 Ritual de bienvenida completado (+${ctx.config.entrada.welcomePoints})`, 'join');
        }
      }
      return true;
    }
    return false;
  },

  onSelfie(ctx, g, buf) {
    const n = g.table;
    const need = ctx.config.entrada.minSelfieMembers || 4;
    if (!n) return { error: 'Aún no tienes equipo' };
    if (ctx.membersOf(n).length < need) return { error: `El equipo necesita al menos ${need} integrantes` };
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return { error: 'La foto debe ser JPEG' };
    const s = st(ctx);
    fs.writeFileSync(path.join(ctx.uploadsDir, 'selfies', `team-${n}.jpg`), buf);
    ctx.state.teams[n].selfie = `/uploads/selfies/team-${n}.jpg?v=${Date.now()}`;
    let first = false;
    if (!s.selfieAwarded[n]) {
      s.selfieAwarded[n] = true; first = true;
      ctx.addAura(n, ctx.config.entrada.selfiePoints, 'Selfie de equipo', 'entrada');
      ctx.sound('shutter');
    }
    ctx.feed(`🤳 Selfie de ${ctx.tableCfg(n).name}${first ? ' (+' + ctx.config.entrada.selfiePoints + ')' : ' (reemplazo)'}`, 'join');
    return { ok: true, first };
  },
  onMediaDeleted(ctx, kind) {
    if (kind === 'selfies') for (const t of Object.values(ctx.state.teams)) t.selfie = null;
  },

  admin(ctx, cmd, a) {
    const s = st(ctx), m = mm(ctx);
    if (cmd === 'ENTRADA_CLOSE') { closeTeams(ctx); return true; }
    if (cmd === 'ENTRADA_FORCE_PAIR') {
      const A = m.players[a.a], B = m.players[a.b];
      if (!A || !B || A.team || B.team || a.a === a.b) return true;
      for (const pid of [A.pair, B.pair]) if (pid) this.dissolve(ctx, pid, true);
      apply(ctx, [M.makePair(m, a.a, a.b, M.similarity(A, B, ecfg(ctx)), opts(ctx))]);
      return true;
    }
    if (cmd === 'ENTRADA_UNPAIR') { this.dissolve(ctx, a.pair, false); return true; }
    if (cmd === 'ENTRADA_FORCE_CONFIRM') {
      const pair = m.pairs[a.pair];
      if (pair && !pair.team) { s.met[pair.id] = s.met[pair.id] || Date.now(); for (const who of pair.members) apply(ctx, M.confirm(m, pair.id, who, opts(ctx))); }
      return true;
    }
    if (cmd === 'ENTRADA_SELFIE_DELETE') {
      const n = Number(a.team);
      try { fs.rmSync(path.join(ctx.uploadsDir, 'selfies', `team-${n}.jpg`), { force: true }); } catch { /* nada */ }
      if (ctx.state.teams[n]) ctx.state.teams[n].selfie = null;
      return true;
    }
    if (cmd === 'ENTRADA_REOPEN') { m.closed = false; return true; }
    if (cmd === 'ENTRADA_DEMO') { this.addDemo(ctx, Math.max(1, Math.min(12, Number(a.n) || 6))); return this.admin(ctx, 'ENTRADA_PAIR_NOW', {}); }
    if (cmd === 'ENTRADA_PAIR_NOW') { // empareja YA a todos los del pool (sin umbral de afinidad)
      let pool = M.poolIds(m);
      while (pool.length >= 2) {
        const best = M.bestOfPool(m, pool[0], pool, 0, ecfg(ctx));
        apply(ctx, [M.makePair(m, pool[0], best.id, best.sim, opts(ctx))]);
        pool = M.poolIds(m);
      }
      return true;
    }
    return false;
  },

  /** Jugadores de PRUEBA (sin celular) para ensayar el flujo o probar estando solo. Confirman solos cuando su pareja los confirma. */
  addDemo(ctx, n) {
    const NAMES = ['Valeria','Diego','Camila','Mateo','Sofía','Andrés','Lucía','Joaquín','Daniela','Sebastián','Fernanda','Nicolás'];
    const FAVS = ['pizza','ceviche','guitarra','chocolate','karaoke','ajedrez'];
    const qs = questions(ctx), m = mm(ctx);
    for (let i = 0; i < n; i++) {
      const base = NAMES[(ctx.guests.size + i) % NAMES.length];
      const name = `${base} (prueba ${ctx.guests.size + 1})`;
      const g = { id: U.uid(), token: U.token(), name, alias: base, fav: U.pick(FAVS), consent: true, demo: true, table: null, stage: 'pool',
        animal: assignAnimal(ctx), meet: assignMeet(ctx), survey: cleanSurvey({ color: U.pick(COLORS), glasses: Math.random() < 0.3, relationship: U.pick(REL), innocence: U.pick(INN) }),
        kahootScore: 0, createdAt: Date.now(), lastSeen: Date.now() };
      const answers = Object.fromEntries(qs.map((q) => [q.id, Math.random() < 0.5 ? 'a' : 'b']));
      const prof = M.profile(answers, qs);
      g.answers = answers; g.vec = prof.vec; g.taste = prof.taste;
      ctx.guests.set(g.id, g); ctx.db.saveGuest(g);
      apply(ctx, M.addPlayer(m, { id: g.id, vec: prof.vec, taste: prof.taste, answers }, opts(ctx)));
    }
    ctx.feed(`🤖 ${n} jugadores de prueba añadidos`, 'join');
  },

  /** Deshace una pareja que aún no entró a un equipo (los dos vuelven al pool). */
  dissolve(ctx, pid, silent) {
    const m = mm(ctx), pair = m.pairs[pid];
    if (!pair || pair.team) return;
    for (const x of pair.members) { const p = m.players[x]; p.state = 'pool'; p.pair = null; p.since = Date.now(); const g = ctx.guests.get(x); if (g) { g.stage = 'pool'; ctx.db.saveGuest(g); } }
    delete m.pairs[pid]; delete st(ctx).met[pid];
    if (!silent) for (const x of pair.members) apply(ctx, M.tick(m, { cfg: { ...ecfg(ctx), waitMs: 0 }, rng: Math.random, now: Date.now() }));
  },

  /** Admin › Jugadores: mover de equipo, renombrar, marcar ausente, eliminar. */
  adminGuestMod(ctx, a) {
    const g = ctx.guests.get(a.id);
    if (!g) return;
    const m = mm(ctx), pl = m.players[g.id];
    if (a.op === 'move' && ctx.tableCfg(a.table)) {
      const to = Number(a.table);
      if (pl) {
        if (pl.team) m.teams[pl.team] = m.teams[pl.team].filter((x) => x !== g.id);
        if (pl.state === 'pool' || pl.state === 'paired') { if (pl.pair) this.dissolve(ctx, pl.pair, true); }
        m.teams[to].push(g.id); pl.team = to; pl.state = 'team';
      }
      g.table = to; g.stage = 'team';
    }
    if (a.op === 'rename' && a.name) g.name = String(a.name).slice(0, 60);
    if (a.op === 'absent') g.absent = !g.absent;
    if (a.op === 'remove') {
      if (pl) {
        if (pl.team) m.teams[pl.team] = m.teams[pl.team].filter((x) => x !== g.id);
        if (pl.pair) this.dissolve(ctx, pl.pair, true);
        delete m.players[g.id];
      }
      ctx.guests.delete(g.id); ctx.db.deleteGuest(g.id);
      return;
    }
    ctx.db.saveGuest(g);
  },

  publicTest(ctx) {
    return questions(ctx).map((q) => ({ id: q.id, q: q.q, a: { label: q.a.label, emoji: q.a.emoji }, b: { label: q.b.label, emoji: q.b.emoji } }));
  },

  /* ───── vistas ───── */
  counts(ctx) {
    const m = mm(ctx);
    const all = [...ctx.guests.values()];
    return {
      registered: all.length,
      testing: all.filter((g) => g.stage === 'test').length,
      waiting: all.filter((g) => g.stage === 'pool').length,
      paired: all.filter((g) => g.stage === 'paired').length,
      inTeam: all.filter((g) => g.stage === 'team').length,
      pairs: Object.keys(m.pairs).length,
      closed: m.closed,
      completeTeams: Object.values(m.teams).filter((t) => t.length >= (ctx.config.entrada.cap || 6)).length,
      teams: ctx.config.tables.length,
    };
  },
  viewScreen(ctx) {
    const s = st(ctx);
    return { counts: this.counts(ctx), recent: s.recent.slice(0, 5), closed: mm(ctx).closed };
  },
  viewAdmin(ctx) {
    const m = mm(ctx), s = st(ctx);
    const pairs = Object.values(m.pairs).map((p) => ({
      id: p.id, members: p.members.map((x) => label(ctx.guests.get(x) || { id: x, name: '?' })), sim: Math.round(p.sim * 100), found: !!s.met[p.id], conf: Object.keys(p.conf).length, team: p.team, bank: p.bank,
    }));
    const pool = M.poolIds(m).map((x) => ({ ...label(ctx.guests.get(x)), since: m.players[x].since }));
    return { counts: this.counts(ctx), pairs, pool, closed: m.closed, recent: s.recent, ritual: Object.entries(s.ritual).map(([k, r]) => ({ id: k, name: (ctx.guests.get(k) || {}).name, team: r.team, done: r.done, items: Object.values(r.words).filter((w) => w.ok === true).length, total: Object.keys(r.words).length })) };
  },
  viewExtra(ctx, g) {
    const s = st(ctx);
    const out = { ritual: null, confirms: [], selfie: null };
    const r = s.ritual[g.id];
    if (r && !r.done) {
      out.ritual = {
        team: r.team,
        items: Object.entries(r.words).map(([mid, w]) => { const mg = ctx.guests.get(mid); return { memberId: mid, name: mg ? mg.alias || mg.name : '?', animal: mg && mg.animal, word: w.word, ok: w.ok }; }),
      };
    }
    for (const [nid, rr] of Object.entries(s.ritual)) {
      const w = !rr.done && rr.words[g.id];
      if (w && w.word && w.ok === null) { const ng = ctx.guests.get(nid); out.confirms.push({ newcomerId: nid, newcomer: ng ? ng.alias || ng.name : '?', animal: ng && ng.animal, word: w.word }); }
    }
    return out;
  },
  viewGuest(ctx, g) {
    const m = mm(ctx), s = st(ctx), cfg = ctx.config.entrada;
    const pl = m.players[g.id];
    const base = { stage: g.stage, meet: g.meet, closed: m.closed, counts: this.counts(ctx) };
    if (g.stage === 'test') return base;
    if (g.stage === 'pool') return { ...base, since: pl && pl.since, waitMs: (cfg.waitSeconds || 60) * 1000, alone: this.counts(ctx).waiting <= 1 };
    if (g.stage === 'paired' && pl && pl.pair) {
      const pair = m.pairs[pl.pair];
      const others = pair.members.filter((x) => x !== g.id).map((x) => ctx.guests.get(x)).filter(Boolean);
      const first = pl && m.players[others[0].id];
      return {
        ...base, pairId: pair.id, others: others.map((o) => ({ ...label(o), ...(o.demo ? { demo: true, code: o.meet } : {}) })), found: !!s.met[pair.id], myIntro: !!pair.conf[g.id],
        introDone: pair.members.filter((x) => pair.conf[x]).length, introNeeded: pair.members.length,
        icebreaker: first ? M.icebreaker(pl, first, questions(ctx)) : null, sim: Math.round(pair.sim * 100),
        trio: pair.members.length > 2,
      };
    }
    // ya tiene equipo
    const n = g.table, t = ctx.tableCfg(n), members = ctx.membersOf(n);
    return {
      ...base, team: { n, name: t.name, color: t.color, emoji: t.emoji, renamed: !!ctx.state.teams[n].renamed, selfie: ctx.state.teams[n].selfie, size: members.length, mult: ctx.multiplier(n),
        members: members.map((x) => ({ ...label(x), fav: x.fav })), canSelfie: members.length >= (cfg.minSelfieMembers || 4), selfieMin: cfg.minSelfieMembers || 4 },
    };
  },
};
