'use strict';
// Persistencia SQLite integrada en Node (node:sqlite): cero instalación, sobrevive reinicios.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function open(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS guests (
      id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, alias TEXT,
      table_n INTEGER, survey TEXT NOT NULL DEFAULT '{}', kahoot_score INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL, last_seen INTEGER, extra TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guest_id TEXT, event_type TEXT NOT NULL,
      ip TEXT, user_agent TEXT, created_at INTEGER NOT NULL
    );
    -- Ledger de puntos: solo se AÑADE (append-only). Un "deshacer" es otra fila con delta contrario y ref a la original.
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, team INTEGER, source TEXT NOT NULL,
      delta INTEGER NOT NULL, balance INTEGER NOT NULL, reason TEXT, ref INTEGER
    );
    CREATE TABLE IF NOT EXISTS aura_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, table_n INTEGER NOT NULL, round_number INTEGER,
      bet_type TEXT, amount INTEGER, detail TEXT, status TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS gianella_verdicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, table_n INTEGER NOT NULL, suspect TEXT, weapon TEXT,
      motive TEXT, is_correct INTEGER DEFAULT 0, submitted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const q = {
    insGuest: db.prepare(`INSERT OR REPLACE INTO guests (id,token,name,alias,table_n,survey,kahoot_score,created_at,last_seen,extra)
                          VALUES (?,?,?,?,?,?,?,?,?,?)`),
    delGuest: db.prepare('DELETE FROM guests WHERE id = ?'),
    allGuests: db.prepare('SELECT * FROM guests ORDER BY created_at'),
    log: db.prepare('INSERT INTO access_logs (guest_id,event_type,ip,user_agent,created_at) VALUES (?,?,?,?,?)'),
    recentLogs: db.prepare(`SELECT l.event_type, l.ip, l.created_at, g.name FROM access_logs l
                            LEFT JOIN guests g ON g.id = l.guest_id ORDER BY l.id DESC LIMIT ?`),
    ledger: db.prepare('INSERT INTO ledger (ts,team,source,delta,balance,reason,ref) VALUES (?,?,?,?,?,?,?)'),
    ledgerAll: db.prepare('SELECT * FROM ledger ORDER BY id'),
    bet: db.prepare('INSERT INTO aura_bets (table_n,round_number,bet_type,amount,detail,status,created_at) VALUES (?,?,?,?,?,?,?)'),
    verdict: db.prepare('INSERT INTO gianella_verdicts (table_n,suspect,weapon,motive,is_correct,submitted_at) VALUES (?,?,?,?,?,?)'),
    setKv: db.prepare('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    getKv: db.prepare('SELECT value FROM kv WHERE key = ?'),
  };

  const KNOWN = ['id', 'token', 'name', 'alias', 'table', 'survey', 'kahootScore', 'createdAt', 'lastSeen'];
  return {
    raw: db,
    loadGuests: () =>
      q.allGuests.all().map((r) => ({
        id: r.id, token: r.token, name: r.name, alias: r.alias || '', table: r.table_n,
        survey: JSON.parse(r.survey || '{}'), kahootScore: r.kahoot_score || 0,
        createdAt: r.created_at, lastSeen: r.last_seen || 0, ...JSON.parse(r.extra || '{}'),
      })),
    saveGuest: (g) => {
      const extra = {};
      for (const k of Object.keys(g)) if (!KNOWN.includes(k) && !k.startsWith('_')) extra[k] = g[k];
      q.insGuest.run(g.id, g.token, g.name, g.alias || '', g.table ?? null, JSON.stringify(g.survey || {}),
        g.kahootScore || 0, g.createdAt, g.lastSeen || null, JSON.stringify(extra));
    },
    deleteGuest: (id) => q.delGuest.run(id),
    log: (guestId, type, ip, ua) => q.log.run(guestId ?? null, type, ip ?? null, (ua || '').slice(0, 300), Date.now()),
    recentLogs: (n = 40) => q.recentLogs.all(n),
    /** Añade una fila al ledger y devuelve su id. */
    ledgerAdd: (e) => Number(q.ledger.run(Date.now(), e.team ?? null, e.source || 'manual', e.delta, e.balance, e.reason || '', e.ref ?? null).lastInsertRowid),
    ledgerAll: () => q.ledgerAll.all(),
    bet: (t, round, type, amount, detail, status) => q.bet.run(t, round, type, amount, detail || '', status, Date.now()),
    verdict: (t, s, w, m, ok) => q.verdict.run(t, s, w, m, ok ? 1 : 0, Date.now()),
    saveState: (obj) => q.setKv.run('state', JSON.stringify(obj)),
    loadState: () => { const r = q.getKv.get('state'); return r ? JSON.parse(r.value) : null; },
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    /** Reinicia el evento. El ledger se conserva como auditoría (se marca con una fila de reinicio). */
    resetAll() {
      db.exec('DELETE FROM guests; DELETE FROM access_logs; DELETE FROM aura_bets; DELETE FROM gianella_verdicts; DELETE FROM kv;');
    },
    backup(file) { db.exec(`VACUUM INTO '${String(file).replace(/'/g, "''")}'`); },
    close: () => db.close(),
  };
}

module.exports = { open };
