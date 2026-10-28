// Набір самотестів сторожа мап. Еталон — синтетична мапа 10×7, НЕ мапа гри.
// Кожен зламаний приклад — еталон плюс одна навмисна поломка, і для нього заданий ТОЧНИЙ набір
// кодів: менше — перевірка сліпа, більше — стріляє по сусідах. Позитивні контролі чекають [].
// Знайшов дефект мапи в грі — додай сюди приклад, інакше він повернеться.

export const T = 16; // розмір тайла в пікселях
const FLOOR = 6, WALL = 10;
export const TILECOUNT = 100;

// Еталон:            x 0123456789
const BASE_ROWS = [ /* y0 */ '##########',
  /* y1 */ '#....#...#',
  /* y2 */ '#....#.T.#', //  T — тригер t.gate (прямокутник 16×16)
  /* y3 */ '#........#', //  прохід у стіні x=5
  /* y4 */ '#....#..N#', //  N — NPC npc.ranger (точка)
  /* y5 */ '#....#...#', //  S — точки появи s.main (1,1) і s.alt (2,5)
  /* y6 */ '##########'];

const point = (id, name, type, tx, ty) => ({ id, name, type, x: tx * T + T / 2, y: ty * T + T / 2, width: 0, height: 0, point: true, rotation: 0, visible: true });
const rect = (id, name, type, tx, ty, w = 1, h = 1) => ({ id, name, type, x: tx * T, y: ty * T, width: w * T, height: h * T, rotation: 0, visible: true });

export function baseline() {
  const W = BASE_ROWS[0].length, H = BASE_ROWS.length;
  const cells = BASE_ROWS.join('');
  return {
    type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: W, height: H, tilewidth: T, tileheight: T,
    tilesets: [{ firstgid: 1, name: 'fixture', image: 'fixture.png', imagewidth: 160, imageheight: 160, tilewidth: T, tileheight: T, margin: 0, spacing: 0, columns: 10, tilecount: TILECOUNT }],
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: new Array(W * H).fill(FLOOR) },
      { id: 2, name: 'walls', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true,
        properties: [{ name: 'collides', type: 'bool', value: true }],
        data: [...cells].map((c) => (c === '#' ? WALL : 0)) },
      { id: 3, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, objects: [
        point(1, 's.main', 'spawn', 1, 1),
        point(2, 's.alt', 'spawn', 2, 5),
        rect(3, 't.gate', 'trigger', 7, 2),
        point(4, 'npc.ranger', 'npc', 8, 4),
      ] },
    ],
  };
}

// Помічники поломок.
const layer = (m, name) => m.layers.find((l) => l.name === name);
const obj = (m, name) => layer(m, 'objects').objects.find((o) => o.name === name);
const setCell = (m, lname, x, y, gid) => { layer(m, lname).data[y * m.width + x] = gid; };
const wall = (m, ...xy) => { for (const [x, y] of xy) setCell(m, 'walls', x, y, WALL); };
const moveTo = (o, tx, ty) => { o.x = tx * T + (o.point ? T / 2 : 0); o.y = ty * T + (o.point ? T / 2 : 0); };
const addObj = (m, o) => layer(m, 'objects').objects.push(o);
// Замурувати тригер (7,2) з чотирьох боків; по діагоналі сусіди лишаються прохідними.
const sealTrigger = (m) => wall(m, [6, 2], [8, 2], [7, 1], [7, 3]);

export const FIXTURES = [
  // ---------- позитивні контролі: коректне не червоніє ----------
  { name: 'еталон чистий', patch: () => {}, expect: [] },
  { name: 'NPC у ніші стіни (5,1), говорять із сусідньої клітинки', patch: (m) => moveTo(obj(m, 'npc.ranger'), 5, 1), expect: [] },
  { name: 'gid з усіма прапорцями віддзеркалення в межах тайлсету', patch: (m) => setCell(m, 'walls', 0, 0, 0xf0000000 + WALL), expect: [] },
  { name: 'тайловий об’єкт (gid): y — нижній край, тригер у рядку 5, а не в стіні рядка 6',
    patch: (m) => { const o = obj(m, 't.gate'); Object.assign(o, { gid: FLOOR, x: 7 * T, y: 6 * T, width: T, height: T }); }, expect: [] },
  { name: 'прямокутний тригер 3×1: лівий край на стіні (5,1), центр на підлозі (6,1)',
    patch: (m) => Object.assign(obj(m, 't.gate'), { x: 5 * T, y: 1 * T, width: 3 * T, height: T }), expect: [] },
  { name: 'Tiled 1.9: class замість type', patch: (m) => { const o = obj(m, 'npc.ranger'); delete o.type; o.class = 'npc'; }, expect: [] },
  { name: 'шар без collides не блокує, навіть суцільний', patch: (m) => {
    const W = m.width;
    m.layers.splice(2, 0, { id: 9, name: 'decor', type: 'tilelayer', width: W, height: m.height, x: 0, y: 0, opacity: 1, visible: true, data: new Array(W * m.height).fill(FLOOR) });
  }, expect: [] },
  { name: 'gid другого тайлсету в межах — не поломка', patch: (m) => {
    m.tilesets.push({ firstgid: 201, name: 'second', image: 's.png', imagewidth: 16, imageheight: 160, tilewidth: T, tileheight: T, margin: 0, spacing: 0, columns: 1, tilecount: 10 });
    setCell(m, 'ground', 3, 3, 205);
  }, expect: [] },

  // ---------- точка появи ----------
  { name: 'замурована точка появи: s.main (1,1) без прохідних сусідів', patch: (m) => wall(m, [2, 1], [1, 2]), expect: ['SPAWN_BLOCKED'], count: { code: 'SPAWN_BLOCKED', n: 1 } },
  { name: 'точка появи на стіні (0,0)', patch: (m) => moveTo(obj(m, 's.main'), 0, 0), expect: ['SPAWN_BLOCKED'] },
  { name: 'мапа без точки появи', patch: (m) => { const l = layer(m, 'objects'); l.objects = l.objects.filter((o) => o.type !== 'spawn'); }, expect: ['MAP_NO_SPAWN'] },
  { name: 'шар objects названо інакше — точок появи не знайдено', patch: (m) => { layer(m, 'objects').name = 'Objects'; }, expect: ['MAP_NO_SPAWN'] },

  // ---------- досяжність цілей ----------
  { name: 'тригер за стіною (досяжний лише по діагоналі)', patch: sealTrigger, expect: ['TARGET_UNREACHABLE'], count: { code: 'TARGET_UNREACHABLE', n: 1 } },
  { name: 'тригер на тайлі стіни (5,1) поруч із підлогою', patch: (m) => moveTo(obj(m, 't.gate'), 5, 1), expect: ['TARGET_UNREACHABLE'] },
  { name: 'NPC за стіною', patch: (m) => wall(m, [7, 4], [8, 3], [8, 5]), expect: ['TARGET_UNREACHABLE'] },
  { name: 'стіна всередині групи шарів теж блокує', patch: (m) => {
    sealTrigger(m);
    const i = m.layers.findIndex((l) => l.name === 'walls');
    m.layers[i] = { id: 8, name: 'group', type: 'group', opacity: 1, visible: true, layers: [m.layers[i]] };
  }, expect: ['TARGET_UNREACHABLE'] },
  { name: 'стіна з тайла, що має властивість collides у тайлсеті, у шарі без collides', patch: (m) => {
    m.tilesets[0].tiles = [{ id: 49, properties: [{ name: 'collides', type: 'bool', value: true }] }];
    for (const [x, y] of [[6, 2], [8, 2], [7, 1], [7, 3]]) setCell(m, 'ground', x, y, 50);
  }, expect: ['TARGET_UNREACHABLE'] },
  { name: 'цілі досяжні з однієї з трьох точок появи: дві замкнені в лівій кімнаті', patch: (m) => {
    wall(m, [5, 3]); // закрити прохід
    addObj(m, point(9, 's.right', 'spawn', 6, 4));
  }, expect: ['TARGET_UNREACHABLE'], count: { code: 'TARGET_UNREACHABLE', n: 2 } },

  // ---------- тайли ----------
  { name: 'тайл поза тайлсетом (gid 101 при tilecount 100)', patch: (m) => setCell(m, 'walls', 0, 0, TILECOUNT + 1), expect: ['TILE_OUT_OF_TILESET'], count: { code: 'TILE_OUT_OF_TILESET', n: 1 } },
  { name: 'gid у проміжку між двома тайлсетами', patch: (m) => {
    m.tilesets.push({ firstgid: 201, name: 'second', image: 's.png', imagewidth: 16, imageheight: 160, tilewidth: T, tileheight: T, margin: 0, spacing: 0, columns: 1, tilecount: 10 });
    setCell(m, 'walls', 0, 0, 150);
  }, expect: ['TILE_OUT_OF_TILESET'] },
  { name: 'тайловий об’єкт із gid поза тайлсетом', patch: (m) => Object.assign(obj(m, 'npc.ranger'), { gid: 500, x: 8 * T, y: 5 * T, width: T, height: T, point: undefined }), expect: ['TILE_OUT_OF_TILESET'] },

  // ---------- об'єкти ----------
  { name: 'NPC і тригер поза мапою (праворуч і з від’ємним x)', patch: (m) => {
    obj(m, 'npc.ranger').x = 10 * T + 4;
    obj(m, 't.gate').x = -T;
  }, expect: ['OBJECT_OUT_OF_BOUNDS'], count: { code: 'OBJECT_OUT_OF_BOUNDS', n: 2 } },
  { name: 'одруківка в типі об’єкта (spwan)', patch: (m) => addObj(m, point(9, 's.typo', 'spwan', 3, 3)), expect: ['OBJECT_INVALID'] },
  { name: 'тригер без імені', patch: (m) => { obj(m, 't.gate').name = ''; }, expect: ['OBJECT_INVALID'] },
  { name: 'type і class суперечать', patch: (m) => { obj(m, 'npc.ranger').class = 'trigger'; }, expect: ['OBJECT_INVALID'] },
  { name: '[GAME-172] два anchor з одним іменем', patch: (m) => { addObj(m, point(20, 'obj.water', 'anchor', 5, 3)); addObj(m, point(21, 'obj.water', 'anchor', 6, 3)); }, expect: ['OBJECT_INVALID'] },
  { name: '[GAME-172] anchor у замкненому куті — недосяжний', patch: (m) => { addObj(m, point(20, 'obj.pile', 'anchor', 4, 5)); setCell(m, 'walls', 3, 5, WALL); setCell(m, 'walls', 4, 4, WALL); }, expect: ['TARGET_UNREACHABLE'] },
  { name: 'два NPC з одним іменем', patch: (m) => addObj(m, point(9, 'npc.ranger', 'npc', 7, 4)), expect: ['OBJECT_INVALID'] },

  // ---------- структура ----------
  { name: 'дані шару коротші за мапу', patch: (m) => layer(m, 'walls').data.pop(), expect: ['MAP_STRUCTURE'] },
  { name: 'нескінченна мапа', patch: (m) => { m.infinite = true; }, expect: ['MAP_STRUCTURE'] },
  { name: 'ізометрична мапа', patch: (m) => { m.orientation = 'isometric'; }, expect: ['MAP_STRUCTURE'] },
  { name: 'зовнішній тайлсет (.tsx)', patch: (m) => { m.tilesets[0] = { firstgid: 1, source: 'fixture.tsx' }; }, expect: ['MAP_STRUCTURE'] },
  { name: 'дані шару в base64', patch: (m) => { Object.assign(layer(m, 'walls'), { encoding: 'base64', data: 'AAAA' }); }, expect: ['MAP_STRUCTURE'] },
  { name: 'невідомий тип шару', patch: (m) => { layer(m, 'ground').type = 'tilelayr'; }, expect: ['MAP_STRUCTURE'] },

  // ---------- розкладка інтер'єру (GAME-146, docs/LAYOUT_RULES.md) ----------
  // Мапа без шару layout розкладкою не перевіряється — еталон вище лишається чистим.
  { name: '[розкладка] будинок із двох кімнат чистий', patch: house, expect: [] },
  { name: '[розкладка] диван посеред кімнати з freestanding=true — свідомий виняток, не помилка',
    patch: (m) => { house(m); const s = litem(m, 'sofa'); clear(m, s); place(m, s, 3, 4); s.properties = [{ name: 'freestanding', type: 'bool', value: true }]; }, expect: [] },
  { name: '[розкладка] диван спинкою до журнального столика (до зони), не до стіни — дозволено',
    patch: (m) => { house(m); const s = litem(m, 'sofa'); clear(m, s); place(m, s, 1, 5); }, expect: [] },
  { name: '[розкладка] диван посеред кімнати', patch: (m) => { house(m); const s = litem(m, 'sofa'); clear(m, s); place(m, s, 3, 4); }, expect: ['LAYOUT_WALL'], count: { code: 'LAYOUT_WALL', n: 1 } },
  { name: '[розкладка] двері над підлогою (у верхньому ряду стіни)', patch: (m) => { house(m); litem(m, 'door').y = 0; }, expect: ['LAYOUT_DOOR'], count: { code: 'LAYOUT_DOOR', n: 1 } },
  { name: '[розкладка] ліжко у вітальні (двері відсунуто, щоб червоніло лише правило кімнати)',
    patch: (m) => { house(m); const b = litem(m, 'bed'); clear(m, b); place(m, b, 3, 2); litem(m, 'door').x = 5 * T; const c = litem(m, 'coffee'); clear(m, c); place(m, c, 1, 6); }, expect: ['LAYOUT_ROOM'], count: { code: 'LAYOUT_ROOM', n: 1 } },
  { name: '[розкладка] письмовий стіл у вітальні', patch: (m) => { house(m); addItem(m, 'desk', 'desk.1', 4, 2, 1, 1); }, expect: ['LAYOUT_ROOM'] },
  { name: '[розкладка] ліжко узголів’ям не до стіни (зсунуте на ряд від стіни)', patch: (m) => { house(m); const b = litem(m, 'bed'); clear(m, b); place(m, b, 8, 3); }, expect: ['LAYOUT_WALL'], count: { code: 'LAYOUT_WALL', n: 1 } },
  { name: '[розкладка] тумба під ліжком, а не біля стіни (меблі за спинкою — не стіна)', patch: (m) => { house(m); addItem(m, 'nightstand', 'ns.1', 8, 4, 1, 1); }, expect: ['LAYOUT_WALL'] },
  { name: '[розкладка] до двоспального ліжка не підійти з лівого боку', patch: (m) => { house(m); wall(m, [7, 2], [7, 3]); }, expect: ['LAYOUT_ACCESS'], count: { code: 'LAYOUT_ACCESS', n: 1 } },
  { name: '[розкладка] перед шафою стіна: ні до шафи, ні до ліжка справа', patch: (m) => { house(m); wall(m, [10, 3]); }, expect: ['LAYOUT_ACCESS'], count: { code: 'LAYOUT_ACCESS', n: 2 } },
  { name: '[розкладка] дверний проріз замуровано — спальня відрізана', patch: (m) => { house(m); wall(m, [6, 4]); }, expect: ['LAYOUT_WALL', 'LAYOUT_ACCESS'] },
  { name: '[розкладка] вікно звисає на підлогу', patch: (m) => { house(m); litem(m, 'window').y = T; }, expect: ['LAYOUT_WALL'], count: { code: 'LAYOUT_WALL', n: 1 } },
  { name: '[розкладка] одруківка у виді меблів (bedd)', patch: (m) => { house(m); litem(m, 'bed').type = 'bedd'; }, expect: ['LAYOUT_OBJECT'] },
  { name: '[розкладка] об’єкт не по сітці тайлів', patch: (m) => { house(m); litem(m, 'sofa').x += 5; }, expect: ['LAYOUT_OBJECT'] },
  { name: '[розкладка] freestanding на журнальному столику, що й так не має правила спинки', patch: (m) => { house(m); litem(m, 'coffee').properties = [{ name: 'freestanding', type: 'bool', value: true }]; }, expect: ['LAYOUT_OBJECT'] },
  { name: '[розкладка] торшер поза будь-якою кімнатою', patch: (m) => { house(m); addItem(m, 'lamp', 'lamp.1', 0, 3, 1, 1); }, expect: ['LAYOUT_OBJECT'] },
  { name: '[розкладка] кімната з невідомою назвою (salon) і все, що в ній', patch: (m) => { house(m); lroom(m, 'living').properties[0].value = 'salon'; }, expect: ['LAYOUT_OBJECT'] },
  { name: '[розкладка] кімнати перекриваються — меблі у двох кімнатах одразу', patch: (m) => { house(m); addRoom(m, 'hall', 1, 0, 5, 8); }, expect: ['LAYOUT_OBJECT'] },
];

// ---------- будинок для прикладів розкладки: 12×9, дві кімнати, перегородка x=6 з прорізом (6,4) ----------
//            x 0123456789AB
const HOUSE = [ '############',   // y0  стіна (верх)
  /* y1 */    '###D########',   // y1  стіна (низ), D — двері (3,1) на лінії підлоги
  /* y2 */    '#SS...#.BBW#',   // S — диван 2×1, B — ліжко 2×2 (8,2), W — шафа (10,2)
  /* y3 */    '#.....#.BB.#',
  /* y4 */    '#CC....?...#',   // C — журнальний столик 2×1 (1,4); ? — дверний проріз (6,4)
  /* y5 */    '#.....#....#',
  /* y6 */    '#.....#....#',
  /* y7 */    '#.....#....#',
  /* y8 */    '############'];
const lrect = (id, name, type, tx, ty, w, h, props) => ({ ...rect(id, name, type, tx, ty, w, h), ...(props ? { properties: props } : {}) });

function house(m) {
  const W = HOUSE[0].length, H = HOUSE.length;
  const cells = HOUSE.join('');
  m.width = W; m.height = H;
  layer(m, 'ground').data = new Array(W * H).fill(FLOOR); layer(m, 'ground').width = W; layer(m, 'ground').height = H;
  // Усе, що не підлога і не проріз, блокує: стіни, двері (у стіні), меблі.
  layer(m, 'walls').data = [...cells].map((c) => (c === '.' || c === '?' ? 0 : WALL)); layer(m, 'walls').width = W; layer(m, 'walls').height = H;
  layer(m, 'objects').objects = [point(1, 's.main', 'spawn', 3, 6)];
  m.layers.push({ id: 4, name: 'layout', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, objects: [
    lrect(10, 'living', 'room', 1, 0, 5, 8, [{ name: 'room', type: 'string', value: 'living' }]),
    lrect(11, 'bedroom', 'room', 7, 0, 4, 8, [{ name: 'room', type: 'string', value: 'bedroom' }]),
    lrect(12, 'sofa', 'sofa', 1, 2, 2, 1),
    lrect(13, 'coffee', 'coffee_table', 1, 4, 2, 1),
    lrect(14, 'door', 'door', 3, 1, 1, 1),
    lrect(15, 'window', 'window', 4, 0, 1, 2),
    lrect(16, 'bed', 'bed', 8, 2, 2, 2),
    lrect(17, 'wardrobe', 'wardrobe', 10, 2, 1, 1),
    lrect(18, 'doorway', 'doorway', 6, 4, 1, 1),
  ] });
}
const litem = (m, name) => layer(m, 'layout').objects.find((o) => o.name === name);
const lroom = litem;
// Зняти колізію під об'єктом розкладки (щоб пересунути меблі) і поставити її на новому місці.
const clear = (m, o) => { for (let y = o.y / T; y < (o.y + o.height) / T; y++) for (let x = o.x / T; x < (o.x + o.width) / T; x++) setCell(m, 'walls', x, y, 0); };
const place = (m, o, tx, ty) => { o.x = tx * T; o.y = ty * T; for (let y = ty; y < ty + o.height / T; y++) for (let x = tx; x < tx + o.width / T; x++) setCell(m, 'walls', x, y, WALL); };
const addItem = (m, type, name, tx, ty, w, h) => { const o = lrect(90 + layer(m, 'layout').objects.length, name, type, tx, ty, w, h); layer(m, 'layout').objects.push(o); place(m, o, tx, ty); };
const addRoom = (m, room, tx, ty, w, h) => layer(m, 'layout').objects.push(lrect(80, room, 'room', tx, ty, w, h, [{ name: 'room', type: 'string', value: room }]));

// Файлові приклади для завантажувача. files: null — теки немає; {} — порожня тека; 'baseline' — еталон.
export const FILE_FIXTURES = [
  { name: 'теки maps/ немає', files: null, expectStatus: 'FAIL', expect: ['MAPS_MISSING'] },
  { name: 'теки немає, але дозволено --allow-missing-maps → NOT_RUN, не OK', files: null, allowMissing: true, expectStatus: 'NOT_RUN', expect: [] },
  { name: 'тека порожня', files: {}, expectStatus: 'FAIL', expect: ['MAPS_MISSING'] },
  { name: 'у теці лише README.md', files: { 'README.md': '# мапи' }, expectStatus: 'FAIL', expect: ['MAPS_MISSING'] },
  { name: 'файл .tmj — не JSON', files: { 'broken.tmj': '{"width": 10,' }, expectStatus: 'FAIL', expect: ['MAP_PARSE'] },
  { name: 'XML .tmx замість JSON', files: { 'old.tmx': '<map/>' }, expectStatus: 'FAIL', expect: ['MAP_PARSE'] },
  { name: 'еталон із диска, у підтеці, читається й проходить', files: 'baseline', expectStatus: 'OK', expect: [], roundTrip: true },
];
