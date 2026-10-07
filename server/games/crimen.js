'use strict';
// JUEGO 3 — ¿Quién mató a Gianella?: expediente policial, notas de voz y veredicto por consenso de mesa.
const U = require('../util');

const id = 'crimen';
const st = (ctx) => ctx.state.g[id];
const key = (v) => `${v.s}|${v.w}|${v.m}`;

function needFor(ctx, t) {
  const n = ctx.membersOf(t).length;
  return Math.max(1, Math.min(ctx.config.crimen.needVotes || 4, Math.ceil(n * 0.66)));
}

function tally(ctx, t) {
  const votes = st(ctx).votes[t] || {};
  const groups = {};
  for (const [gid, v] of Object.entries(votes)) {
    const k = key(v);
    (groups[k] ||= { ...v, count: 0, voters: [] });
    groups[k].count++;
    const g = ctx.guests.get(gid);
    groups[k].voters.push(g ? g.alias || g.name : '?');
  }
  return Object.values(groups).sort((a, b) => b.count - a.count);
}

function setVerdict(ctx, t, v, how) {
  const s = st(ctx);
  if (s.verdicts[t]) return;
  const cfg = ctx.config.crimen;
  s.verdicts[t] = { ...v, at: Date.now(), how, correct: v.s === cfg.culprit };
  try { ctx.db.verdict(t, v.s, v.w, v.m, v.s === cfg.culprit); } catch (e) { console.error(e); }
  ctx.vibrateTable(t, [300, 100, 300]);
  ctx.toTable(t, 'TOAST', { message: '⚖️ ¡Veredicto registrado por tu mesa!' });
  ctx.feed(`⚖️ ${ctx.tableCfg(t).name} entregó su veredicto`, 'game');
}

function closeVoting(ctx) {
  const s = st(ctx);
  if (!s.voting.open) return;
  s.voting.open = false;
  for (const t of ctx.config.tables) {
    if (s.verdicts[t.n]) continue;
    const top = tally(ctx, t.n)[0];
    if (top) setVerdict(ctx, t.n, top, 'mayoria');
  }
  ctx.sound('gavel');
}

function reveal(ctx) {
  const s = st(ctx);
  if (s.revealed) return;
  closeVoting(ctx);
  const cfg = ctx.config.crimen;
  s.revealed = true;
  s.points = {};
  for (const [t, v] of Object.entries(s.verdicts)) {
    let pts = 0;
    if (v.s === cfg.culprit) pts += cfg.reward || 500;
    if (v.w === cfg.weapon) pts += cfg.bonusWeaponMotive || 0;
    if (v.m === cfg.motive) pts += cfg.bonusWeaponMotive || 0;
    // el bono de arma/motivo solo cuenta si acertaron al culpable
    if (v.s !== cfg.culprit) pts = 0;
    s.points[t] = pts;
    if (pts) ctx.addAura(Number(t), pts, 'Caso Gianella', 'crimen');
  }
  ctx.sound('fanfarria');
  ctx.feed('🔎 Se reveló al culpable', 'game');
}

module.exports = {
  id,
  phases: ['GIANELLA_CRIMEN'],

  init(ctx) {
    ctx.state.g[id] ||= { notes: 0, voting: { open: false, endsAt: 0 }, votes: {}, verdicts: {}, revealed: false, points: {} };
  },

  tick(ctx, now) {
    const s = st(ctx);
    if (s.voting.open && now >= s.voting.endsAt && !ctx.state.clock.paused) { closeVoting(ctx); ctx.dirty(); }
  },

  guest(ctx, g, ev, p) {
    if (ev !== 'CRIMEN_VOTE') return false;
    const s = st(ctx), cfg = ctx.config.crimen, t = g.table;
    if (!s.voting.open || !t || s.verdicts[t]) return true;
    const v = { s: String(p.s), w: String(p.w), m: String(p.m) };
    if (!cfg.suspects.some((x) => x.id === v.s) || !cfg.weapons.some((x) => x.id === v.w) || !cfg.motives.some((x) => x.id === v.m)) return true;
    (s.votes[t] ||= {})[g.id] = v;
    const top = tally(ctx, t)[0];
    if (top && top.count >= needFor(ctx, t)) setVerdict(ctx, t, top, 'consenso');
    return true;
  },

  admin(ctx, cmd, a) {
    const s = st(ctx);
    if (cmd === 'CRIMEN_NOTE') { s.notes = Math.min(ctx.config.crimen.voiceNotes.length, s.notes + 1); ctx.sound('whatsapp'); ctx.vibrateAll([80, 60, 80]); return true; }
    if (cmd === 'CRIMEN_NOTE_ALL') { s.notes = ctx.config.crimen.voiceNotes.length; return true; }
    if (cmd === 'CRIMEN_OPEN') {
      s.voting = { open: true, endsAt: Date.now() + (ctx.config.crimen.voteSeconds || 300) * 1000 };
      ctx.sound('alarm'); ctx.vibrateAll([300, 100, 300]);
      ctx.feed('🗳️ Se abrió la votación del veredicto', 'game');
      return true;
    }
    if (cmd === 'CRIMEN_CLOSE') { closeVoting(ctx); return true; }
    if (cmd === 'CRIMEN_REVEAL') { reveal(ctx); return true; }
    return false;
  },

  force(ctx) { reveal(ctx); },

  publicCase(ctx) {
    const cfg = ctx.config.crimen;
    return {
      suspects: cfg.suspects, weapons: cfg.weapons, motives: cfg.motives,
      notes: cfg.voiceNotes.slice(0, st(ctx).notes), notesTotal: cfg.voiceNotes.length,
    };
  },

  revealBlock(ctx) {
    const s = st(ctx), cfg = ctx.config.crimen;
    if (!s.revealed) return {};
    return { answer: { s: cfg.culprit, w: cfg.weapon, m: cfg.motive }, points: s.points };
  },

  viewScreen(ctx) {
    const s = st(ctx);
    const verdicts = {};
    for (const t of ctx.config.tables) {
      const v = s.verdicts[t.n];
      verdicts[t.n] = v ? { done: true, ...(s.revealed ? { s: v.s, w: v.w, m: v.m, correct: v.correct } : {}) } : { done: false, votes: (s.votes[t.n] ? Object.keys(s.votes[t.n]).length : 0), need: needFor(ctx, t.n) };
    }
    return { ...this.publicCase(ctx), voting: s.voting, revealed: s.revealed, verdicts, ...this.revealBlock(ctx) };
  },

  viewAdmin(ctx) {
    const cfg = ctx.config.crimen;
    return { ...this.viewScreen(ctx), truth: { s: cfg.culprit, w: cfg.weapon, m: cfg.motive } };
  },

  viewGuest(ctx, g) {
    const s = st(ctx), cfg = ctx.config.crimen, t = g.table;
    const members = ctx.membersOf(t);
    const idx = Math.max(0, members.findIndex((m) => m.id === g.id));
    const cards = cfg.clues.filter((_, i) => i % Math.max(1, members.length) === idx);
    // coartadas falsas generadas desde la micro-encuesta ("autor intelectual" / "sospechoso")
    const suspects = [...ctx.guests.values()]
      .filter((x) => x.id !== g.id && x.survey && (x.survey.innocence === 'autor' || x.survey.innocence === 'sospechoso'))
      .sort((a, b) => (a.survey.innocence === 'autor' ? -1 : 1) - (b.survey.innocence === 'autor' ? -1 : 1) || U.sha(a.id).localeCompare(U.sha(b.id)))
      .slice(0, 5);
    const testimonies = suspects.map((x, i) => cfg.testimonyTemplates[(U.sha(x.id).charCodeAt(0) + i) % cfg.testimonyTemplates.length].replace('{name}', x.alias || x.name));
    const myVote = (s.votes[t] || {})[g.id] || null;
    return {
      ...this.publicCase(ctx), cards, testimonies, voting: s.voting, revealed: s.revealed,
      myVote, tally: tally(ctx, t), need: needFor(ctx, t),
      verdict: s.verdicts[t] ? { s: s.verdicts[t].s, w: s.verdicts[t].w, m: s.verdicts[t].m, how: s.verdicts[t].how, ...(s.revealed ? { correct: s.verdicts[t].correct } : {}) } : null,
      ...this.revealBlock(ctx),
      myPoints: s.revealed ? s.points[t] || 0 : null,
    };
  },
};
