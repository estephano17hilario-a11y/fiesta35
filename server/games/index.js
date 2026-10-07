'use strict';
// Registro de juegos. Cada módulo implementa (todo opcional salvo id/phases):
//  init, enter, tick, guest, admin, force, shift, viewGuest, viewScreen, viewAdmin
const list = [
  require('./entrada'),
  require('./caja'),
  require('./bomba'),
  require('./cierre'),
  require('./crimen'),
  require('./keiko'),
  require('./kahoot'),
  require('./aura'),
  require('./estatua'),
  require('./pixel'),
  require('./foto'),
  require('./ceremonia'),
];
module.exports = { list };
