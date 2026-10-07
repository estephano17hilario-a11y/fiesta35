// Banco de efectos sintetizados con Web Audio API (sin archivos de audio: funciona sin internet).
// Solo la Pantalla Central y, opcionalmente, el Admin reproducen sonido; los celulares de invitados no.
let AC = null, master = null, humNodes = null;

function ctx() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.9;
    const comp = AC.createDynamicsCompressor();
    master.connect(comp); comp.connect(AC.destination);
  }
  return AC;
}
export function unlock() { const a = ctx(); if (a.state !== 'running') a.resume(); return a.state === 'running'; }
export const isUnlocked = () => !!AC && AC.state === 'running';
export function setVolume(v) { ctx(); master.gain.value = v; }

function env(g, t0, a, d, peak, floor = 0.0001) {
  g.gain.setValueAtTime(floor, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, floor * 2), t0 + a);
  g.gain.exponentialRampToValueAtTime(floor, t0 + a + d);
}
function tone(freq, dur, { type = 'sine', vol = 0.25, to = null, delay = 0, attack = 0.01, filter = null, vibrato = 0 } = {}) {
  const a = ctx(), t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  let out = o;
  if (filter) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); out = f; }
  if (vibrato) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = 6; lg.gain.value = vibrato; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.1); }
  env(g, t0, attack, Math.max(0.02, dur - attack), vol);
  out.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.1);
}
let noiseBuf = null;
function noise(dur, { vol = 0.2, type = 'lowpass', freq = 2000, q = 1, delay = 0, attack = 0.005, to = null } = {}) {
  const a = ctx(), t0 = a.currentTime + delay;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = a.createGain(); env(g, t0, attack, Math.max(0.02, dur - attack), vol);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t0, Math.random()); s.stop(t0 + dur + 0.1);
}

const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, C6: 1046.5 };

export const SOUNDS = {
  // ── Pads del DJ ──
  bocina() { tone(311, 1.1, { type: 'sawtooth', vol: 0.25, filter: 2500 }); tone(370, 1.1, { type: 'sawtooth', vol: 0.25, filter: 2500 }); tone(466, 1.1, { type: 'square', vol: 0.08 }); },
  pedo() { tone(95, 0.8, { type: 'sawtooth', vol: 0.35, to: 48, vibrato: 25, filter: 600 }); noise(0.8, { vol: 0.25, freq: 300, to: 120 }); },
  gallina() {
    for (let i = 0; i < 7; i++) {
      const f = 520 + Math.random() * 260;
      tone(f, 0.09, { type: 'square', vol: 0.12, to: f * 1.35, delay: i * 0.11, filter: 2200 });
      noise(0.07, { vol: 0.06, type: 'bandpass', freq: 1800, delay: i * 0.11 });
    }
    tone(300, 0.35, { type: 'sawtooth', vol: 0.1, to: 700, delay: 0.85, filter: 1800 });
  },
  trombon() {
    [[233, 0.5], [220, 0.5], [208, 0.5], [196, 1.4]].reduce((t, [f, d], i) => {
      tone(f, d * 0.95, { type: 'sawtooth', vol: 0.22, filter: 900, delay: t, vibrato: i === 3 ? 6 : 0, to: i === 3 ? f * 0.82 : null });
      return t + d;
    }, 0);
  },
  redoble() {
    for (let i = 0; i < 50; i++) noise(0.05, { vol: 0.05 + (i / 50) * 0.22, type: 'bandpass', freq: 1600, q: 0.7, delay: i * 0.042 });
    tone(110, 2.2, { type: 'sine', vol: 0.15, to: 90 });
    noise(1.4, { vol: 0.35, type: 'highpass', freq: 5000, delay: 2.15, attack: 0.002 });
  },
  fanfarria() {
    const seq = [[N.C5, 0.14], [N.C5, 0.14], [N.C5, 0.14], [N.C5, 0.5], [N.G4, 0.5], [N.A4, 0.5], [N.C5, 0.22], [N.A4, 0.16], [N.C5, 0.9]];
    seq.reduce((t, [f, d]) => { tone(f, d * 1.1, { type: 'square', vol: 0.12, filter: 3000, delay: t }); tone(f / 2, d * 1.1, { type: 'sawtooth', vol: 0.07, filter: 1200, delay: t }); return t + d; }, 0);
  },
  risa() {
    for (let i = 0; i < 7; i++) {
      const base = 210 + Math.random() * 40 - i * 4;
      tone(base, 0.13, { type: 'sawtooth', vol: 0.14, to: base * 0.85, delay: i * 0.17, filter: 1100 });
      noise(0.1, { vol: 0.08, type: 'bandpass', freq: 900, q: 3, delay: i * 0.17 });
    }
  },
  aplausos() { for (let i = 0; i < 90; i++) noise(0.035, { vol: 0.08 + Math.random() * 0.1, type: 'bandpass', freq: 1500 + Math.random() * 3500, q: 0.6, delay: Math.random() * 2.2 * (0.4 + i / 150) }); },

  // ── Juego ──
  latch() { noise(0.05, { vol: 0.5, type: 'bandpass', freq: 2200, q: 4 }); tone(180, 0.15, { type: 'square', vol: 0.25, to: 90, delay: 0.08 }); tone(90, 0.5, { type: 'triangle', vol: 0.3, delay: 0.35, to: 60 }); noise(0.25, { vol: 0.3, type: 'lowpass', freq: 600, delay: 0.5 }); },
  alarm() { for (let i = 0; i < 4; i++) { tone(880, 0.16, { type: 'square', vol: 0.18, delay: i * 0.3, filter: 2500 }); tone(660, 0.16, { type: 'square', vol: 0.18, delay: i * 0.3 + 0.15, filter: 2500 }); } },
  boom() { noise(1.8, { vol: 0.8, type: 'lowpass', freq: 900, to: 60 }); tone(70, 1.6, { type: 'sine', vol: 0.7, to: 25 }); },
  defused() { [N.E5, N.G5, N.C6].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.12 })); tone(N.C6, 0.9, { type: 'sine', vol: 0.15, delay: 0.4 }); },
  success() { [N.C5, N.E5, N.G5].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.2, delay: i * 0.1 })); },
  fail() { tone(220, 0.3, { type: 'sawtooth', vol: 0.18, to: 150, filter: 900 }); tone(165, 0.5, { type: 'sawtooth', vol: 0.18, to: 100, delay: 0.25, filter: 900 }); },
  tick() { tone(1400, 0.05, { type: 'square', vol: 0.1 }); },
  beep() { tone(1000, 0.12, { type: 'square', vol: 0.15, filter: 3000 }); },
  zap() { noise(0.5, { vol: 0.35, type: 'highpass', freq: 3000 }); tone(60, 0.5, { type: 'sawtooth', vol: 0.3, to: 400, filter: 1500 }); },
  whoosh() { noise(0.5, { vol: 0.25, type: 'bandpass', freq: 400, q: 1.5, to: 3500 }); },
  start() { tone(660, 0.12, { type: 'square', vol: 0.15 }); tone(990, 0.3, { type: 'square', vol: 0.15, delay: 0.14 }); },
  shutter() { noise(0.04, { vol: 0.7, type: 'highpass', freq: 3000 }); noise(0.07, { vol: 0.6, type: 'bandpass', freq: 1800, delay: 0.09 }); tone(2400, 0.04, { type: 'square', vol: 0.1, delay: 0.01 }); },
  whatsapp() { tone(1320, 0.07, { type: 'sine', vol: 0.2 }); tone(1760, 0.12, { type: 'sine', vol: 0.2, delay: 0.08 }); },
  gavel() { noise(0.08, { vol: 0.7, type: 'lowpass', freq: 900 }); tone(140, 0.2, { type: 'triangle', vol: 0.5, to: 90 }); },
  pop() { tone(500, 0.08, { type: 'sine', vol: 0.25, to: 900 }); },
  star() { [N.G5, N.C6, N.G5, N.C6].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.09 })); },
};
// alias
SOUNDS.drum = SOUNDS.redoble;

export function play(id) {
  try { const a = ctx(); if (a.state !== 'running') a.resume(); (SOUNDS[id] || SOUNDS.pop)(); } catch (e) { console.warn('sfx', id, e); }
}

/** Zumbido eléctrico continuo cuya intensidad sigue la energía (0–1). */
export function hum(level) {
  const a = ctx();
  if (!humNodes) {
    const o1 = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start();
    humNodes = { o1, o2, g, f };
  }
  const { o1, o2, g, f } = humNodes, t = a.currentTime;
  o1.frequency.setTargetAtTime(60 + level * 220, t, 0.05);
  o2.frequency.setTargetAtTime(120 + level * 440 + 3, t, 0.05);
  f.frequency.setTargetAtTime(300 + level * 2500, t, 0.05);
  g.gain.setTargetAtTime(level > 0.01 ? 0.04 + level * 0.14 : 0, t, 0.05);
}
export function humStop() { if (humNodes) humNodes.g.gain.setTargetAtTime(0, ctx().currentTime, 0.05); }

export const PADS = [
  { id: 'bocina', label: 'Bocina', icon: '📯' }, { id: 'pedo', label: 'Pedo Goma', icon: '💨' },
  { id: 'gallina', label: 'Gallina', icon: '🐔' }, { id: 'trombon', label: 'Trombón', icon: '🎺' },
  { id: 'redoble', label: 'Redoble', icon: '🥁' }, { id: 'fanfarria', label: 'Fanfarria', icon: '🎉' },
  { id: 'risa', label: 'Risa Cómica', icon: '🤣' }, { id: 'aplausos', label: 'Aplausos', icon: '👏' },
];
