'use strict';
// JUEGO 7 — La Estatua Colectiva: ≥90 % de los celulares inmóviles durante 15 s continuos, 3 rondas.
const U = require('../util');

const id = 'estatua';
const st = (ctx) => ctx.state.g[id];
const DISTRACTIONS = ['gallina', 'bocina', 'risa', 'trombon', 'pedo', 'aplausos'];
const FRESH_MS = 1500; // un teléfono cuenta si reportó en el último 1.5 s

function blank() {
  return { status: 'idle', successes: 0, attempts: 0, readyUntil: 0, startedAt: 0, maxEndsAt: 0, holdMs: 0, lastEval: 0, ticks: {}, series: [], participants: 0, movingPct: 0, best: 0, nextDistraction: 0 };
}

module.exports = {
  id,
  phases: ['ESTATUA'],

  init(ctx) { ctx.state.g[id] ||= blank(); },
  enter(ctx) { const s = st(ctx); if (s.status !== 'done') Object.assign(s, { status: 'idle', holdMs: 0, series: [] }); },

  tick(ctx, now) {
    const s = st(ctx), cfg = ctx.config.estatua;
    if (s.status === 'ready' && now >= s.readyUntil) {
      Object.assign(s, { status: 'still', startedAt: now, maxEndsAt: now + (cfg.maxSeconds || 50) * 1000, holdMs: 0, lastEval: now, series: [], best: 0, nextDistraction: now + 3000 + Math.random() * 3000 });
      ctx.sound('start');
      ctx.dirty();
      return;
    }
    if (s.status !== 'still' || ctx.state.clock.paused) return;

    const dt = Math.min(500, now - s.lastEval);
    if (dt < 190) return;
    s.lastEval = now;

    const fresh = Object.values(s.ticks).filter((t) => now - t.at < FRESH_MS);
    const moving = fresh.filter((t) => t.m).length;
    s.participants = fresh.length;
    s.movingPct = fresh.length ? Math.round((moving / fresh.length) * 100) : 0;
    const okRatio = fresh.length > 0 && (fresh.length - moving) / fresh.length >= (cfg.tolerance || 0.9);
    s.holdMs = okRatio ? s.holdMs + dt : 0;
    s.best = Math.max(s.best, s.holdMs);
    const avgV = fresh.length ? fresh.reduce((a, t) => a + t.v, 0) / fresh.length : 0;
    s.series.push({ m: s.movingPct, v: Math.round(avgV * 100) / 100 });
    if (s.series.length > 90) s.series.shift();

    if (cfg.distractions !== false && now >= s.nextDistraction) {
      ctx.sound(U.pick(DISTRACTIONS));
      s.nextDistraction = now + 2500 + Math.random() * 3500;
    }

    if (s.holdMs >= (cfg.holdSeconds || 15) * 1000) {
      s.successes += 1;
      s.attempts += 1;
      if (s.successes >= (cfg.rounds || 3)) {
        s.status = 'done';
        ctx.star('estatua');
        ctx.sound('fanfarria');
        ctx.vibrateAll([100, 50, 100, 50, 400]);
        ctx.feed('🗿 ¡La Estatua Colectiva superada! (3/3)', 'game');
      } else {
        s.status = 'success';
        ctx.sound('success');
        ctx.feed(`🗿 Ronda ${s.successes} superada`, 'game');
      }
    } else if (now >= s.maxEndsAt) {
      s.status = 'fail';
      s.attempts += 1;
      ctx.sound('trombon');
      ctx.feed('🗿 La estatua se movió… ronda fallida', 'game');
    }
    ctx.dirty();
  },

  guest(ctx, g, ev, p) {
    if (ev !== 'MOTION_SENSOR_TICK') return false;
    const s = st(ctx);
    s.ticks[g.id] = { m: !!(p.is_moving ?? p.moving), v: U.clamp(Number(p.v) || 0, 0, 50), at: Date.now() };
    return false; // no forzar snapshot: el bucle principal ya refresca
  },

  admin(ctx, cmd) {
    const s = st(ctx), cfg = ctx.config.estatua;
    if (cmd === 'ESTATUA_START') {
      if (s.status === 'done') return true;
      Object.assign(s, { status: 'ready', readyUntil: Date.now() + (cfg.readySeconds || 6) * 1000, holdMs: 0, series: [] });
      ctx.vibrateAll([100]);
      ctx.sound('whoosh');
      return true;
    }
    if (cmd === 'ESTATUA_STOP') { if (s.status === 'still' || s.status === 'ready') s.status = 'fail'; return true; }
    if (cmd === 'ESTATUA_RESET') { Object.assign(s, blank()); return true; }
    return false;
  },

  force(ctx) {
    const s = st(ctx);
    if (s.status === 'done') return;
    s.status = 'done'; s.successes = ctx.config.estatua.rounds || 3;
    ctx.star('estatua'); ctx.sound('fanfarria');
  },

  viewScreen(ctx) {
    const s = st(ctx), cfg = ctx.config.estatua;
    return {
      status: s.status, successes: s.successes, rounds: cfg.rounds || 3, attempts: s.attempts,
      readyUntil: s.readyUntil, startedAt: s.startedAt, maxEndsAt: s.maxEndsAt,
      holdMs: s.holdMs, holdTarget: (cfg.holdSeconds || 15) * 1000, participants: s.participants,
      movingPct: s.movingPct, tolerancePct: Math.round((1 - (cfg.tolerance || 0.9)) * 100), series: s.series.slice(-60), best: s.best,
      held: s.status === 'still' ? s.holdMs : 0,
    };
  },
  viewAdmin(ctx) { return this.viewScreen(ctx); },
  viewGuest(ctx) {
    const v = this.viewScreen(ctx);
    return { ...v, series: [], threshold: ctx.config.estatua.threshold || 1.8 };
  },
};
