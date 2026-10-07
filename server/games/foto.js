'use strict';
// JUEGO 9 — La Foto Loca Exprés: misiones secretas según la micro-encuesta, cuenta regresiva y 2 disparos.
const U = require('../util');

const id = 'foto';
const st = (ctx) => ctx.state.g[id];

function blank() {
  return { status: 'idle', readEndsAt: 0, countEndsAt: 0, shotAt: 0, poseEndsAt: 0, shots: 0, missions: {} };
}

function missionFor(ctx, g) {
  const cfg = ctx.config.foto, sv = g.survey || {};
  const applicable = [];
  if (sv.relationship === 'familiar') applicable.push(cfg.familyMission);
  if (sv.glasses) applicable.push(cfg.glassesMission);
  if (sv.color === 'negro') applicable.push(cfg.blackMission);
  const rnd = U.rngFrom(g.id + ':foto');
  return applicable.length ? U.pick(applicable, rnd) : U.pick(cfg.random, rnd);
}

function startReading(ctx) {
  const s = st(ctx), cfg = ctx.config.foto;
  s.missions = {};
  for (const g of ctx.guests.values()) {
    s.missions[g.id] = missionFor(ctx, g);
    ctx.toGuest(g.id, 'SECRET_MISSION_ASSIGNED', { mission: s.missions[g.id] });
  }
  Object.assign(s, { status: 'reading', readEndsAt: Date.now() + (cfg.readSeconds || 60) * 1000, shots: 0 });
  ctx.vibrateAll([200, 100, 200]);
  ctx.sound('whoosh');
}

function startCountdown(ctx) {
  const s = st(ctx), cfg = ctx.config.foto;
  Object.assign(s, { status: 'countdown', countEndsAt: Date.now() + (cfg.countdownSeconds || 10) * 1000 });
}

function shoot(ctx, n) {
  const s = st(ctx);
  s.status = n === 1 ? 'shot1' : 'shot2';
  s.shotAt = Date.now();
  s.shots = n;
  ctx.sound('shutter');
  ctx.vibrateAll([300]);
}

module.exports = {
  id,
  phases: ['FOTO_LOCA'],

  init(ctx) { ctx.state.g[id] ||= blank(); },

  tick(ctx, now) {
    const s = st(ctx), cfg = ctx.config.foto;
    if (ctx.state.clock.paused) return;
    switch (s.status) {
      case 'reading': if (now >= s.readEndsAt) { startCountdown(ctx); ctx.dirty(); } break;
      case 'countdown': if (now >= s.countEndsAt) { shoot(ctx, 1); ctx.dirty(); } break;
      case 'shot1': if (now - s.shotAt > 2500) { s.status = 'pose2'; s.poseEndsAt = now + (cfg.posePauseSeconds || 6) * 1000; ctx.sound('whoosh'); ctx.dirty(); } break;
      case 'pose2': if (now >= s.poseEndsAt) { shoot(ctx, 2); ctx.dirty(); } break;
      case 'shot2': if (now - s.shotAt > 2500) {
        s.status = 'done';
        ctx.star('foto');
        ctx.sound('fanfarria');
        ctx.vibrateAll([100, 50, 100, 50, 100, 50, 600]);
        ctx.feed('📸 ¡Meta colectiva 4/4 conseguida!', 'game');
        ctx.dirty();
      } break;
      default: break;
    }
  },

  shift(ctx, delta) {
    const s = st(ctx);
    for (const k of ['readEndsAt', 'countEndsAt', 'poseEndsAt']) if (s[k]) s[k] += delta;
  },

  admin(ctx, cmd) {
    const s = st(ctx);
    if (cmd === 'FOTO_START') { startReading(ctx); return true; }
    if (cmd === 'FOTO_SKIP') {
      if (s.status === 'reading') startCountdown(ctx);
      else if (s.status === 'countdown') s.countEndsAt = Date.now();
      return true;
    }
    if (cmd === 'FOTO_RESET') { Object.assign(s, blank()); return true; }
    return false;
  },

  force(ctx) {
    const s = st(ctx);
    s.status = 'done'; s.shots = 2;
    ctx.star('foto'); ctx.sound('fanfarria');
  },

  viewScreen(ctx) {
    const s = st(ctx), cfg = ctx.config.foto;
    return {
      status: s.status, readEndsAt: s.readEndsAt, countEndsAt: s.countEndsAt, shotAt: s.shotAt, poseEndsAt: s.poseEndsAt,
      shots: s.shots, finalPose: cfg.finalPose, readSeconds: cfg.readSeconds || 60, countSeconds: cfg.countdownSeconds || 10,
    };
  },
  viewAdmin(ctx) { return { ...this.viewScreen(ctx), assigned: Object.keys(st(ctx).missions).length }; },
  viewGuest(ctx, g) {
    const s = st(ctx);
    return { ...this.viewScreen(ctx), mission: s.missions[g.id] || null };
  },
};
