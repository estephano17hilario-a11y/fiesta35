'use strict';
// Ceremonia de Premiación: el anfitrión revela paso a paso (el servidor solo envía lo ya revelado).
const id = 'ceremonia';
const st = (ctx) => ctx.state.g[id];
const MAX_STEP = 4;

module.exports = {
  id,
  phases: ['CEREMONIA'],

  init(ctx) { ctx.state.g[id] ||= { step: 0 }; },
  enter(ctx) { st(ctx).step = 0; },

  admin(ctx, cmd, a) {
    const s = st(ctx);
    if (cmd !== 'CEREMONY_STEP') return false;
    const next = a.set != null ? Number(a.set) : s.step + (Number(a.delta) || 1);
    s.step = Math.max(0, Math.min(MAX_STEP, next));
    if (s.step > 0) ctx.sound(s.step === MAX_STEP ? 'fanfarria' : 'redoble');
    return true;
  },

  force(ctx) { st(ctx).step = MAX_STEP; },

  viewScreen(ctx) {
    const s = st(ctx);
    const tables = ctx.config.tables
      .map((t) => ({ n: t.n, name: t.name, color: t.color, emoji: t.emoji, aura: ctx.state.aura[t.n] || 0 }))
      .sort((a, b) => b.aura - a.aura);
    const kahoot = [...ctx.guests.values()]
      .map((g) => ({ name: g.alias || g.name, table: g.table, score: g.kahootScore || 0 }))
      .sort((a, b) => b.score - a.score).slice(0, 3);
    // posiciones reveladas: paso 2 = 3.º, 3 = 2.º, 4 = 1.º
    const podium = {};
    if (s.step >= 2 && tables[2]) podium[3] = tables[2];
    if (s.step >= 3 && tables[1]) podium[2] = tables[1];
    if (s.step >= 4 && tables[0]) podium[1] = tables[0];
    return {
      step: s.step, max: MAX_STEP, podium,
      kahoot: s.step >= 1 ? kahoot : [],
      stars: ctx.state.stars,
      ranking: s.step >= MAX_STEP ? tables : [],
    };
  },
};
