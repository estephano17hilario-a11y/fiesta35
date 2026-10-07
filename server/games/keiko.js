'use strict';
// JUEGO 4 — Descarga a la Madre de Keiko: energía cinética colectiva (acelerómetro) en una ventana de 20 s.
const U = require('../util');

const id = 'keiko';
const st = (ctx) => ctx.state.g[id];

function top(ctx, s, n = 5) {
  return Object.entries(s.perGuest)
    .map(([gid, e]) => { const g = ctx.guests.get(gid); return g ? { name: g.alias || g.name, table: g.table, energy: e } : null; })
    .filter(Boolean).sort((a, b) => b.energy - a.energy).slice(0, n);
}

module.exports = {
  id,
  phases: ['DESCARGA_MADRE_KEIKO'],

  init(ctx) { ctx.state.g[id] ||= { status: 'idle', startedAt: 0, endsAt: 0, energy: 0, target: 0, perGuest: {}, last: {}, attempts: 0 }; },
  enter(ctx) { const s = st(ctx); if (s.status !== 'success') Object.assign(s, { status: 'idle', energy: 0, perGuest: {} }); },

  tick(ctx, now) {
    const s = st(ctx);
    if (s.status === 'live' && now >= s.endsAt) {
      s.status = 'fail';
      ctx.sound('fail');
      ctx.feed(`⚡ Descarga insuficiente (${Math.round((s.energy / s.target) * 100)}%)`, 'game');
      ctx.dirty();
    }
  },

  guest(ctx, g, ev, p) {
    if (ev !== 'SHAKE_PULSE' && ev !== 'SHAKE_TICK') return false;
    const s = st(ctx);
    if (s.status !== 'live') return false;
    const now = Date.now();
    if (now - (s.last[g.id] || 0) < 120) return false; // anti-spam: máx ~8 pulsos/s por teléfono
    s.last[g.id] = now;
    const power = U.clamp(Math.floor(Number(p.power) || 0), 0, 10);
    if (!power) return false;
    s.energy += power;
    s.perGuest[g.id] = (s.perGuest[g.id] || 0) + power;
    if (s.energy >= s.target) {
      s.status = 'success';
      s.energy = s.target;
      ctx.star('keiko');
      ctx.sound('fanfarria');
      ctx.vibrateAll([100, 50, 100, 50, 400]);
      ctx.toRoles(['screen', 'guest'], 'DEFIBRILLATOR_SUCCESS', {});
      ctx.feed('⚡ ¡DESCARGA EXITOSA! La Madre de Keiko despertó', 'game');
    }
    return true;
  },

  admin(ctx, cmd) {
    const s = st(ctx), cfg = ctx.config.keiko;
    if (cmd === 'KEIKO_START') {
      const n = Math.max(1, ctx.onlineGuests().length);
      Object.assign(s, { status: 'live', startedAt: Date.now(), endsAt: Date.now() + (cfg.seconds || 20) * 1000, energy: 0, perGuest: {}, last: {}, target: n * (cfg.perPlayerTarget || 200), attempts: s.attempts + 1 });
      ctx.sound('zap');
      ctx.vibrateAll([200, 100, 200]);
      ctx.feed(`⚡ ¡Descarga iniciada! Objetivo ${s.target} con ${n} jugadores`, 'game');
      return true;
    }
    if (cmd === 'KEIKO_RESET') { Object.assign(s, { status: 'idle', energy: 0, perGuest: {} }); return true; }
    return false;
  },

  force(ctx) {
    const s = st(ctx);
    if (s.status === 'success') return;
    s.status = 'success'; s.target = s.target || 1; s.energy = s.target;
    ctx.star('keiko'); ctx.sound('fanfarria');
    ctx.toRoles(['screen', 'guest'], 'DEFIBRILLATOR_SUCCESS', {});
  },

  viewScreen(ctx) {
    const s = st(ctx), cfg = ctx.config.keiko;
    return {
      status: s.status, endsAt: s.endsAt, startedAt: s.startedAt, seconds: cfg.seconds || 20,
      energy: s.energy, target: s.target, pct: s.target ? Math.min(100, Math.round((s.energy / s.target) * 100)) : 0,
      top: top(ctx, s), videoUrl: cfg.videoUrl || '', message: cfg.message, attempts: s.attempts,
    };
  },
  viewAdmin(ctx) { return this.viewScreen(ctx); },
  viewGuest(ctx, g) {
    const s = st(ctx), cfg = ctx.config.keiko;
    return { ...this.viewScreen(ctx), mine: s.perGuest[g.id] || 0, threshold: cfg.threshold || 12 };
  },
};
