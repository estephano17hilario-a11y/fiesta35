'use strict';
/**
 * CIERRE DE LOS JUEGOS (15 min): "Película de la noche" con los mejores clips del Karaoke + premios de fotos,
 * y después todos cantan "Cumpleaños feliz". Si un clip falló, se salta.
 */
const id = 'cierre';
const st = (ctx) => ctx.state.g[id];

const LYRICS = ['Cumpleaños feliz', 'Te deseamos a ti', 'Cumpleaños {name}', 'Cumpleaños feliz 🎂'];

function buildItems(ctx) {
  const b = ctx.state.g.bomba || { clips: [], photos: [], done: {} };
  const items = [];
  const nm = (gid) => { const g = ctx.guests.get(gid); return g ? g.alias || g.name : '???'; };
  const good = b.clips.filter((c) => c.file && c.status === 'ready');
  // primero los acertados, luego el resto (los clips fallidos / sin archivo se saltan)
  good.sort((a, z) => (z.ok === true) - (a.ok === true) || a.at - z.at);
  for (const c of good) {
    const t = ctx.tableCfg(c.team);
    items.push({ type: 'title', ms: 3800, text: `Protagonista: ${nm(c.blind)}, a ciegas`, sub: `${t.emoji} ${t.name} · «${c.song}»${c.ok ? ' · ¡ACERTARON!' : ''}`, color: t.color });
    items.push({ type: 'clip', url: c.file, ms: 70000, caption: t.name });
  }
  const photos = b.photos.filter((p) => p.votes > 0).sort((a, z) => z.avg - a.avg);
  if (photos.length) {
    const best = photos[0], worst = photos[photos.length - 1];
    items.push({ type: 'title', ms: 3000, text: '📸 La mejor foto paparazzi', sub: `${ctx.tableCfg(best.team).name} · ${best.avg.toFixed(1)}★` });
    items.push({ type: 'photo', url: best.url, ms: 6000, caption: `${best.avg.toFixed(1)}★` });
    if (photos.length > 1) {
      items.push({ type: 'title', ms: 3000, text: '😅 La peor foto paparazzi', sub: `${ctx.tableCfg(worst.team).name} · ${worst.avg.toFixed(1)}★` });
      items.push({ type: 'photo', url: worst.url, ms: 6000, caption: `${worst.avg.toFixed(1)}★` });
    }
  }
  const ranking = ctx.config.tables.map((t) => ({ n: t.n, name: ctx.tableCfg(t.n).name, pts: ctx.state.aura[t.n] || 0 })).sort((a, z) => z.pts - a.pts);
  items.push({ type: 'ranking', ms: 9000, ranking });
  items.push({ type: 'end', ms: 0, text: '¡Cumpleaños feliz!', lyrics: LYRICS.map((l) => l.replace('{name}', ctx.config.meta.birthdayName)) });
  return items;
}

function goto(ctx, i) {
  const s = st(ctx);
  s.idx = Math.max(0, Math.min(s.items.length - 1, i));
  s.itemAt = Date.now();
  const it = s.items[s.idx];
  if (it && it.type === 'end') { ctx.sound('fanfarria'); }
}

module.exports = {
  id,
  phases: ['CIERRE_JUEGOS'],

  init(ctx) { ctx.state.g[id] ||= { playing: false, items: [], idx: 0, itemAt: 0 }; },
  enter(ctx) { const s = st(ctx); s.playing = false; s.items = []; s.idx = 0; },

  tick(ctx, now) {
    const s = st(ctx);
    if (!s.playing || ctx.state.clock.paused) return;
    const it = s.items[s.idx];
    if (!it || it.type === 'end') return;
    if (now - s.itemAt >= it.ms) { goto(ctx, s.idx + 1); ctx.dirty(); }
  },

  /** La pantalla avisa cuando termina un clip de video → se pasa al siguiente. */
  screen(ctx, ev, p) {
    const s = st(ctx);
    if (ev === 'MOVIE_ENDED' && s.playing && Number(p.idx) === s.idx) { goto(ctx, s.idx + 1); return true; }
    if (ev === 'MOVIE_ERROR' && s.playing && Number(p.idx) === s.idx) { goto(ctx, s.idx + 1); return true; } // clip dañado: se salta
    return false;
  },

  admin(ctx, cmd, a) {
    const s = st(ctx);
    if (cmd === 'MOVIE_BUILD') { s.items = buildItems(ctx); s.idx = 0; s.playing = false; return true; }
    if (cmd === 'MOVIE_PLAY') { if (!s.items.length) s.items = buildItems(ctx); s.playing = true; goto(ctx, a.from != null ? Number(a.from) : s.idx); ctx.sound('whoosh'); return true; }
    if (cmd === 'MOVIE_STOP') { s.playing = false; return true; }
    if (cmd === 'MOVIE_NEXT') { goto(ctx, s.idx + 1); return true; }
    if (cmd === 'MOVIE_PREV') { goto(ctx, s.idx - 1); return true; }
    return false;
  },
  force(ctx) { const s = st(ctx); if (!s.items.length) s.items = buildItems(ctx); s.playing = true; goto(ctx, s.items.length - 1); },

  viewScreen(ctx) {
    const s = st(ctx);
    const it = s.items[s.idx] || null;
    return { playing: s.playing, idx: s.idx, total: s.items.length, item: it, itemAt: s.itemAt, clips: ctx.state.g.bomba ? ctx.state.g.bomba.clips.filter((c) => c.file && c.status === 'ready').length : 0 };
  },
  viewAdmin(ctx) {
    const s = st(ctx);
    return { ...this.viewScreen(ctx), items: s.items.map((i) => ({ type: i.type, text: i.text || i.caption || '' })) };
  },
};
