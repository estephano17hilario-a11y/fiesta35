'use strict';
// JUEGO 8 — Pixel Art Secreto: mural de 14×10 (140 celdas). Cada invitado recibe sus coordenadas sin ver el dibujo.
const U = require('../util');

const id = 'pixel';
const st = (ctx) => ctx.state.g[id];
const ck = (x, y) => `${x},${y}`;

function blank() {
  return { assigned: false, cells: {}, painted: 0, revealed: false, useTurns: null, turnTable: null, turnEndsAt: 0, turnCount: 0 };
}

function palette(ctx, ch) {
  const p = ctx.config.pixel.palette[ch] || ctx.config.pixel.palette['.'] || { name: 'Azul', hex: '#12163a' };
  return p;
}

function assign(ctx) {
  const s = st(ctx), cfg = ctx.config.pixel;
  const people = [...ctx.guests.values()].filter((g) => g.table).sort((a, b) => a.table - b.table || a.createdAt - b.createdAt);
  s.cells = {};
  s.painted = 0;
  s.revealed = false;
  const coords = [];
  for (let y = 1; y <= cfg.rows; y++) for (let x = 1; x <= cfg.cols; x++) coords.push([x, y]);
  const mix = U.shuffle(coords);
  mix.forEach(([x, y], i) => {
    const ch = (cfg.image[y - 1] || '')[x - 1] || '.';
    s.cells[ck(x, y)] = { gid: people.length ? people[i % people.length].id : null, ch, painted: false };
  });
  s.assigned = true;
  if (s.useTurns == null) s.useTurns = cfg.useTurns !== false;
  nextTurn(ctx, true);
}

function activeTables(ctx) {
  const s = st(ctx);
  const set = new Set();
  for (const c of Object.values(s.cells)) {
    if (!c.painted && c.gid) { const g = ctx.guests.get(c.gid); if (g && g.table) set.add(g.table); }
  }
  return [...set].sort((a, b) => a - b);
}

function nextTurn(ctx, first) {
  const s = st(ctx);
  const tables = activeTables(ctx);
  if (!tables.length) { s.turnTable = null; s.turnEndsAt = 0; return; }
  const cur = s.turnTable;
  s.turnTable = first || !cur ? tables[0] : (tables.find((t) => t > cur) ?? tables[0]);
  s.turnEndsAt = Date.now() + (ctx.config.pixel.turnSeconds || 120) * 1000;
  s.turnCount += 1;
  if (!first) { ctx.sound('whoosh'); ctx.toTable(s.turnTable, 'VIBRATE_TRIGGER', { pattern: [200, 100, 200] }); }
}

function checkReveal(ctx) {
  const s = st(ctx);
  if (s.revealed) return;
  if (s.painted >= (ctx.config.pixel.revealThreshold || 130)) {
    s.revealed = true;
    ctx.star('pixel');
    ctx.sound('redoble');
    setTimeout(() => ctx.sound('fanfarria'), 2200);
    ctx.vibrateAll([100, 50, 100, 50, 100, 50, 500]);
    ctx.feed('🟦 ¡Mural completado! Se revela la imagen', 'game');
  }
}

function paint(ctx, key) {
  const s = st(ctx), c = s.cells[key];
  if (!c || c.painted) return false;
  c.painted = true;
  s.painted += 1;
  checkReveal(ctx);
  return true;
}

module.exports = {
  id,
  phases: ['PIXEL_ART'],

  init(ctx) { ctx.state.g[id] ||= blank(); },
  enter(ctx) { if (!st(ctx).assigned) assign(ctx); },

  tick(ctx, now) {
    const s = st(ctx);
    if (ctx.state.phase !== 'PIXEL_ART' || !s.assigned || !s.useTurns || s.revealed || ctx.state.clock.paused) return;
    if (s.turnEndsAt && now >= s.turnEndsAt) { nextTurn(ctx); ctx.dirty(); }
  },

  shift(ctx, delta) { const s = st(ctx); if (s.turnEndsAt) s.turnEndsAt += delta; },

  guest(ctx, g, ev, p) {
    if (ev !== 'CONFIRM_PIXEL') return false;
    const s = st(ctx), key = ck(Number(p.x), Number(p.y)), c = s.cells[key];
    if (!c || c.gid !== g.id || c.painted) return false;
    if (s.useTurns && s.turnTable && s.turnTable !== g.table) {
      ctx.toGuest(g.id, 'TOAST', { message: `Ahora pinta la Mesa ${s.turnTable}. ¡Espera tu turno!` });
      return false;
    }
    paint(ctx, key);
    ctx.vibrateGuest(g.id, [60]);
    return true;
  },

  admin(ctx, cmd, a) {
    const s = st(ctx);
    if (cmd === 'PIXEL_ASSIGN') { assign(ctx); return true; }
    if (cmd === 'PIXEL_NEXT_TURN') { nextTurn(ctx); return true; }
    if (cmd === 'PIXEL_TURNS') { s.useTurns = !s.useTurns; if (s.useTurns) nextTurn(ctx, !s.turnTable); return true; }
    if (cmd === 'PIXEL_PAINT_ALL') { this.force(ctx); return true; }
    if (cmd === 'PIXEL_RESET') { Object.assign(s, blank()); assign(ctx); return true; }
    return false;
  },

  force(ctx) {
    const s = st(ctx);
    if (!s.assigned) assign(ctx);
    for (const k of Object.keys(s.cells)) paint(ctx, k);
  },

  base(ctx) {
    const s = st(ctx), cfg = ctx.config.pixel;
    const cells = [];
    for (let y = 1; y <= cfg.rows; y++) for (let x = 1; x <= cfg.cols; x++) {
      const c = s.cells[ck(x, y)];
      cells.push(c && c.painted ? palette(ctx, c.ch).hex : null);
    }
    const full = s.revealed ? Array.from({ length: cfg.rows * cfg.cols }, (_, i) => palette(ctx, (cfg.image[Math.floor(i / cfg.cols)] || '')[i % cfg.cols] || '.').hex) : null;
    return {
      cols: cfg.cols, rows: cfg.rows, cells, full, painted: s.painted, total: cfg.cols * cfg.rows,
      threshold: cfg.revealThreshold || 130, revealed: s.revealed, useTurns: !!s.useTurns,
      turnTable: s.turnTable, turnEndsAt: s.turnEndsAt, revealImageUrl: cfg.revealImageUrl || '', bg: cfg.background,
    };
  },
  viewScreen(ctx) { return this.base(ctx); },
  viewAdmin(ctx) {
    const s = st(ctx);
    const byTable = {};
    for (const c of Object.values(s.cells)) {
      const g = c.gid && ctx.guests.get(c.gid);
      const t = g ? g.table : 0;
      (byTable[t] ||= { done: 0, total: 0 });
      byTable[t].total++; if (c.painted) byTable[t].done++;
    }
    return { ...this.base(ctx), byTable };
  },
  viewGuest(ctx, g) {
    const s = st(ctx);
    const mine = Object.entries(s.cells)
      .filter(([, c]) => c.gid === g.id)
      .map(([k, c]) => {
        const [x, y] = k.split(',').map(Number);
        const p = palette(ctx, c.ch);
        return { x, y, label: `${U.colLetter(x)}${y}`, name: p.name, hex: p.hex, painted: c.painted };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
    return {
      ...this.base(ctx), cells: undefined, full: undefined, mine,
      canPaint: !s.useTurns || !s.turnTable || s.turnTable === g.table,
    };
  },
};
