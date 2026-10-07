'use strict';
/**
 * FASE 3 — LA BOMBA (30 min, un equipo al frente a la vez): teléfono descompuesto humano.
 *   MUDOS (ven y oyen, no hablan) → mímica → SORDOS (ven, no oyen, hablan) → voz por la ventanilla → CIEGO (venda, usa las manos).
 * 4 juegos por equipo: Charada del animal · Objeto a ciegas · Paparazzi a ciegas · Karaoke roto.
 * Puntuación común por juego: jurado 50 (1–5★ ×10, secreto) + público 50, × multiplicador de equipo incompleto.
 */
const fs = require('fs');
const path = require('path');
const U = require('../util');
const M = require('../engine/matchmaker');

const id = 'bomba';
const st = (ctx) => ctx.state.g[id];
const cfg = (ctx) => ctx.config.bomba;
const KEYS = ['charada', 'objeto', 'paparazzi', 'karaoke'];
const NAMES = { charada: 'Charada del animal', objeto: 'Objeto a ciegas', paparazzi: 'Paparazzi a ciegas', karaoke: 'Karaoke roto' };
const ICONS = { charada: '🐾', objeto: '🧤', paparazzi: '📸', karaoke: '🎤' };
const label = (g) => (g ? { id: g.id, name: g.alias || g.name, animal: g.animal } : null);

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const cur = (ctx) => st(ctx).current;

/* ───────────────────────── cola y roles ───────────────────────── */
function buildQueue(ctx) {
  const cajaState = ctx.state.g.caja;
  const order = (n) => { const t = cajaState && cajaState.teams[n]; return t && t.opened ? t.order : 99; };
  return ctx.config.tables.map((t) => t.n).filter((n) => ctx.membersOf(n).length).sort((a, b) => order(a) - order(b) || a - b);
}

function eligible(ctx, n) { return ctx.membersOf(n).filter((m) => !m.absent).map((m) => m.id); }

function pickRoles(ctx, n) {
  const hist = (st(ctx).hist[n] ||= {});
  return M.assignRoles(eligible(ctx, n), hist, Math.random);
}
function commitRoles(ctx, n, roles) {
  const hist = (st(ctx).hist[n] ||= {});
  const bump = (gid, k) => { (hist[gid] ||= { blind: 0, deaf: 0 })[k]++; };
  bump(roles.blind, 'blind');
  for (const d of roles.deaf) bump(d, 'deaf');
}
const roleOf = (c, gid) => (c.roles.blind === gid ? 'blind' : c.roles.deaf.includes(gid) ? 'deaf' : c.roles.mute.includes(gid) ? 'mute' : null);

/* ───────────────────────── ciclo de un juego ───────────────────────── */
function newGame(ctx, key) {
  const c = cfg(ctx);
  if (key === 'charada') {
    const used = st(ctx).usedAnimals;
    const all = (ctx.content.charadas && ctx.content.charadas.animals) || ['perro'];
    const free = all.filter((a) => !used.includes(a));
    const animal = U.pick(free.length ? free : all);
    used.push(animal);
    return { animal, seconds: c.charada.seconds };
  }
  if (key === 'objeto') {
    const all = (ctx.content.objetos && ctx.content.objetos.objects) || [];
    const used = st(ctx).usedObjects;
    const free = all.filter((o) => !used.includes(o.name));
    const picks = U.shuffle(free.length >= c.objeto.objects ? free : all).slice(0, c.objeto.objects);
    const objects = picks.map((o) => {
      used.push(o.name);
      const opts = U.shuffle(o.options);
      return { name: o.name, options: opts, pos: opts.indexOf(o.name) + 1, cup: null, ok: null };
    });
    return { objects, idx: 0, step: 'touch', stepEndsAt: 0, seconds: c.objeto.secondsPerObject };
  }
  if (key === 'paparazzi') return { target: null, shots: [], seconds: c.paparazzi.seconds, photoIdx: 0 };
  if (key === 'karaoke') {
    const songs = (ctx.content.canciones && ctx.content.canciones.songs) || [];
    const used = st(ctx).usedSongs;
    const free = songs.filter((s) => !used.includes(s.title));
    const song = U.pick(free.length ? free : songs);
    used.push(song.title);
    const pool = (ctx.content.canciones.pool || []).filter((e) => !song.hints.includes(e));
    const board = U.shuffle([...song.hints, ...U.shuffle(pool).slice(0, 24 - song.hints.length)]);
    return { song: song.title, board, seq: [], erased: [], flipUntil: 0, saboteurs: [], faults: 0, faultTaps: {}, faultCool: 0, correct: null, seconds: c.karaoke.seconds, clip: null, markDeadline: 0 };
  }
  return {};
}

function callTeam(ctx, n) {
  const s = st(ctx);
  if (!ctx.membersOf(n).length) return;
  if (s.current && s.current.status !== 'finished' && s.current.team !== n) { /* se reemplaza el turno actual */ }
  if (!s.queue.includes(n)) s.queue.push(n);
  s.current = { team: n, gameIdx: 0, status: 'intro', introEndsAt: Date.now() + cfg(ctx).introSeconds * 1000, roles: null, game: null, votes: { public: {}, jury: {} }, result: null, results: [], swaps: [] };
  prepareGame(ctx);
  ctx.vibrateTable(n, [300, 100, 300, 100, 300]);
  ctx.sound('whoosh');
  ctx.feed(`📣 Llamado al escenario: ${ctx.tableCfg(n).name}`, 'game');
}

/** Sortea roles y contenido del juego actual (los roles se muestran 15 s antes de empezar). */
function prepareGame(ctx, { keepRoles = false } = {}) {
  const c = cur(ctx), key = KEYS[c.gameIdx];
  if (!keepRoles || !c.roles) { c.roles = pickRoles(ctx, c.team); commitRoles(ctx, c.team, c.roles); }
  c.game = newGame(ctx, key);
  c.status = 'intro';
  c.introEndsAt = Date.now() + cfg(ctx).introSeconds * 1000;
  c.votes = { public: {}, jury: {} };
  c.result = null; c.revealStep = 0; c.awarded = false; c.voteEndsAt = 0; c.endsAt = 0; c.swaps = [];
  if (key === 'paparazzi') {
    const stage = c.team;
    const cands = [...ctx.guests.values()].filter((g) => g.table && g.table !== stage && !g.absent && ctx.isOnline(g));
    const t = cands.length ? U.pick(cands) : null;
    c.game.target = t ? t.id : null;
    if (t) { ctx.toGuest(t.id, 'PAPARAZZI_TARGET', { by: ctx.tableCfg(stage).name }); ctx.vibrateGuest(t.id, [200, 100, 200]); }
  }
}

function startPlay(ctx) {
  const c = cur(ctx), key = KEYS[c.gameIdx], g = c.game, now = Date.now();
  if (c.status !== 'intro' && c.status !== 'ready') return;
  c.status = 'play'; c.startedAt = now;
  if (key === 'objeto') { g.step = 'touch'; g.stepEndsAt = now + g.seconds * 1000; c.endsAt = g.stepEndsAt; }
  else c.endsAt = now + g.seconds * 1000;
  if (key === 'karaoke') {
    const clipId = 'k' + now.toString(36);
    st(ctx).clips.push({ id: clipId, team: c.team, blind: c.roles.blind, song: g.song, status: 'recording', at: now, ok: null, file: null });
    g.clip = clipId;
    ctx.toRoles(['camera'], 'REC_START', { clipId, team: c.team });
    st(ctx).camera.recording = clipId;
  }
  ctx.sound('start');
  ctx.vibrateTable(c.team, [150]);
}

function endPlay(ctx) {
  const c = cur(ctx), key = KEYS[c.gameIdx], g = c.game, now = Date.now();
  if (c.status !== 'play') return;
  if (key === 'karaoke') {
    c.status = 'mark'; g.markDeadline = now + 30000;
    c.tailEndsAt = now + cfg(ctx).karaoke.tailSeconds * 1000;
    ctx.sound('tick');
  } else enterVote(ctx);
}

function enterVote(ctx) {
  const c = cur(ctx), key = KEYS[c.gameIdx], now = Date.now();
  c.status = 'vote';
  const n = key === 'paparazzi' ? Math.max(1, c.game.shots.length) : 1;
  c.voteEndsAt = now + cfg(ctx).voteSeconds * 1000 * n;
  if (key === 'paparazzi') { c.game.photoIdx = 0; c.game.photoVotes = {}; c.game.photoStart = now; }
  ctx.sound('redoble');
  for (const g of audience(ctx)) ctx.vibrateGuest(g.id, [120]);
}

const audience = (ctx) => { const c = cur(ctx); return c ? [...ctx.guests.values()].filter((g) => g.table !== c.team && !g.absent && g.stage === 'team') : []; };

function closeVote(ctx) {
  const c = cur(ctx), key = KEYS[c.gameIdx], g = c.game, bc = cfg(ctx);
  const jv = Object.values(c.votes.jury);
  const juryStars = jv.length ? mean(jv) : 3;
  const jury = Math.round(juryStars * 10 * 10) / 10 * (bc.juryWeight / 50);
  let pub = 0, pubDetail = {};
  if (key === 'charada') {
    const vs = Object.values(c.votes.public), yes = vs.filter((v) => v === 1).length;
    pub = vs.length ? (yes / vs.length) * bc.publicWeight : 0;
    pubDetail = { yes, total: vs.length };
  } else if (key === 'paparazzi') {
    const all = Object.values(g.photoVotes || {}).flatMap((o) => Object.values(o));
    pub = all.length ? mean(all) * 10 * (bc.publicWeight / 50) : 0;
    pubDetail = { votes: all.length };
  } else {
    const vs = Object.values(c.votes.public);
    pub = vs.length ? mean(vs) * 10 * (bc.publicWeight / 50) : 0;
    pubDetail = { votes: vs.length };
  }
  const fault = key === 'karaoke' ? Math.min(bc.fault.maxPerGame, g.faults * bc.fault.points) : 0;
  const raw = Math.max(0, Math.round((jury + pub - fault) * 10) / 10);
  c.result = { jury: Math.round(jury * 10) / 10, juryVotes: jv.length, juryDefault: !jv.length, pub: Math.round(pub * 10) / 10, ...pubDetail, fault, raw, mult: ctx.multiplier(c.team) };
  c.result.total = Math.round(raw * c.result.mult);
  c.status = 'reveal'; c.revealAt = Date.now(); c.revealStep = 0;
  ctx.sound('redoble');
}

function finishReveal(ctx) {
  const c = cur(ctx), key = KEYS[c.gameIdx], g = c.game;
  c.status = 'revealed';
  if (c.awarded) return;
  c.awarded = true;
  const applied = ctx.award(c.team, c.result.raw, { source: 'bomba', reason: `Bomba · ${NAMES[key]}` });
  c.result.applied = applied;
  // sabotajes (solo Karaoke)
  if (key === 'karaoke' && g.saboteurs.length) {
    const cost = cfg(ctx).sabotage.cost;
    if (g.correct) ctx.addAura(c.team, cost * g.saboteurs.length, 'Sabotajes repelidos (+' + cost + ' c/u)', 'bomba');
    else for (const sb of g.saboteurs) ctx.addAura(sb.team, cost * 2, 'Sabotaje exitoso (recupera ' + cost + ' y gana ' + cost + ')', 'bomba');
  }
  c.results.push({ key, name: NAMES[key], ...c.result });
  ctx.sound(c.result.total >= 60 ? 'fanfarria' : c.result.total >= 30 ? 'success' : 'trombon');
  ctx.feed(`🏅 ${ctx.tableCfg(c.team).name} · ${NAMES[key]}: ${c.result.total} pts`, 'game');
  if (key === 'karaoke') stopRecording(ctx, true);
  if (key === 'paparazzi') for (const sh of g.shots) { const v = Object.values((g.photoVotes || {})[sh.id] || {}); st(ctx).photos.push({ url: sh.url, team: c.team, avg: v.length ? mean(v) : 0, votes: v.length, target: g.target }); }
}

function stopRecording(ctx, immediate) {
  const s = st(ctx);
  if (s.camera.recording) { ctx.toRoles(['camera'], 'REC_STOP', { clipId: s.camera.recording }); s.camera.recording = null; }
}

function nextGame(ctx) {
  const s = st(ctx), c = cur(ctx);
  if (!c || c.status !== 'revealed') return;
  if (c.gameIdx >= KEYS.length - 1) {
    const total = c.results.reduce((a, r) => a + r.total, 0);
    s.done[c.team] = { games: c.results.slice(), total, at: Date.now() };
    c.status = 'finished';
    ctx.sound('fanfarria');
    ctx.feed(`🎬 ${ctx.tableCfg(c.team).name} terminó la Bomba: ${total} pts`, 'game');
    return;
  }
  c.gameIdx++;
  prepareGame(ctx);
  ctx.vibrateTable(c.team, [200, 100, 200]);
}

/* ───────────────────────── módulo ───────────────────────── */
module.exports = {
  id,
  always: true,
  phases: ['DESACTIVA_BOMBA'],

  init(ctx) {
    ctx.state.g[id] ||= { queue: [], current: null, done: {}, hist: {}, clips: [], camera: { ready: false, recording: null }, usedAnimals: [], usedObjects: [], usedSongs: [], photos: [] };
  },
  enter(ctx) { const s = st(ctx); if (!s.queue.length) s.queue = buildQueue(ctx); },

  shift(ctx, delta) {
    const c = cur(ctx);
    if (!c) return;
    for (const k of ['introEndsAt', 'endsAt', 'voteEndsAt', 'revealAt', 'tailEndsAt', 'photoStart']) if (c[k]) c[k] += delta;
    if (c.game) for (const k of ['stepEndsAt', 'markDeadline', 'photoStart']) if (c.game[k]) c.game[k] += delta;
  },

  tick(ctx, now) {
    const c = cur(ctx);
    if (!c || ctx.state.clock.paused) return;
    const key = KEYS[c.gameIdx], g = c.game;
    if (c.tailEndsAt && now >= c.tailEndsAt) { stopRecording(ctx); c.tailEndsAt = 0; } // la cámara sigue 5 s tras el temporizador
    switch (c.status) {
      case 'intro': if (now >= c.introEndsAt) { c.status = 'ready'; ctx.dirty(); } break;
      case 'play':
        if (key === 'objeto') {
          if (g.step === 'touch' && now >= g.stepEndsAt) { g.step = 'cup'; ctx.sound('whoosh'); ctx.dirty(); }
          else if (g.step === 'reveal' && now >= g.stepEndsAt) {
            g.idx++;
            if (g.idx >= g.objects.length) enterVote(ctx);
            else { g.step = 'touch'; g.stepEndsAt = now + g.seconds * 1000; c.endsAt = g.stepEndsAt; ctx.sound('start'); }
            ctx.dirty();
          }
        } else if (now >= c.endsAt) { endPlay(ctx); ctx.dirty(); }
        break;
      case 'mark':
        if (now >= g.markDeadline) { g.correct = false; enterVote(ctx); ctx.dirty(); }
        break;
      case 'vote': {
        if (key === 'paparazzi' && g.shots.length) {
          const idx = Math.min(g.shots.length - 1, Math.floor((now - g.photoStart) / (cfg(ctx).voteSeconds * 1000)));
          if (idx !== g.photoIdx) { g.photoIdx = idx; ctx.sound('redoble'); ctx.dirty(); }
        }
        if (now >= c.voteEndsAt) {
          const jurorsDone = Object.keys(c.votes.jury).length >= (ctx.config.jurors || 3);
          if (jurorsDone || now >= c.voteEndsAt + 20000) { closeVote(ctx); ctx.dirty(); }
        }
        break;
      }
      case 'reveal': {
        const dt = now - c.revealAt;
        const step = dt > 5000 ? 3 : dt > 2500 ? 2 : 1;
        if (step !== c.revealStep) { c.revealStep = step; ctx.sound(step === 3 ? 'fanfarria' : 'tick'); ctx.dirty(); }
        if (step === 3) { finishReveal(ctx); ctx.dirty(); }
        break;
      }
      default: break;
    }
  },

  /* ───── eventos de los invitados ───── */
  guest(ctx, g, ev, p) {
    if (!ev.startsWith('BOMBA_')) return false;
    if (ctx.state.phase !== 'DESACTIVA_BOMBA') return true;
    const c = cur(ctx);
    if (!c) return true;
    const key = KEYS[c.gameIdx], game = c.game, now = Date.now();
    const onStage = g.table === c.team;
    const role = onStage ? roleOf(c, g.id) : null;

    if (ev === 'BOMBA_SWAP' && onStage && (c.status === 'intro' || c.status === 'ready') && (role === 'blind' || role === 'deaf')) {
      const mute = c.roles.mute.length ? U.pick(c.roles.mute) : null; // "Prefiero otro rol": cambio con un mudo, sin penalización
      if (!mute) return true;
      if (role === 'blind') c.roles.blind = mute; else c.roles.deaf = c.roles.deaf.map((d) => (d === g.id ? mute : d));
      c.roles.mute = c.roles.mute.map((m) => (m === mute ? g.id : m));
      c.swaps.push({ at: now, from: g.id, role });
      ctx.feed(`🔄 ${g.name} prefirió otro rol (sin penalización)`, 'game');
      return true;
    }

    // público (todos los que no están en escena)
    if (ev === 'BOMBA_VOTE' && !onStage && c.status === 'vote' && !g.absent) {
      const v = Math.round(Number(p.value));
      if (key === 'charada') { if (v === 0 || v === 1) c.votes.public[g.id] = v; }
      else if (v >= 1 && v <= 5) {
        if (key === 'paparazzi') { const sh = game.shots[game.photoIdx]; if (sh) ((game.photoVotes[sh.id] ||= {})[g.id] = v); }
        else c.votes.public[g.id] = v;
      }
      return true;
    }
    if (ev === 'BOMBA_FAULT' && !onStage && key === 'karaoke' && (c.status === 'play' || c.status === 'mark')) {
      const fc = cfg(ctx).fault;
      if (game.faults * fc.points >= fc.maxPerGame || now < game.faultCool) return true;
      game.faultTaps[g.id] = now;
      const win = fc.windowSeconds * 1000;
      for (const [k, t] of Object.entries(game.faultTaps)) if (now - t > win) delete game.faultTaps[k];
      const aud = audience(ctx).filter((x) => ctx.isOnline(x)).length || 1;
      if (Object.keys(game.faultTaps).length >= Math.max(1, Math.ceil(aud * fc.percent))) {
        game.faults++; game.faultTaps = {}; game.faultCool = now + win;
        ctx.sound('trombon'); ctx.toRoles(['screen'], 'FAULT', {});
        ctx.feed(`🚩 ¡Falta! (${game.faults}) a ${ctx.tableCfg(c.team).name}`, 'game');
      }
      return true;
    }
    if (ev === 'BOMBA_SABOTAGE' && !onStage && key === 'karaoke' && c.status === 'play') {
      const sc = cfg(ctx).sabotage, kind = p.kind;
      if (!['flip', 'erase', 'horn'].includes(kind) || game.saboteurs.length >= sc.maxPerRound) return true;
      if ((ctx.state.aura[g.table] || 0) < sc.cost) { ctx.toGuest(g.id, 'TOAST', { message: 'Tu equipo no tiene puntos suficientes para sabotear.' }); return true; }
      ctx.addAura(g.table, -sc.cost, `Sabotaje (${kind})`, 'bomba');
      game.saboteurs.push({ team: g.table, kind, at: now, by: g.id });
      if (kind === 'flip') game.flipUntil = now + 8000;
      if (kind === 'erase') { const free = game.board.map((_, i) => i).filter((i) => !game.erased.includes(i)); game.erased.push(...U.shuffle(free).slice(0, 2)); }
      if (kind === 'horn') ctx.toGuest(c.roles.blind, 'SABOTAGE_HORN', { seconds: cfg(ctx).hornSeconds || 3 });
      ctx.sound(kind === 'horn' ? 'bocina' : 'pop');
      ctx.toRoles(['screen'], 'SABOTAGE', { kind, team: g.table });
      ctx.feed(`😈 ${ctx.tableCfg(g.table).name} saboteó a ${ctx.tableCfg(c.team).name} (${kind})`, 'game');
      return true;
    }

    // mudos de Karaoke arman la secuencia de emojis
    if (ev === 'BOMBA_EMOJI' && onStage && role === 'mute' && key === 'karaoke' && c.status === 'play') {
      if (p.op === 'add' && game.seq.length < cfg(ctx).karaoke.maxEmojis) {
        const e = String(p.emoji || '');
        const i = game.board.indexOf(e);
        if (i >= 0 && !game.erased.includes(i)) game.seq.push(e);
      } else if (p.op === 'undo') game.seq.pop();
      else if (p.op === 'clear') game.seq = [];
      return true;
    }
    // Paparazzi: el ciego dispara (la foto llega por HTTP)
    if (ev === 'BOMBA_SHOT_BLOCKED') return true;
    return true;
  },

  /** Foto de Paparazzi subida por el celular del ciego. */
  onPhoto(ctx, g, buf) {
    const c = cur(ctx);
    if (!c || KEYS[c.gameIdx] !== 'paparazzi' || c.status !== 'play' || c.roles.blind !== g.id) return { error: 'No es tu turno de disparar' };
    if (c.game.shots.length >= cfg(ctx).paparazzi.shots) return { error: 'Sin disparos restantes' };
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return { error: 'La foto debe ser JPEG' };
    const sid = 'p' + Date.now().toString(36) + c.game.shots.length;
    fs.writeFileSync(path.join(ctx.uploadsDir, 'photos', sid + '.jpg'), buf);
    c.game.shots.push({ id: sid, url: `/uploads/photos/${sid}.jpg`, at: Date.now() });
    ctx.sound('shutter');
    ctx.vibrateGuest(g.id, [80]);
    if (c.game.shots.length >= cfg(ctx).paparazzi.shots) setTimeout(() => { const cc = cur(ctx); if (cc && cc.status === 'play' && KEYS[cc.gameIdx] === 'paparazzi') { endPlay(ctx); ctx.dirty(); } }, 1200);
    return { ok: true, left: cfg(ctx).paparazzi.shots - c.game.shots.length };
  },

  /** Clip del Karaoke grabado por /camara. */
  onClip(ctx, q, buf, type) {
    const s = st(ctx), clip = s.clips.find((x) => x.id === q.id);
    if (!clip) return { error: 'Clip desconocido' };
    const ext = /mp4/.test(type) ? 'mp4' : 'webm';
    fs.writeFileSync(path.join(ctx.uploadsDir, 'clips', `${clip.id}.${ext}`), buf);
    clip.file = `/uploads/clips/${clip.id}.${ext}`; clip.status = clip.status === 'discarded' ? 'discarded' : 'ready'; clip.size = buf.length;
    ctx.feed(`🎥 Clip del Karaoke subido (${Math.round(buf.length / 1024)} KB)`, 'game');
    return { ok: true };
  },

  /** Eventos desde /jurado */
  jury(ctx, juror, ev, p) {
    const c = cur(ctx);
    if (ev === 'JURY_VOTE' && c && c.status === 'vote') {
      const v = Math.round(Number(p.stars));
      if (v >= 1 && v <= 5) { c.votes.jury[juror] = v; return true; }
    }
    return false;
  },
  /** Eventos desde /camara */
  camera(ctx, ev, p) {
    const s = st(ctx);
    if (ev === 'CAMERA_READY') { s.camera.ready = true; return true; }
    if (ev === 'CAMERA_STATE') { s.camera.recording = p.recording ? p.clipId || s.camera.recording : null; return true; }
    if (ev === 'CAMERA_FAILED') { const clip = s.clips.find((x) => x.id === p.clipId); if (clip) clip.status = 'failed'; return true; }
    return false;
  },

  /* ───── admin ───── */
  admin(ctx, cmd, a) {
    const s = st(ctx), c = cur(ctx);
    switch (cmd) {
      case 'BOMBA_QUEUE_RESET': s.queue = buildQueue(ctx); return true;
      case 'BOMBA_QUEUE_MOVE': {
        const i = s.queue.indexOf(Number(a.team)), j = i + (a.dir < 0 ? -1 : 1);
        if (i >= 0 && j >= 0 && j < s.queue.length) [s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]];
        return true;
      }
      case 'BOMBA_CALL': { const n = Number(a.team) || s.queue.find((t) => !s.done[t]); if (n) callTeam(ctx, n); return true; }
      case 'BOMBA_START': startPlay(ctx); return true;
      case 'BOMBA_END': if (c && c.status === 'play') { if (KEYS[c.gameIdx] === 'objeto') enterVote(ctx); else endPlay(ctx); } return true;
      case 'BOMBA_SKIP_VOTE': if (c && c.status === 'vote') { c.voteEndsAt = Date.now(); c.votes.jury = Object.keys(c.votes.jury).length ? c.votes.jury : {}; closeVote(ctx); } return true;
      case 'BOMBA_NEXT': if (c && c.status === 'revealed') nextGame(ctx); return true;
      case 'BOMBA_ROLES': if (c && (c.status === 'intro' || c.status === 'ready')) { c.roles = pickRoles(ctx, c.team); commitRoles(ctx, c.team, c.roles); ctx.vibrateTable(c.team, [150]); } return true;
      case 'BOMBA_ADD_TIME': if (c && c.status === 'play') { c.endsAt += (Number(a.seconds) || 15) * 1000; if (c.game.stepEndsAt) c.game.stepEndsAt += (Number(a.seconds) || 15) * 1000; } return true;
      case 'BOMBA_CUP': { // objeto a ciegas: el ayudante toca en qué vaso (1–4) metió el objeto
        if (!c || KEYS[c.gameIdx] !== 'objeto' || c.game.step !== 'cup') return true;
        const o = c.game.objects[c.game.idx], cup = Math.max(1, Math.min(4, Number(a.cup)));
        o.cup = cup; o.ok = cup === o.pos;
        c.game.step = 'reveal'; c.game.stepEndsAt = Date.now() + 5500;
        ctx.sound(o.ok ? 'fanfarria' : cup === 4 ? 'trombon' : 'fail');
        return true;
      }
      case 'BOMBA_MARK': { // karaoke: el ayudante marca Acertó/Falló
        if (!c || KEYS[c.gameIdx] !== 'karaoke' || (c.status !== 'mark' && c.status !== 'play')) return true;
        c.game.correct = !!a.ok;
        const clip = s.clips.find((x) => x.id === c.game.clip); if (clip) clip.ok = !!a.ok;
        ctx.sound(a.ok ? 'fanfarria' : 'trombon');
        if (c.status === 'play') { c.status = 'mark'; c.tailEndsAt = Date.now() + cfg(ctx).karaoke.tailSeconds * 1000; }
        setTimeout(() => { const cc = cur(ctx); if (cc && cc.status === 'mark') { enterVote(ctx); ctx.dirty(); } }, 1500);
        return true;
      }
      case 'BOMBA_REPEAT': { // descartar la ronda actual (y su clip) y repetirla con los mismos roles
        if (!c || ['revealed', 'finished'].includes(c.status)) return true;
        const clip = s.clips.find((x) => x.id === (c.game && c.game.clip)); if (clip) clip.status = 'discarded';
        stopRecording(ctx);
        prepareGame(ctx, { keepRoles: true });
        return true;
      }
      case 'BOMBA_DISCARD_CLIP': { const clip = s.clips.find((x) => x.id === a.id); if (clip) clip.status = 'discarded'; return true; }
      case 'BOMBA_CLEAR': s.current = null; return true;
      default: return false;
    }
  },

  force(ctx) { const c = cur(ctx); if (c && c.status === 'play') endPlay(ctx); else if (c && c.status === 'vote') { closeVote(ctx); } },

  /* ───── vistas ───── */
  scene(ctx, audienceMode = true) {
    const s = st(ctx), c = s.current;
    const base = { queue: s.queue.map((n) => ({ n, name: ctx.tableCfg(n).name, color: ctx.tableCfg(n).color, emoji: ctx.tableCfg(n).emoji, done: s.done[n] ? s.done[n].total : null, current: !!(c && c.team === n && c.status !== 'finished'), size: ctx.membersOf(n).length })), totals: s.done };
    if (!c) return { ...base, current: null };
    const key = KEYS[c.gameIdx], g = c.game;
    const t = ctx.tableCfg(c.team);
    const roles = { blind: label(ctx.guests.get(c.roles.blind)), deaf: c.roles.deaf.map((x) => label(ctx.guests.get(x))), mute: c.roles.mute.map((x) => label(ctx.guests.get(x))) };
    const showReveal = c.status === 'vote' || c.status === 'reveal' || c.status === 'revealed';
    const cur2 = {
      team: c.team, teamName: t.name, color: t.color, emoji: t.emoji, key, gameName: NAMES[key], icon: ICONS[key], gameIdx: c.gameIdx, games: KEYS.length,
      status: c.status, introEndsAt: c.introEndsAt, endsAt: c.endsAt, voteEndsAt: c.voteEndsAt, revealStep: c.revealStep || 0, roles,
      result: c.status === 'reveal' || c.status === 'revealed' ? c.result : null, results: c.results, swaps: c.swaps.length,
      publicVotes: Object.keys(c.votes.public).length, juryVotes: Object.keys(c.votes.jury).length, jurors: ctx.config.jurors || 3,
    };
    if (key === 'charada') cur2.game = { animal: showReveal ? g.animal : null };
    if (key === 'objeto') cur2.game = {
      idx: g.idx, total: g.objects.length, step: g.step, stepEndsAt: g.stepEndsAt,
      reveal: g.objects.map((o, i) => (i < g.idx || (i === g.idx && g.step === 'reveal') || showReveal ? { name: o.name, cup: o.cup, ok: o.ok, pos: o.pos } : null)),
    };
    if (key === 'paparazzi') cur2.game = { shots: g.shots.length, left: cfg(ctx).paparazzi.shots - g.shots.length, target: label(ctx.guests.get(g.target)), photos: showReveal ? g.shots.map((x) => x.url) : [], photoIdx: g.photoIdx || 0, photoStart: g.photoStart || 0 };
    if (key === 'karaoke') cur2.game = { seq: g.seq, faults: g.faults, maxFaults: cfg(ctx).fault.maxPerGame / cfg(ctx).fault.points, saboteurs: g.saboteurs.map((x) => ({ team: x.team, kind: x.kind })), song: showReveal ? g.song : null, correct: g.correct, flip: Date.now() < g.flipUntil, markDeadline: g.markDeadline };
    return { ...base, current: cur2 };
  },
  viewScreen(ctx) { return this.scene(ctx); },
  viewJury(ctx, juror) {
    const sc = this.scene(ctx), c = cur(ctx);
    return { ...sc, juror, myVote: c ? c.votes.jury[juror] || null : null, canVote: !!(c && c.status === 'vote') };
  },
  viewCamera(ctx) {
    const s = st(ctx), c = cur(ctx);
    return { ready: s.camera.ready, recording: s.camera.recording, team: c ? ctx.tableCfg(c.team).name : null, game: c ? NAMES[KEYS[c.gameIdx]] : null, clips: s.clips.slice(-6).map((x) => ({ id: x.id, status: x.status })) };
  },
  viewAdmin(ctx) {
    const s = st(ctx), c = cur(ctx);
    const sc = this.scene(ctx);
    const out = { ...sc, clips: s.clips.map((x) => ({ id: x.id, team: x.team, song: x.song, status: x.status, ok: x.ok, file: x.file, blind: (label(ctx.guests.get(x.blind)) || {}).name })), camera: s.camera, doneRaw: s.done };
    if (c) {
      const key = KEYS[c.gameIdx], g = c.game;
      out.secret = {};
      if (key === 'charada') out.secret = { animal: g.animal };
      if (key === 'objeto') out.secret = { cur: g.objects[g.idx], step: g.step, all: g.objects.map((o) => ({ name: o.name, cup: o.cup, ok: o.ok })) };
      if (key === 'paparazzi') out.secret = { target: (label(ctx.guests.get(g.target)) || {}).name, shots: g.shots.length };
      if (key === 'karaoke') out.secret = { song: g.song, seq: g.seq.join(' '), saboteurs: g.saboteurs.length };
      out.juryVotesRaw = c.votes.jury;
    }
    return out;
  },

  viewGuest(ctx, g) {
    const s = st(ctx), c = s.current;
    const mine = g.table;
    const pos = s.queue.indexOf(mine);
    const base = { queuePos: pos >= 0 ? pos + 1 : null, myDone: s.done[mine] ? s.done[mine].total : null, called: !!(c && c.team === mine && c.status !== 'finished') };
    if (!c) return { ...base, scene: null };
    const scene = this.scene(ctx);
    const onStage = mine === c.team && c.status !== 'finished';
    const key = KEYS[c.gameIdx], game = c.game;
    const out = { ...base, scene: scene.current, onStage };
    if (onStage) {
      const role = roleOf(c, g.id);
      out.role = role;
      const priv = {};
      if (key === 'charada' && role === 'mute' && (c.status === 'play' || c.status === 'ready' || c.status === 'intro')) priv.animal = game.animal;
      if (key === 'objeto' && role === 'deaf') { const o = game.objects[game.idx]; priv.options = o && (game.step === 'touch' || game.step === 'cup') ? [...o.options, 'Espacio exterior'] : null; priv.n = game.idx + 1; }
      if (key === 'paparazzi') {
        if (role === 'mute') priv.target = label(ctx.guests.get(game.target));
        if (role === 'blind') priv.shotsLeft = cfg(ctx).paparazzi.shots - game.shots.length;
      }
      if (key === 'karaoke') {
        if (role === 'mute') { priv.title = game.song; priv.board = game.board.map((e, i) => (game.erased.includes(i) ? null : e)); priv.seq = game.seq; priv.max = cfg(ctx).karaoke.maxEmojis; priv.flip = Date.now() < game.flipUntil; }
        if (role === 'deaf') priv.seq = game.seq;
      }
      out.priv = priv;
    } else if (!g.absent && g.stage === 'team') {
      out.audience = true;
      const myPub = c.votes.public[g.id];
      out.vote = { open: c.status === 'vote', mine: key === 'paparazzi' ? ((game.photoVotes && game.shots[game.photoIdx] && (game.photoVotes[game.shots[game.photoIdx].id] || {})[g.id]) || null) : myPub ?? null, kind: key === 'charada' ? 'yesno' : 'stars', photoIdx: game.photoIdx || 0 };
      if (key === 'karaoke') { out.sab = { cost: cfg(ctx).sabotage.cost, left: cfg(ctx).sabotage.maxPerRound - game.saboteurs.length, canAfford: (ctx.state.aura[mine] || 0) >= cfg(ctx).sabotage.cost, active: c.status === 'play' }; out.fault = { active: c.status === 'play' || c.status === 'mark', cool: game.faultCool }; }
      if (key === 'paparazzi' && game.target === g.id) out.isTarget = true;
    }
    return out;
  },
};
