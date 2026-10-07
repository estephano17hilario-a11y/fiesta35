'use strict';
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => crypto.timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)));
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => crypto.randomUUID();
const token = () => crypto.randomBytes(18).toString('base64url');

// PRNG determinista (mulberry32) para repartir cosas de forma reproducible.
function rngFrom(seed) {
  let a = typeof seed === 'number' ? seed : parseInt(sha(seed).slice(0, 8), 16);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];
const colLetter = (x) => String.fromCharCode(64 + x); // 1 -> A

module.exports = { sha, safeEq, norm, clamp, uid, token, rngFrom, shuffle, pick, colLetter };
