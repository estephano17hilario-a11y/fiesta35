'use strict';
// JUEGO 6 — Farmeo de Aura (modo casino): apuestas por mesa en trivias, duelos y ruleta final.
// Todas las liquidaciones pasan por ctx.addAura dentro de una transacción SQL (nadie gasta más de lo que tiene).
const id = 'aura';
const st = (ctx) => ctx.state.g[id];
const PCT = { PERCENT_20: 0.2, PERCENT_50: 0.5, ALL_IN: 1 };

function blank() {
  return { kind: null, status: 'idle', round: 0, qIdx: -1, question: null, duel: null, bets: {}, votes: {}, startedAt: 0, endsAt: 0, seconds: 20, result: null, spin: null, history: [] };
}

function resetRound(s, kind, round) {
  Object.assign(s, { kind, round, status: 'betting', bets: {}, votes: {}, result: null, spin: null, question: null, startedAt: 0, endsAt: 0 });
}

function majority(votes) {
  const count = {};
  let best = null;
  for (const v of Object.values(votes || {})) {
    count[v] = (count[v] || 0) + 1;
    if (best == null || count[v] > count[best]) best = v;
  }
  return best == null ? null : Number(best);
}

function settle(ctx, evaluate, label, extra = {}) {
  const s = st(ctx);
  const rows = [];
  ctx.db.transaction(() => {
    for (const [t, bet] of Object.entries(s.bets)) {
      const ev = evaluate(Number(t), bet);
      const have = ctx.state.aura[t] || 0;
      const delta = ev.win ? ev.gain : -Math.min(bet.amount, have);
      ctx.addAura(Number(t), delta, `Farmeo: ${label}`, "farmeo");
      ctx.db.bet(Number(t), s.round, bet.type, bet.amount, JSON.stringify({ pick: bet.pick, ...ev.detail }), ev.win ? 'WON' : 'LOST');
      rows.push({ table: Number(t), amount: bet.amount, win: ev.win, delta, ...ev.detail });
    }
  });
  rows.sort((a, b) => b.delta - a.delta);
  s.status = 'settled';
  s.result = { label, rows, ...extra };
  s.history.unshift({ at: Date.now(), label, kind: s.kind, rows: rows.map((r) => ({ table: r.table, delta: r.delta })) });
  s.history = s.history.slice(0, 12);
  const winners = rows.filter((r) => r.win).length;
  ctx.sound(winners ? 'success' : 'trombon');
  ctx.feed(`🎰 ${label}: ${winners} mesa(s) ganaron, ${rows.length - winners} perdieron`, 'game');
}

function settleTrivia(ctx) {
  const s = st(ctx), q = s.question;
  if (!q || s.status !== 'question') return;
  settle(ctx, (t, bet) => {
    const choice = majority(s.votes[t]);
    const win = choice === q.correct;
    return { win, gain: bet.amount, detail: { choice } };
  }, 'Trivia', { correct: q.correct });
}

function settleDuel(ctx, winner) {
  const s = st(ctx), mult = ctx.config.aura.duelMultiplier || 1.8;
  const name = winner === 'A' ? s.duel.a : s.duel.b;
  settle(ctx, (t, bet) => ({ win: bet.pick === winner, gain: Math.round(bet.amount * (mult - 1)), detail: {} }), `Duelo (${s.duel.a} vs ${s.duel.b})`, { winner, winnerName: name });
}

function settleRoulette(ctx) {
  const s = st(ctx), segs = ctx.config.aura.roulette;
  const seg = segs.find((x) => x.id === s.spin.seg);
  settle(ctx, (t, bet) => ({ win: bet.pick === seg.id, gain: Math.round(bet.amount * (seg.mult - 1)), detail: {} }), 'Ruleta', { seg: seg.id, mult: seg.mult });
}

module.exports = {
  id,
  phases: ['FARMEO_AURA'],

  init(ctx) { ctx.state.g[id] ||= blank(); },
  enter(ctx) { /* el estado persiste entre entradas a la fase */ },

  tick(ctx, now) {
    const s = st(ctx);
    if (s.status === 'question' && now >= s.endsAt) { settleTrivia(ctx); ctx.dirty(); }
    if (s.status === 'spinning' && now >= s.spin.revealAt) { settleRoulette(ctx); ctx.dirty(); }
  },

  guest(ctx, g, ev, p) {
    const s = st(ctx), t = g.table;
    if (!t) return false;
    if (ev === 'PLACE_AURA_BET') {
      if (s.status !== 'betting' || s.bets[t] || !PCT[p.type]) return false;
      const aura = ctx.state.aura[t] || 0;
      const amount = p.type === 'ALL_IN' ? aura : Math.max(aura > 0 ? 1 : 0, Math.floor(aura * PCT[p.type]));
      let pick = null;
      if (s.kind === 'duel') { if (p.pick !== 'A' && p.pick !== 'B') return false; pick = p.pick; }
      if (s.kind === 'roulette') { if (!ctx.config.aura.roulette.some((x) => x.id === p.pick)) return false; pick = p.pick; }
      s.bets[t] = { type: p.type, amount, pick, by: g.alias || g.name, at: Date.now() };
      ctx.db.bet(t, s.round, p.type, amount, JSON.stringify({ pick }), 'PENDING');
      ctx.vibrateTable(t, [80]);
      ctx.feed(`🎲 ${ctx.tableCfg(t).name} apostó ${amount} (${p.type === 'ALL_IN' ? 'ALL-IN' : Math.round(PCT[p.type] * 100) + '%'})`, 'aura');
      return true;
    }
    if (ev === 'AURA_ANSWER') {
      if (s.status !== 'question') return false;
      const c = Number(p.choice);
      if (!(c >= 0 && c < s.question.options.length)) return false;
      (s.votes[t] ||= {})[g.id] = c;
      return true;
    }
    return false;
  },

  admin(ctx, cmd, a) {
    const s = st(ctx), cfg = ctx.config.aura;
    switch (cmd) {
      case 'AURA_TRIVIA_NEW': {
        s.qIdx = (s.qIdx + 1) % cfg.trivia.length;
        resetRound(s, 'trivia', 1);
        s.pending = s.qIdx; // la pregunta se revela después de las apuestas
        ctx.sound('whoosh'); ctx.vibrateAll([60]);
        return true;
      }
      case 'AURA_SHOW_QUESTION': {
        if (s.kind !== 'trivia' || s.status !== 'betting') return true;
        s.question = cfg.trivia[s.qIdx];
        s.status = 'question';
        s.seconds = cfg.questionSeconds || 20;
        s.startedAt = Date.now();
        s.endsAt = s.startedAt + s.seconds * 1000;
        ctx.sound('tick'); ctx.vibrateAll([60]);
        return true;
      }
      case 'AURA_LOCK': {
        if (s.status === 'question') settleTrivia(ctx);
        else if (s.status === 'betting' && s.kind !== 'trivia') s.status = 'locked';
        return true;
      }
      case 'AURA_DUEL_NEW': {
        resetRound(s, 'duel', 2);
        s.duel = { a: String(a.a || 'Jugador A').slice(0, 40), b: String(a.b || 'Jugador B').slice(0, 40) };
        ctx.sound('whoosh');
        return true;
      }
      case 'AURA_DUEL_WINNER': {
        if (s.kind === 'duel' && (s.status === 'betting' || s.status === 'locked') && (a.winner === 'A' || a.winner === 'B')) settleDuel(ctx, a.winner);
        return true;
      }
      case 'AURA_ROULETTE_NEW': {
        resetRound(s, 'roulette', 3);
        ctx.sound('whoosh');
        return true;
      }
      case 'AURA_SPIN': {
        if (s.kind !== 'roulette' || (s.status !== 'betting' && s.status !== 'locked')) return true;
        const segs = cfg.roulette;
        let r = Math.random() * segs.reduce((x, y) => x + y.weight, 0);
        let seg = segs[segs.length - 1];
        for (const x of segs) { if ((r -= x.weight) < 0) { seg = x; break; } }
        const now = Date.now();
        s.status = 'spinning';
        s.spin = { seg: seg.id, at: now, revealAt: now + 7000, r: 0.15 + Math.random() * 0.7 };
        ctx.sound('redoble');
        return true;
      }
      case 'AURA_CLEAR': { Object.assign(s, { kind: null, status: 'idle', bets: {}, votes: {}, result: null, spin: null, question: null }); return true; }
      default: return false;
    }
  },

  force(ctx) { const s = st(ctx); if (s.status === 'question') settleTrivia(ctx); },

  view(ctx, g) {
    const s = st(ctx), cfg = ctx.config.aura;
    const locked = s.status !== 'betting';
    const bets = {};
    for (const [t, b] of Object.entries(s.bets)) bets[t] = { type: b.type, amount: b.amount, by: b.by, ...(locked ? { pick: b.pick } : {}) };
    const votesPer = {};
    for (const [t, v] of Object.entries(s.votes)) votesPer[t] = Object.keys(v).length;
    const q = s.question && (s.status === 'question' || s.status === 'settled')
      ? { q: s.question.q, options: s.question.options, ...(s.status === 'settled' ? { correct: s.question.correct } : {}) } : null;
    const out = {
      kind: s.kind, status: s.status, round: s.round, duel: s.duel, bets, votesPer,
      startedAt: s.startedAt, endsAt: s.endsAt, seconds: s.seconds, question: q,
      roulette: cfg.roulette.map(({ id: i, label, color, weight, mult }) => ({ id: i, label, color, weight, mult })),
      spin: s.spin, result: s.result, history: s.history.slice(0, 6), multiplier: cfg.duelMultiplier || 1.8,
      triviaCount: cfg.trivia.length,
    };
    if (g) {
      const t = g.table;
      out.myBet = s.bets[t] || null;
      out.myAura = ctx.state.aura[t] || 0;
      out.myVote = (s.votes[t] || {})[g.id] ?? null;
      const tv = {};
      for (const v of Object.values(s.votes[t] || {})) tv[v] = (tv[v] || 0) + 1;
      out.tableVotes = tv;
    }
    return out;
  },
  viewScreen(ctx) { return this.view(ctx, null); },
  viewAdmin(ctx) {
    const s = st(ctx);
    return { ...this.view(ctx, null), nextQ: ctx.config.aura.trivia[(s.qIdx + 1) % ctx.config.aura.trivia.length].q, curQ: s.qIdx >= 0 ? ctx.config.aura.trivia[s.qIdx] : null };
  },
  viewGuest(ctx, g) { return this.view(ctx, g); },
};
