'use strict';
/**
 * FASE 2 — CAJA FUERTE (20 min, todos los equipos a la vez).
 * Cada equipo debe descifrar un código de 4 piezas en la app. NO hay cerradura electrónica: al resolverlo la app revela
 * la combinación del candado; al abrir la caja física, DENTRO hay un código que se escribe en la app y la apertura queda
 * contabilizada en tiempo real (orden, tiempo y bono).
 */
const U = require('../util');

const id = 'caja';
const st = (ctx) => ctx.state.g[id];
const cfg = (ctx) => ctx.config.caja;
const flat = (s) => U.norm(s).replace(/[^a-z0-9ñ]/g, '');

function blankTeam() {
  return { fails: 0, paid: 0, hints: {}, cooldownUntil: 0, solved: false, solvedAt: 0, value: 0, opened: false, openedAt: 0, order: 0, emoji: null, last: null, p1: null, forced: false, attempts: 0 };
}
function team(ctx, n) { return (st(ctx).teams[n] ||= blankTeam()); }

/** Pieza 1: "¿Cuántas letras tiene la cosa favorita de [Nombre]?" (dígito 3–9). */
function piece1(ctx, n) {
  const t = team(ctx, n);
  if (t.p1) return t.p1;
  const cands = ctx.membersOf(n).filter((m) => !m.absent && m.fav).map((m) => ({ m, len: flat(m.fav).length })).filter((x) => x.len >= 3 && x.len <= 9);
  if (cands.length) {
    const pick = cands[Math.floor(U.rngFrom('caja1:' + n + ':' + cands.map((c) => c.m.id).join(','))() * cands.length)];
    t.p1 = { q: `¿Cuántas letras tiene la cosa favorita de ${pick.m.alias || pick.m.name}? (sin espacios)`, a: pick.len, who: pick.m.id, auto: true };
  } else {
    const man = cfg(ctx).manualPiece1 && cfg(ctx).manualPiece1[n];
    t.p1 = man ? { q: man.q, a: Number(man.a), auto: false } : { q: 'Pregunta manual: pídele la pista 1 al anfitrión.', a: null, auto: false, pending: true };
  }
  return t.p1;
}
const riddle = (ctx, n) => { const r = (ctx.content.acertijos && ctx.content.acertijos.riddles) || []; return r.length ? r[(n - 1) % r.length] : { text: '?', answers: [], hint: '' }; };
const hintFree = (ctx) => st(ctx).freeHints || (Date.now() - ctx.state.clock.startedAt) / 60000 >= (cfg(ctx).freeHintsAfterMinutes || 15);
const prize = (ctx, t) => Math.max(cfg(ctx).minValue || 20, (cfg(ctx).baseValue || 100) - (t.fails * (cfg(ctx).failPenalty || 10)) - t.paid);

function open(ctx, n, { forced = false } = {}) {
  const s = st(ctx), t = team(ctx, n);
  if (t.opened) return;
  t.opened = true; t.openedAt = Date.now(); t.forced = forced;
  t.order = ++s.openCount;
  if (!t.solved) { t.solved = true; t.solvedAt = t.openedAt; t.value = cfg(ctx).minValue || 20; }
  const bonus = forced ? 0 : (cfg(ctx).orderBonus || [])[t.order - 1] || 0;
  const pts = t.value + bonus;
  ctx.award(n, pts, { source: 'caja', reason: `Caja fuerte #${t.order}${forced ? ' (forzada)' : ''}${bonus ? ` · bono +${bonus}` : ''}` });
  ctx.sound('latch');
  setTimeout(() => ctx.sound('fanfarria'), 700);
  ctx.vibrateTable(n, [200, 100, 200, 100, 500]);
  ctx.toTable(n, 'CAJA_OPENED', { order: t.order, pts });
  ctx.feed(`🔓 ${ctx.tableCfg(n).name} abrió la caja (#${t.order}) en ${Math.round((t.openedAt - s.startedAt) / 1000)} s`, 'game');
}

module.exports = {
  id,
  phases: ['CAJA_FUERTE'],

  init(ctx) { ctx.state.g[id] ||= { teams: {}, consumed: {}, openCount: 0, startedAt: 0, freeHints: false }; },
  enter(ctx) { const s = st(ctx); s.startedAt = Date.now(); },

  guest(ctx, g, ev, p) {
    const n = g.table;
    if (!n) return false;
    const s = st(ctx), c = cfg(ctx), t = team(ctx, n), now = Date.now();

    if (ev === 'CAJA_ATTEMPT') {
      if (t.solved) return true;
      if (now < t.cooldownUntil) { ctx.toGuest(g.id, 'CAJA_RESULT', { cooldown: Math.ceil((t.cooldownUntil - now) / 1000) }); return true; }
      const p1 = piece1(ctx, n);
      const r = riddle(ctx, n);
      const ok = [
        p1.a != null && Number(p.p1) === Number(p1.a),
        c.realEmojis.includes(p.p2) && !s.consumed[p.p2],
        r.answers.map(flat).includes(flat(p.p3 || '')),
        Number(p.p4) === Number(c.stickerDigit),
      ];
      const good = ok.filter(Boolean).length;
      t.attempts++;
      if (good === 4) {
        t.solved = true; t.solvedAt = now; t.value = prize(ctx, t); t.emoji = p.p2;
        s.consumed[p.p2] = n;
        t.last = { at: now, good: 4 };
        ctx.sound('success');
        ctx.vibrateTable(n, [100, 60, 100, 60, 300]);
        ctx.feed(`🧩 ${ctx.tableCfg(n).name} resolvió las 4 piezas (${t.fails} fallos). ¡A abrir la caja!`, 'game');
        ctx.toTable(n, 'CAJA_RESULT', { ok: true });
      } else {
        t.fails++;
        t.cooldownUntil = now + (c.cooldownSeconds || 20) * 1000;
        t.last = { at: now, good: c.showCorrectCount === false ? null : good };
        ctx.vibrateTable(n, [350]);
        ctx.sound('fail');
        ctx.toTable(n, 'CAJA_RESULT', { ok: false, good: t.last.good, cooldown: c.cooldownSeconds || 20 });
      }
      return true;
    }

    if (ev === 'CAJA_HINT') {
      const key = ['p1', 'p2', 'p3', 'p4'].includes(p.piece) ? p.piece : null;
      if (!key || t.solved || t.hints[key]) return true;
      const free = hintFree(ctx);
      let text = (c.hints && c.hints[key]) || 'Sin pista configurada.';
      if (key === 'p3') text = riddle(ctx, n).hint || text;
      t.hints[key] = { text, free };
      if (!free) t.paid += c.hintCost || 10;
      return true;
    }

    if (ev === 'CAJA_CONFIRM') { // código impreso DENTRO de la caja física
      if (!t.solved || t.opened) return true;
      if (now - (g._lastConfirm || 0) < 2500) return true;
      g._lastConfirm = now;
      const box = (c.boxes && c.boxes[n]) || {};
      if (box.confirmCode && flat(p.code || '') === flat(box.confirmCode)) open(ctx, n);
      else { ctx.toGuest(g.id, 'TOAST', { message: 'Ese código no coincide con el de tu caja 🤔' }); ctx.vibrateGuest(g.id, [250]); }
      return true;
    }
    return false;
  },

  admin(ctx, cmd, a) {
    const s = st(ctx);
    const n = Number(a.team);
    if (cmd === 'CAJA_OPEN') { open(ctx, n, { forced: !team(ctx, n).solved }); return true; }
    if (cmd === 'CAJA_HINT_SEND') {
      const text = String(a.text || '').slice(0, 160);
      if (text) { const t = team(ctx, n); t.hints['admin' + Date.now()] = { text, free: true, admin: true }; ctx.toTable(n, 'TOAST', { message: '💡 Pista del anfitrión: ' + text }); ctx.vibrateTable(n, [100, 60, 100]); }
      return true;
    }
    if (cmd === 'CAJA_FREE_HINTS') { s.freeHints = !s.freeHints; return true; }
    if (cmd === 'CAJA_P1') { const t = team(ctx, n); t.p1 = { q: String(a.q || ''), a: Number(a.a), auto: false }; return true; }
    if (cmd === 'CAJA_RESET') { const t = s.teams[n]; if (t) { for (const [e, who] of Object.entries(s.consumed)) if (who === n) delete s.consumed[e]; delete s.teams[n]; } return true; }
    return false;
  },

  force(ctx) {
    for (const t of ctx.config.tables) if (ctx.membersOf(t.n).length && !team(ctx, t.n).opened) open(ctx, t.n, { forced: true });
  },

  board(ctx, forAdmin) {
    const s = st(ctx), c = cfg(ctx), now = Date.now();
    const teams = {};
    for (const tc of ctx.config.tables) {
      const n = tc.n, t = s.teams[n] || blankTeam();
      teams[n] = {
        fails: t.fails, solved: t.solved, opened: t.opened, order: t.order, forced: t.forced,
        secs: t.opened ? Math.round((t.openedAt - s.startedAt) / 1000) : null, attempts: t.attempts,
        ...(forAdmin ? { prize: prize(ctx, t), hints: Object.values(t.hints).length } : {}),
      };
    }
    // los 6 emojis reales: los libres NO se revelan; los consumidos sí (con el equipo que los usó)
    const emojis = c.realEmojis.map((e) => (s.consumed[e] ? { emoji: e, team: s.consumed[e] } : { emoji: null }));
    return { teams, emojis, openCount: s.openCount, startedAt: s.startedAt, free: hintFree(ctx), force: (Date.now() - s.startedAt) / 60000 >= (c.forceAfterMinutes || 20) };
  },
  viewScreen(ctx) { return this.board(ctx, false); },

  viewAdmin(ctx) {
    const c = cfg(ctx);
    const secrets = {};
    for (const tc of ctx.config.tables) {
      const n = tc.n;
      if (!ctx.membersOf(n).length) continue;
      const p1 = piece1(ctx, n), r = riddle(ctx, n), t = team(ctx, n);
      secrets[n] = { p1: p1.a, p1q: p1.q, p1pending: !!p1.pending, p3: r.answers[0], p4: c.stickerDigit, lock: (c.boxes[n] || {}).lockCode, confirm: (c.boxes[n] || {}).confirmCode, emoji: t.emoji, hintTexts: Object.values(t.hints).map((h) => h.text) };
    }
    return { ...this.board(ctx, true), secrets, realEmojis: c.realEmojis };
  },

  viewGuest(ctx, g) {
    const n = g.table, c = cfg(ctx), s = st(ctx);
    if (!n) return { none: true };
    const t = team(ctx, n);
    const p1 = piece1(ctx, n), r = riddle(ctx, n), now = Date.now();
    return {
      ...this.board(ctx, false),
      mine: { fails: t.fails, solved: t.solved, opened: t.opened, order: t.order, prize: t.solved ? t.value : prize(ctx, t), cooldownUntil: t.cooldownUntil, last: t.last, hints: t.hints, emoji: t.emoji, secs: t.opened ? Math.round((t.openedAt - s.startedAt) / 1000) : null },
      pieces: { p1: p1.q, p1pending: !!p1.pending, p3: r.text, p4: 'Es el número (0 a 9) del sticker que se mandó al grupo de WhatsApp.', grid: U.shuffle(c.emojiGrid, U.rngFrom('emoji-grid')) },
      lockCode: t.solved ? (c.boxes[n] || {}).lockCode || null : null,
      hintCost: c.hintCost || 10, showCount: c.showCorrectCount !== false,
    };
  },
};
