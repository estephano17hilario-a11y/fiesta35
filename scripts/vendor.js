// Copia librerías del navegador a public/vendor para que la app funcione SIN internet.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'vendor');
fs.mkdirSync(out, { recursive: true });
const copy = (from, to) => {
  try { fs.copyFileSync(path.join(root, 'node_modules', from), path.join(out, to)); }
  catch (e) { console.warn('vendor: no se pudo copiar', from, e.message); }
};
copy('htm/preact/standalone.module.js', 'preact.js');
copy('qrcode-generator/dist/qrcode.js', 'qrcode.js');
