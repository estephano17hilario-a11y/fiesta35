'use strict';
/**
 * Motor de afinidad y formación de equipos (PURO: sin red ni base de datos → se puede simular y probar con semilla fija).
 *
 *  Test "esto o aquello" → vector oculto [E,O,A,C,S] → pool → parejas por afinidad → equipos (cascarones) → llegadas tardías.
 *  Todo el estado vive en un objeto serializable `mm` (se guarda en SQLite junto al resto del estado).
 */

const TRAITS = ['E', 'O', 'A', 'C', 'S'];
const DEFAULTS = { T: 0.8, Tmin: 0.6, waitMs: 60000, tasteBonus: 0.03, cap: 6, soft: 7, minTeam: 4, pairPoints: 10 };

const newMM = (teamCount = 6) => ({
  players: {}, pairs: {}, closed: false, seq: 1,
  teams: Object.fromEntries(Array.from({ length: teamCount }, (_, i) => [i + 1, []])),
});

/** Convierte las respuestas ('a'|'b' por pregunta) en vector de rasgos (0..1) y gustos. */
function profile(answers, questions) {
  const acc = {}, taste = {};
  for (const q of questions) {
    const pick = answers[q.id];
    if (pick !== 'a' && pick !== 'b') continue;
    if (q.kind === 'trait') (acc[q.trait] ||= []).push(q[pick].v);
    else taste[q.key] = pick;
  }
  const vec = {};
  for (const t of TRAITS) if (acc[t]) vec[t] = acc[t].reduce((a, b) => a + b, 0) / acc[t].length;
  return { vec, taste };
}

/** Similitud = 1 − distancia normalizada de rasgos + pequeño bono por gustos coincidentes (0..1). */
function similarity(a, b, cfg = DEFAULTS) {
  let d = 0, n = 0;
  for (const t of TRAITS) if (a.vec[t] != null && b.vec[t] != null) { d += Math.abs(a.vec[t] - b.vec[t]); n++; }
  let s = n ? 1 - d / n : 0.5;
  for (const k of Object.keys(a.taste || {})) if (b.taste && b.taste[k] === a.taste[k]) s += cfg.tasteBonus;
  return Math.min(1, s);
}

/** Texto rompehielos: "Coincidieron en 6 de 8. La que no: ¿pizza o sushi? Averigüen por qué". */
function icebreaker(a, b, questions) {
  let same = 0; const diff = [];
  for (const q of questions) {
    if (a.answers[q.id] && a.answers[q.id] === b.answers[q.id]) same++;
    else if (a.answers[q.id] && b.answers[q.id]) diff.push(q);
  }
  const total = questions.length;
  const q = diff.find((x) => x.kind === 'taste') || diff[0];
  const text = q
    ? `Coincidieron en ${same} de ${total}. ${diff.length > 1 ? 'Una en la que no' : 'La que no'}: ¿${q.a.label.toLowerCase()} o ${q.b.label.toLowerCase()}? Averigüen por qué.`
    : `¡Coincidieron en las ${total} de ${total}! Son casi gemelos: averigüen qué más comparten.`;
  return { same, total, text };
}

const poolIds = (mm) => Object.values(mm.players).filter((p) => p.state === 'pool').sort((a, b) => a.since - b.since).map((p) => p.id);
const teamSize = (mm, n) => mm.teams[n].length;
const teamIds = (mm) => Object.keys(mm.teams).map(Number);

function bestOf(mm, id, candidates, minSim, cfg, rng) {
  const me = mm.players[id];
  let best = null, bestSim = -1;
  for (const cid of candidates) {
    if (cid === id) continue;
    const s = similarity(me, mm.players[cid], cfg);
    if (s > bestSim + 1e-9 || (Math.abs(s - bestSim) < 1e-9 && rng() < 0.5)) { best = cid; bestSim = s; }
  }
  return best && bestSim >= minSim - 1e-9 ? { id: best, sim: bestSim } : null;
}

function makePair(mm, a, b, sim, o) {
  const pid = 'p' + mm.seq++;
  mm.pairs[pid] = { id: pid, members: [a, b], conf: {}, team: null, bank: 0, sim, formedAt: o.now };
  for (const id of [a, b]) { mm.players[id].state = 'paired'; mm.players[id].pair = pid; }
  return { t: 'pair', pair: pid, members: [a, b], sim };
}

function tryMatch(mm, id, o, threshold) {
  const best = bestOf(mm, id, poolIds(mm), threshold, o.cfg, o.rng);
  return best ? [makePair(mm, id, best.id, best.sim, o)] : [];
}

/** Un invitado termina el test. Antes de cerrar equipos entra al pool; después va directo a un equipo. */
function addPlayer(mm, p, o) {
  mm.players[p.id] = { state: 'new', pair: null, team: null, since: o.now, late: false, ...p };
  if (mm.closed) return placeLate(mm, p.id, o);
  mm.players[p.id].state = 'pool';
  mm.players[p.id].since = o.now;
  return [{ t: 'pool', id: p.id }, ...tryMatch(mm, p.id, o, o.cfg.T)];
}

/** Cada ~segundo: quien lleva esperando waitMs acepta la mejor pareja con similitud ≥ Tmin. */
function tick(mm, o) {
  const events = [];
  if (mm.closed) return events;
  for (const id of poolIds(mm)) {
    const p = mm.players[id];
    if (p.state !== 'pool' || o.now - p.since < o.cfg.waitMs) continue;
    events.push(...tryMatch(mm, id, o, o.cfg.Tmin));
  }
  return events;
}

function meanSim(mm, ids, members, cfg) {
  if (!members.length) return 0.5;
  let s = 0, n = 0;
  for (const a of ids) for (const b of members) { s += similarity(mm.players[a], mm.players[b], cfg); n++; }
  return s / n;
}

/** Cascarón con mejor encaje: similitud con sus miembros + equilibrio de tamaños. Capacidad 6 (blanda 7). */
function pickTeam(mm, ids, o, { balanceWeight = 0.4 } = {}) {
  const { cfg, rng } = o;
  const cands = teamIds(mm).map((n) => ({ n, size: teamSize(mm, n) }));
  let ok = cands.filter((c) => c.size + ids.length <= cfg.cap);
  if (!ok.length) ok = cands.filter((c) => c.size + ids.length <= cfg.soft);
  if (!ok.length) ok = [cands.sort((a, b) => a.size - b.size)[0]];
  let best = null, bestScore = -Infinity;
  for (const c of ok) {
    const score = (1 - balanceWeight) * meanSim(mm, ids, mm.teams[c.n], cfg) + balanceWeight * (1 - c.size / cfg.cap) + rng() * 1e-6;
    if (score > bestScore) { best = c.n; bestScore = score; }
  }
  return best;
}

function assignTeam(mm, ids, n) {
  for (const id of ids) {
    mm.teams[n].push(id);
    mm.players[id].state = 'team';
    mm.players[id].team = n;
  }
}

function placePair(mm, pid, o) {
  const pair = mm.pairs[pid];
  const n = pickTeam(mm, pair.members, o);
  assignTeam(mm, pair.members, n);
  pair.team = n;
  return [{ t: 'team', ids: pair.members.slice(), team: n, pair: pid, bank: pair.bank }];
}

/** Una persona confirma "Ya nos presentamos". Con ambas confirmaciones la pareja gana puntos y entra a un equipo. */
function confirm(mm, pid, who, o) {
  const pair = mm.pairs[pid];
  if (!pair || pair.team || pair.conf[who]) return [];
  if (!pair.members.includes(who)) return [];
  pair.conf[who] = true;
  if (!pair.members.every((m) => pair.conf[m])) return [{ t: 'confirm', pair: pid, who }];
  pair.bank += o.cfg.pairPoints * pair.members.length; // +10 por integrante, guardado en la pareja
  return [{ t: 'pairConfirmed', pair: pid, bank: pair.bank }, ...placePair(mm, pid, o)];
}

/** Llegada tardía: sin pareja, directo al equipo de mejor encaje priorizando el más corto. */
function placeLate(mm, id, o) {
  const n = pickTeam(mm, [id], o, { balanceWeight: 0.7 });
  mm.players[id].late = true;
  assignTeam(mm, [id], n);
  return [{ t: 'team', ids: [id], team: n, late: true }];
}

function rebalance(mm, o) {
  const events = [];
  for (let guard = 0; guard < 30; guard++) {
    const sizes = teamIds(mm).map((n) => ({ n, size: teamSize(mm, n) })).sort((a, b) => a.size - b.size);
    const small = sizes[0], large = sizes[sizes.length - 1];
    if (large.size - small.size < 2) break; // equilibra siempre que la diferencia sea ≥ 2
    // mueve a quien menos encaja con su equipo actual
    const from = mm.teams[large.n];
    let worst = null, worstS = Infinity;
    for (const id of from) {
      const s = meanSim(mm, [id], from.filter((x) => x !== id), o.cfg);
      if (s < worstS) { worst = id; worstS = s; }
    }
    mm.teams[large.n] = from.filter((x) => x !== worst);
    mm.teams[small.n].push(worst);
    mm.players[worst].team = small.n;
    events.push({ t: 'move', id: worst, from: large.n, to: small.n });
  }
  return events;
}

/** Cierra la formación: empareja sobrantes, forma el trío, ubica parejas sin confirmar y reequilibra. */
function closeTeams(mm, o) {
  const events = [];
  if (mm.closed) return events;
  // 1) el pool se empareja entre sí sin umbral
  let pool = poolIds(mm);
  while (pool.length >= 2) {
    const id = pool[0];
    const best = bestOf(mm, id, pool, 0, o.cfg, o.rng);
    events.push(makePair(mm, id, best.id, best.sim, o));
    pool = poolIds(mm);
  }
  // 2) la persona que sobra se une a la pareja más cercana → trío
  if (pool.length === 1) {
    const id = pool[0];
    let bestPair = null, bestS = -1;
    for (const pair of Object.values(mm.pairs)) {
      const s = meanSim(mm, [id], pair.members, o.cfg);
      if (s > bestS) { bestPair = pair; bestS = s; }
    }
    if (bestPair) {
      bestPair.members.push(id);
      mm.players[id].pair = bestPair.id;
      mm.players[id].state = 'paired';
      bestPair.conf[id] = true;
      if (bestPair.team) { assignTeam(mm, [id], bestPair.team); events.push({ t: 'team', ids: [id], team: bestPair.team, trio: true, pair: bestPair.id }); }
      else events.push({ t: 'trio', pair: bestPair.id, id });
    } else {
      events.push(...placeLate(mm, id, o));
    }
  }
  // 3) parejas todavía sin equipo (sin confirmar) se ubican igual
  for (const pair of Object.values(mm.pairs)) if (!pair.team) { pair.members.forEach((m) => { pair.conf[m] = true; }); events.push(...placePair(mm, pair.id, o)); }
  mm.closed = true;
  events.push(...rebalance(mm, o));
  return events;
}

/** Nombre automático según lo que comparten (estilo "Los Trasnochadores del Sushi"). */
function teamName(mm, ids, content, usedNames, rng) {
  const count = (key) => { let a = 0, b = 0; for (const id of ids) { const t = mm.players[id].taste[key]; if (t === 'a') a++; else if (t === 'b') b++; } return { a, b }; };
  const pickAB = (c) => (c.a === c.b ? (rng() < 0.5 ? 'a' : 'b') : c.a > c.b ? 'a' : 'b');
  const adj = content.adj[pickAB(count('horario'))];
  const food = content.noun.comida[pickAB(count('comida'))];
  const place = content.noun.lugar[pickAB(count('lugar'))];
  const options = [`Los ${adj} ${food}`, `Los ${place} ${food}`, `Los ${adj} ${place}`];
  for (const name of options) if (!usedNames.includes(name)) return name;
  const free = content.fallback.filter((n) => !usedNames.includes(n));
  return (free.length ? free : content.fallback)[Math.floor(rng() * (free.length || content.fallback.length))];
}

/** Roles de la Bomba: 1 ciego, 2 sordos (1 si el equipo es chico) y el resto mudos; rotan para que nadie repita antes que todos. */
function assignRoles(ids, history, rng) {
  const n = ids.length;
  const nDeaf = n >= 5 ? 2 : n >= 2 ? 1 : 0;
  const lowest = (pool, key) => {
    const min = Math.min(...pool.map((id) => (history[id] || {})[key] || 0));
    const c = pool.filter((id) => ((history[id] || {})[key] || 0) === min);
    return c[Math.floor(rng() * c.length)];
  };
  const blind = lowest(ids, 'blind');
  let rest = ids.filter((id) => id !== blind);
  const deaf = [];
  for (let i = 0; i < nDeaf && rest.length; i++) { const d = lowest(rest, 'deaf'); deaf.push(d); rest = rest.filter((id) => id !== d); }
  return { blind, deaf, mute: rest };
}

/** Multiplicador por equipo incompleto: tamaño del mayor / tamaño del tuyo, con tope ×1.5. */
function multiplier(sizes, mine, cap = 1.5) {
  const max = Math.max(1, ...sizes);
  if (!mine) return 1;
  return Math.min(cap, Math.round((max / mine) * 100) / 100);
}

const bestOfPool = (mm, id, pool, minSim, cfg) => bestOf(mm, id, pool, minSim, cfg, Math.random);

module.exports = {
  bestOfPool,
  TRAITS, DEFAULTS, newMM, profile, similarity, icebreaker, addPlayer, tick, confirm, placeLate, closeTeams, rebalance,
  pickTeam, teamName, assignRoles, multiplier, poolIds, teamSize, makePair,
};
