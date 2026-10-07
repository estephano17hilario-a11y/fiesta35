// Genera las semillas de contenido editables (server/content/*.json).
// Se copian a data/content/ la primera vez que arranca el servidor y se editan desde Admin › Contenido.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'server', 'content');
fs.mkdirSync(dir, { recursive: true });
const w = (n, o) => fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(o, null, 2));

// 8 preguntas "esto o aquello": 5 miden rasgos ocultos (E,O,A,C,S) y 3 son rompehielos (peso casi nulo).
w('test', {
  questions: [
    { id: 'q1', kind: 'taste', key: 'comida', q: 'Para cenar hoy…', a: { label: 'Pizza', emoji: '🍕' }, b: { label: 'Sushi', emoji: '🍣' } },
    { id: 'q2', kind: 'trait', trait: 'C', q: 'Sábado perfecto', a: { label: 'Plan armado', emoji: '📋', v: 1 }, b: { label: 'Improvisar', emoji: '🎲', v: 0 } },
    { id: 'q3', kind: 'trait', trait: 'E', q: 'En una fiesta…', a: { label: 'Charla profunda con 1 persona', emoji: '🫂', v: 0 }, b: { label: 'Dar vueltas saludando', emoji: '👋', v: 1 } },
    { id: 'q4', kind: 'taste', key: 'lugar', q: 'Vacaciones soñadas', a: { label: 'Playa', emoji: '🏖️' }, b: { label: 'Montaña', emoji: '⛰️' } },
    { id: 'q5', kind: 'trait', trait: 'O', q: 'Ciudad nueva: ¿dónde comes?', a: { label: 'El restaurante de siempre', emoji: '🍽️', v: 0 }, b: { label: 'Lo desconocido', emoji: '🧭', v: 1 } },
    { id: 'q6', kind: 'trait', trait: 'A', q: 'Dos amigos discuten por qué pedir', a: { label: 'Mediar', emoji: '🕊️', v: 1 }, b: { label: 'Que se arreglen solos', emoji: '🍿', v: 0 } },
    { id: 'q7', kind: 'taste', key: 'horario', q: 'Tu horario natural', a: { label: 'Madrugar', emoji: '🌅' }, b: { label: 'Trasnochar', emoji: '🌙' } },
    { id: 'q8', kind: 'trait', trait: 'S', q: 'Se cae el WiFi en pleno juego…', a: { label: 'Reírme', emoji: '😂', v: 1 }, b: { label: 'Estresarme', emoji: '😖', v: 0 } },
  ],
});

w('animales-emoji', {
  animals: [
    ['🦊', 'Zorro'], ['🐼', 'Panda'], ['🦁', 'León'], ['🐯', 'Tigre'], ['🐨', 'Koala'], ['🐸', 'Rana'], ['🐵', 'Mono'], ['🐧', 'Pingüino'], ['🦉', 'Búho'], ['🦄', 'Unicornio'],
    ['🐙', 'Pulpo'], ['🦋', 'Mariposa'], ['🐢', 'Tortuga'], ['🦈', 'Tiburón'], ['🐬', 'Delfín'], ['🦒', 'Jirafa'], ['🦓', 'Cebra'], ['🐘', 'Elefante'], ['🦔', 'Erizo'], ['🦦', 'Nutria'],
    ['🦥', 'Perezoso'], ['🐿️', 'Ardilla'], ['🦜', 'Loro'], ['🦩', 'Flamenco'], ['🐝', 'Abeja'], ['🐞', 'Mariquita'], ['🦀', 'Cangrejo'], ['🐳', 'Ballena'], ['🐊', 'Cocodrilo'], ['🦘', 'Canguro'],
    ['🐪', 'Camello'], ['🦌', 'Ciervo'], ['🐺', 'Lobo'], ['🐻', 'Oso'], ['🐰', 'Conejo'], ['🐹', 'Hámster'], ['🐷', 'Cerdito'], ['🐮', 'Vaca'], ['🐔', 'Gallina'], ['🦆', 'Pato'],
  ].map(([emoji, name]) => ({ emoji, name })),
});

w('charadas', {
  animals: ['perro', 'gato', 'mono', 'elefante', 'jirafa', 'pingüino', 'canguro', 'serpiente', 'pájaro', 'gallina', 'vaca', 'caballo', 'cerdo', 'oveja', 'conejo', 'rana', 'cangrejo', 'pulpo', 'tortuga', 'león',
    'tigre', 'oso', 'gorila', 'murciélago', 'araña', 'mariposa', 'abeja', 'pez', 'tiburón', 'delfín', 'ballena', 'foca', 'pato', 'flamenco', 'águila', 'búho', 'loro', 'cocodrilo', 'camello', 'rinoceronte',
    'hipopótamo', 'zorro', 'lobo', 'ardilla', 'perezoso', 'koala', 'panda', 'cisne', 'pavo', 'avestruz', 'gusano', 'caracol', 'lagarto', 'rata', 'ciervo', 'burro', 'gallo', 'mosquito', 'oso hormiguero', 'pavo real'],
});

w('objetos', {
  objects: [
    ['Cuchara', 'Tenedor', 'Cucharón'], ['Peine', 'Cepillo de pelo', 'Rastrillo'], ['Llave', 'Abrelatas', 'Cortaúñas'], ['Esponja', 'Trapo', 'Estropajo'], ['Cepillo de dientes', 'Lapicero', 'Pincel'],
    ['Pelota de tenis', 'Naranja', 'Pelota de ping-pong'], ['Guante', 'Calcetín', 'Gorro'], ['Moneda', 'Botón', 'Tapita de botella'], ['Lápiz', 'Palito chino', 'Bolígrafo'], ['Vaso de plástico', 'Taza', 'Tupper'],
    ['Cinta adhesiva', 'Rollo de papel', 'Pulsera'], ['Control remoto', 'Calculadora', 'Celular viejo'], ['Plátano de juguete', 'Pepino', 'Zanahoria'], ['Peluche', 'Almohada pequeña', 'Guante de cocina'], ['Cadena', 'Collar', 'Cordón'],
    ['Pinza de ropa', 'Espátula', 'Tijera de plástico'], ['Corbata', 'Bufanda', 'Cinturón'], ['Dado', 'Ficha de dominó', 'Borrador'], ['Cepillo de ropa', 'Escoba pequeña', 'Plumero'], ['Colador', 'Rallador', 'Cernidor'],
    ['Mascarilla', 'Antifaz', 'Gorro de baño'], ['Cono de helado de juguete', 'Mazorca de plástico', 'Zanahoria grande'], ['Reloj', 'Brazalete', 'Cinta del pelo'], ['Gancho de ropa', 'Alambre', 'Percha pequeña'], ['Globo desinflado', 'Guante de látex', 'Bolsa de té'],
    ['Pelota antiestrés', 'Mandarina', 'Bola de papel'], ['Huevera', 'Bandeja de hielo', 'Molde de mantequilla'], ['Libro', 'Cuaderno', 'Revista'], ['Gafas', 'Lupa', 'Monóculo'], ['Cubo de Rubik', 'Dado gigante', 'Hielo de plástico'],
  ].map(([name, a, b]) => ({ name, options: [name, a, b] })),
});

const pool = ['🎤', '🎸', '🎹', '🥁', '🎺', '🎷', '🎻', '🎧', '💃', '🕺', '🔥', '❤️', '💔', '😍', '😭', '😎', '🌙', '☀️', '⭐', '🌈', '🌴', '🏖️', '🌊', '🚗', '✈️', '🚀', '🐱', '🐶', '🦈', '🐝', '🍕', '🍺', '🍹', '🍫', '🎂', '👑', '👻', '🧊', '❄️', '⛄', '⚡', '💰', '🔫', '💋', '🙌', '🤝', '📱', '🎬', '🕶️', '👶', '🐍', '🍎', '🌹', '🎁', '🕷️', '🌮', '👠', '🧟', '🚪', '🏠', '⚽', '🌍', '🐢', '⛽', '🎬'];
const split = (s) => [...s.matchAll(/\p{Extended_Pictographic}️?/gu)].map((m) => m[0]);
w('canciones', {
  pool,
  songs: [
    ['Despacito', '🐢🍫💃🌴🌊'], ['La Macarena', '💃🕺🙌🍎'], ['Bailando', '💃🕺🔥❤️'], ['Gasolina', '🚗⛽🔥💃'], ['Danza Kuduro', '💃🔥🕺🎧'],
    ['Vivir mi vida', '🌈☀️💃🎤'], ['Waka Waka', '⚽🌍🦁💃'], ['La Bamba', '💃🎸🌴🌊'], ['Hips Don\'t Lie', '💃🕺😍🔥'], ['Livin\' la vida loca', '🔥👠💋🎤'],
    ['Let It Go', '❄️⛄👑🌙'], ['Happy', '😎☀️🙌💃'], ['Shake It Off', '💃🎤🙌🔥'], ['Thriller', '👻🧟🕺🌙'], ['Bohemian Rhapsody', '👑🎹🎤⚡'],
    ['We Will Rock You', '🥁🎸🙌👑'], ['Yellow Submarine', '🚀🌊🐝🌈'], ['Dancing Queen', '👑💃🎧🌙'], ['Staying Alive', '🕺🔥💔⭐'], ['Baby Shark', '🦈👶🌊🎧'],
    ['Despechá', '💔💃🌴🔥'], ['Tusa', '💔🔥💋🚪'], ['Shallow', '🎸🌊💋🎬'], ['Sweet Child O\' Mine', '🎸👶❤️🌹'], ['Tití me preguntó', '🐍💰📱🌴'],
  ].map(([title, h]) => ({ title, hints: split(h) })),
});

w('acertijos', {
  riddles: [
    { text: 'Tengo trompa pero no soy músico, mis orejas son enormes y dicen que nunca olvido.', answers: ['elefante', 'elefantes', 'dumbo'], hint: 'Es el animal terrestre más grande.' },
    { text: 'Duermo colgado de cabeza y salgo de noche; veo con los oídos.', answers: ['murcielago', 'murcielagos', 'vampiro'], hint: 'Es el único mamífero que vuela.' },
    { text: 'Soy el rey de la sabana: mi melena es mi corona y mi rugido se oye a kilómetros.', answers: ['leon', 'leones', 'el leon'], hint: 'Mufasa lo era.' },
    { text: 'Vivo en casa, ronroneo y siempre caigo de pie.', answers: ['gato', 'gatito', 'minino', 'gata', 'michi', 'el gato'], hint: 'Hace "miau".' },
    { text: 'Tengo ocho brazos, tres corazones y tinta como escudo.', answers: ['pulpo', 'pulpos', 'el pulpo'], hint: 'Vive en el mar y es muy inteligente.' },
    { text: 'Con mi cuello larguísimo alcanzo las hojas más altas del árbol.', answers: ['jirafa', 'jirafas', 'la jirafa'], hint: 'Tiene manchas y es altísima.' },
  ],
});

w('nombres-equipo', {
  adj: { a: 'Madrugadores', b: 'Trasnochadores' },
  noun: { comida: { a: 'de la Pizza', b: 'del Sushi' }, lugar: { a: 'Playeros', b: 'Montañistas' } },
  fallback: ['Los Impostores con Estilo', 'Los Gatos Voladores', 'Los Desastres Organizados', 'Los Pandas Furiosos', 'Los Sin Rumbo', 'Los Tacos Cuánticos', 'Los Indomables', 'Los Chismosos Anónimos', 'Los Mapaches del Caos', 'Los Invencibles (casi)',
    'Los Detectives Sin Pistas', 'Los Pingüinos en Fuga', 'Los Ñoños Felices', 'Los Rebeldes con Pausa', 'Los Aguacates Sabios', 'Los Dragones de Oficina', 'Los Crujientes', 'Los Tiburones Vegetarianos', 'Los Mil Usos', 'Los Sospechosos Habituales',
    'Los Fantasmas del Karaoke', 'Los Camaleones', 'Los Dinos del Mate', 'Los Conejos Ninja', 'Los Cómplices del Postre', 'Los Cohetes Sin Frenos', 'Los Tucanes Hambrientos', 'Los Lobos con Wifi', 'Los Reyes del Brindis', 'Los Rayos Perezosos'],
});

for (const f of fs.readdirSync(dir)) JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
console.log('contenido generado:', fs.readdirSync(dir).join(', '));
