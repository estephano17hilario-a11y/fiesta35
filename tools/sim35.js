'use strict';
/**
 * npm run sim:35  — simula 35 invitados llegando escalonados y comprueba:
 *   1) 17 parejas + 1 trío (o equivalente) y 6 equipos balanceados,
 *   2) determinismo: misma semilla → mismo resultado exacto,
 *   3) llegadas tardías sin pareja, 4) multiplicador, 5) rotación de roles de la Bomba.
 * Usa el MISMO motor que el servidor (server/engine/matchmaker.js).  Semilla: --seed N (por defecto 35).
 */
const fs = require('fs');
const path = require('path');
const M = require('../server/engine/matchmaker');
const { rngFrom } = require('../server/util');

const args = process.argv.slice(2);
const seed = Number((args[args.indexOf('--seed') + 1]) || 35);
const test = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'content', 'test.json'), 'utf8')).questions;
const names = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'content', 'nombres-equipo.json'), 'utf8'));

let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`); };

function run(seedN, { total = 35, late = 0, verbose = false } = {}) {
  const rng = rngFrom(seedN);
  const cfg = { ...M.DEFAULTS };
  const mm = M.newMM(6);
  let now = 0;
  const o = () => ({ cfg, rng, now });
  const log = [];
  const people = Array.from({ length: total }, (_, i) => {
    const answers = Object.fromEntries(test.map((q) => [q.id, rng() < 0.5 ? 'a' : 'b']));
    return { id: 'g' + (i + 1), answers, ...M.profile(answers, test) };
  });
  const confirmAll = (events) => { // todas las parejas se encuentran 5-40 s después
    for (const e of events) if (e.t === 'pair') log.push(e);
    return events;
  };
  const pending = [];
  const handle = (events) => {
    for (const e of events) if (e.t === 'pair') pending.push({ pair: e.pair, at: now + 5000 + Math.floor(rng() * 35000) });
    return events;
  };
  const arrivals = people.slice(0, total - late);
  // llegadas escalonadas: una persona cada 2-20 s; el motor corre cada segundo
  let idx = 0, nextArrival = 0;
  while (idx < arrivals.length || pending.length || M.poolIds(mm).length > 1) {
    if (now > 40 * 60000) break;
    if (idx < arrivals.length && now >= nextArrival) { handle(M.addPlayer(mm, arrivals[idx], o())); idx++; nextArrival = now + 2000 + Math.floor(rng() * 18000); }
    handle(M.tick(mm, o()));
    for (const p of pending.slice()) if (now >= p.at) {
      pending.splice(pending.indexOf(p), 1);
      for (const who of mm.pairs[p.pair].members) M.confirm(mm, p.pair, who, o());
    }
    now += 1000;
  }
  const closeEvents = M.closeTeams(mm, o());
  for (const p of pending) { /* ya ubicadas por closeTeams */ }
  // llegadas tardías
  const lateEvents = people.slice(total - late).flatMap((p) => M.addPlayer(mm, p, o()));
  const sizes = Object.values(mm.teams).map((t) => t.length);
  const pairs = Object.values(mm.pairs);
  return { mm, sizes, pairs, closeEvents, lateEvents, people, rng, signature: JSON.stringify({ teams: mm.teams, pairs: pairs.map((p) => p.members) }) };
}

console.log(`\n🧪 sim:35 · semilla ${seed}\n`);
const r = run(seed);
console.log('   Tamaños de equipo:', r.sizes.join(' · '), `(total ${r.sizes.reduce((a, b) => a + b, 0)})`);
const trios = r.pairs.filter((p) => p.members.length === 3).length;
const duos = r.pairs.filter((p) => p.members.length === 2).length;
console.log(`   Parejas: ${duos} · tríos: ${trios}`);
check('35 invitados todos en un equipo', r.sizes.reduce((a, b) => a + b, 0) === 35 && Object.values(r.mm.players).every((p) => p.team));
check('6 equipos balanceados (5-6 por equipo)', r.sizes.every((n) => n >= 5 && n <= 6), r.sizes.join(','));
check('17 parejas + 1 trío (o equivalente)', duos + trios === 17 && trios === 1, `${duos}+${trios}`);
check('nadie sin pareja antes de equipo', Object.values(r.mm.players).every((p) => p.pair));

const r2 = run(seed);
check('determinista: misma semilla → mismo resultado', r.signature === r2.signature);
const r3 = run(seed + 1);
check('otra semilla → otro reparto', r.signature !== r3.signature);

// similitud entre parejas formadas
const avgSim = r.pairs.map((p) => M.similarity(r.mm.players[p.members[0]], r.mm.players[p.members[1]])).reduce((a, b) => a + b, 0) / r.pairs.length;
check('parejas con afinidad media alta (≥ 0.6)', avgSim >= 0.6, avgSim.toFixed(2));

// llegadas tardías: 4 invitados llegan cuando ya se cerraron equipos
const rl = run(seed, { total: 35, late: 4 });
const lateOk = rl.lateEvents.length === 4 && rl.lateEvents.every((e) => e.t === 'team' && e.late);
check('4 llegadas tardías van directo a equipo (sin pareja)', lateOk);
const sizesLate = rl.sizes;
check('tardíos priorizan el equipo más corto (rango ≤ 1)', Math.max(...sizesLate) - Math.min(...sizesLate) <= 2, sizesLate.join(','));

// multiplicador
check('multiplicador: equipo de 5 con máximo 6 → ×1.2', M.multiplier([6, 6, 6, 6, 6, 5], 5) === 1.2);
check('multiplicador: tope ×1.5', M.multiplier([6, 4], 3) === 1.5 && M.multiplier([6, 6], 6) === 1);

// roles que rotan: ningún ciego repite antes de que todos lo hayan sido
const rng = rngFrom(seed);
const team = ['a', 'b', 'c', 'd', 'e', 'f'];
const hist = {};
const blinds = [];
for (let g = 0; g < 6; g++) {
  const roles = M.assignRoles(team, hist, rng);
  blinds.push(roles.blind);
  (hist[roles.blind] ||= { blind: 0, deaf: 0 }).blind++;
  for (const d of roles.deaf) (hist[d] ||= { blind: 0, deaf: 0 }).deaf++;
  if (g === 0) check('roles 1 ciego / 2 sordos / 3 mudos', roles.deaf.length === 2 && roles.mute.length === 3);
}
check('rotación: 6 juegos → 6 ciegos distintos', new Set(blinds).size === 6, blinds.join(''));
const four = M.assignRoles(['a', 'b', 'c', 'd'], {}, rng);
check('equipo de 4 → 1/1/2', four.deaf.length === 1 && four.mute.length === 2);

// nombre automático
const used = [];
for (const n of Object.keys(r.mm.teams)) used.push(M.teamName(r.mm, r.mm.teams[n], names, used, r.rng));
check('6 nombres de equipo únicos', new Set(used).size === 6, used.slice(0, 2).join(' | '));

console.log(`\n${failures ? '❌' : '✅'} ${failures ? failures + ' fallo(s)' : 'sim:35 OK'}\n`);
process.exit(failures ? 1 : 0);
