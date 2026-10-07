'use strict';
// JUEGO 5 — Kahoot: ¿Quién conoce más a Gianella? Trivia individual con puntuación por velocidad.
const id = 'kahoot';
const st = (ctx) => ctx.state.g[id];

function ranking(ctx) {
  return [...ctx.guests.values()]
    .map((g) => ({ id: g.id, name: g.alias || g.name, table: g.table, score: g.kahootScore || 0 }))
    .sort((a, b) => b.score - a.score);
}

function startQuestion(ctx, idx) {
  const s = st(ctx), qs = ctx.config.kahoot.questions;
  s.q = idx; s.status = 'question'; s.answers = {};
  s.startedAt = Date.now();
  s.seconds = qs[idx].seconds || ctx.config.kahoot.questionSeconds || 20;
  s.endsAt = s.startedAt + s.seconds * 1000;
  ctx.sound('whoosh');
  ctx.vibrateAll([60]);
}

function reveal(ctx) {
  const s = st(ctx), q = ctx.config.kahoot.questions[s.q];
  if (!q || s.status !== 'question') return;
  s.status = 'reveal';
  s.revealAt = Date.now();
  const dist = q.options.map(() => 0);
  for (const [gid, a] of Object.entries(s.answers)) {
    dist[a.c]++;
    const g = ctx.guests.get(gid);
    if (g && a.s) { g.kahootScore = (g.kahootScore || 0) + a.s; ctx.db.saveGuest(g); }
  }
  s.dist = dist;
  s.top = ranking(ctx).slice(0, 5);
  ctx.sound(Object.values(s.answers).some((a) => a.s) ? 'success' : 'fail');
}

module.exports = {
  id,
  phases: ['KAHOOT'],

  init(ctx) { ctx.state.g[id] ||= { q: -1, status: 'idle', answers: {}, startedAt: 0, endsAt: 0, seconds: 20, auto: false, dist: [], top: [] }; },

  tick(ctx, now) {
    const s = st(ctx);
    if (s.status === 'question') {
      const online = ctx.onlineGuests().length;
      if (now >= s.endsAt || (online > 0 && Object.keys(s.answers).length >= online && now - s.startedAt > 1500)) { reveal(ctx); ctx.dirty(); }
    } else if (s.status === 'reveal' && s.auto && now - s.revealAt > (ctx.config.kahoot.revealSeconds || 7) * 1000) {
      this.admin(ctx, 'KAHOOT_NEXT', {}); ctx.dirty();
    }
  },

  guest(ctx, g, ev, p) {
    if (ev !== 'SUBMIT_KAHOOT_ANSWER') return false;
    const s = st(ctx);
    const q = ctx.config.kahoot.questions[s.q];
    if (s.status !== 'question' || !q || Number(p.q) !== s.q || s.answers[g.id]) return false;
    const c = Number(p.choice);
    if (!(c >= 0 && c < q.options.length)) return false;
    const t = Math.min(s.seconds, Math.max(0, (Date.now() - s.startedAt) / 1000));
    const correct = c === q.correct;
    // Score = ROUND(1000 × (1 − t / (2·T)))  → 1000 pts al instante, 500 pts en el último segundo.
    const score = correct ? Math.round(1000 * (1 - t / (2 * s.seconds))) : 0;
    s.answers[g.id] = { c, t, s: score };
    return true;
  },

  admin(ctx, cmd) {
    const s = st(ctx), qs = ctx.config.kahoot.questions;
    if (cmd === 'KAHOOT_NEXT') {
      if (s.status === 'question') { reveal(ctx); return true; }
      if (s.status === 'final') return true;
      if (s.q + 1 >= qs.length) { s.status = 'final'; s.top = ranking(ctx).slice(0, 5); s.q = qs.length; ctx.sound('fanfarria'); return true; }
      startQuestion(ctx, s.q + 1);
      return true;
    }
    if (cmd === 'KAHOOT_AUTO') { s.auto = !s.auto; return true; }
    if (cmd === 'KAHOOT_RESET') {
      for (const g of ctx.guests.values()) { g.kahootScore = 0; ctx.db.saveGuest(g); }
      Object.assign(s, { q: -1, status: 'idle', answers: {}, dist: [], top: [] });
      return true;
    }
    return false;
  },

  force(ctx) { const s = st(ctx); s.status = 'final'; s.top = ranking(ctx).slice(0, 5); },

  qPublic(ctx, withAnswer) {
    const s = st(ctx), q = ctx.config.kahoot.questions[s.q];
    if (!q) return null;
    return { q: q.q, options: q.options, image: q.image || '', ...(withAnswer ? { correct: q.correct } : {}) };
  },

  viewScreen(ctx) {
    const s = st(ctx), qs = ctx.config.kahoot.questions;
    const showAns = s.status === 'reveal';
    return {
      status: s.status, q: s.q, total: qs.length, startedAt: s.startedAt, endsAt: s.endsAt, seconds: s.seconds, auto: s.auto,
      question: this.qPublic(ctx, showAns), answered: Object.keys(s.answers).length, online: ctx.onlineGuests().length,
      dist: showAns ? s.dist : [], top: s.status === 'reveal' || s.status === 'final' ? s.top : [],
      winner: s.status === 'final' ? (s.top[0] || null) : null,
    };
  },
  viewAdmin(ctx) {
    const s = st(ctx);
    const q = ctx.config.kahoot.questions[s.q];
    return { ...this.viewScreen(ctx), correctIdx: q ? q.correct : null };
  },
  viewGuest(ctx, g) {
    const s = st(ctx);
    const a = s.answers[g.id];
    const pos = ranking(ctx).findIndex((r) => r.id === g.id) + 1;
    return {
      ...this.viewScreen(ctx),
      myAnswer: a ? a.c : null,
      result: s.status === 'reveal' || s.status === 'final' ? { score: a ? a.s : 0, correct: a ? a.s > 0 : false, total: g.kahootScore || 0, rank: pos } : null,
      myTotal: g.kahootScore || 0, myRank: pos,
    };
  },
};
