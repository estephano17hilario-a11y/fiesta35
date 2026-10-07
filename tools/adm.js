'use strict';
// Atajo de consola para el anfitrión/desarrollo:  node tools/adm.js SET_PHASE '{"phase":"KAHOOT"}'
const WebSocket = require('ws');
const [cmd, args = '{}'] = process.argv.slice(2);
const host = process.env.HOST || 'localhost:3000';
const key = process.env.ADMIN_SECRET_KEY || 'CumpleGianella35MasterKey';
const ws = new WebSocket(`ws://${host}/ws?role=admin`);
ws.on('open', () => ws.send(JSON.stringify({ event: 'ADMIN_LOGIN', payload: { key } })));
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.event === 'ADMIN_OK') {
    for (const c of cmd.split(',')) ws.send(JSON.stringify({ event: 'ADMIN_CMD', payload: { cmd: c, args: JSON.parse(args) } }));
    setTimeout(() => process.exit(0), 400);
  }
});
