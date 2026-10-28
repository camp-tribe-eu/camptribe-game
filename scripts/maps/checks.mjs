// Сторож мап Tiled (GAME-23): другий клас тупиків — геометричний. Квест досяжний у графі,
// але не на мапі: точку появи замурували, тригер за стіною, тайл поза тайлсетом.
// Опис: docs/MAP-VALIDATOR.md. Без залежностей, лише Node.
//
// Кожна перевірка позначена маркером `// @check:<id>` у першому рядку тіла:
// scripts/maps/mutate.mjs вставляє після нього `return [];` і доводить, що самотест червоніє.
// Не прибирай і не дублюй маркери — мутаційний прогін звіряє їх із реєстром CHECKS.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Реєстр кодів. Самотест вимагає, щоб КОЖЕН код (крім INTERNAL_ERROR) мав зламаний приклад.
export const CODES = {
  MAPS_MISSING:         { check: 'loader', spec: 'закон 4: немає мап — це не зелене' },
  MAP_PARSE:            { check: 'loader', spec: 'файл мапи читається як Tiled JSON (.tmj)' },
  MAP_STRUCTURE:        { check: 'structure', spec: 'ортогональна скінченна мапа, вбудовані тайлсети, дані шарів масивом' },
  TILE_OUT_OF_TILESET:  { check: 'tiles', spec: 'кожен gid належить якомусь тайлсету' },
  OBJECT_INVALID:       { check: 'objects', spec: 'об’єкт шару objects — spawn | trigger | npc | anchor з унікальним іменем' },
  OBJECT_OUT_OF_BOUNDS: { check: 'bounds', spec: 'об’єкт лежить у межах мапи' },
  MAP_NO_SPAWN:         { check: 'spawn-present', spec: 'на мапі є точка появи' },
  SPAWN_BLOCKED:        { check: 'spawn-free', spec: 'точка появи не на стіні й не замурована' },
  TARGET_UNREACHABLE:   { check: 'reach', spec: 'з КОЖНОЇ точки появи пішки досяжні всі тригери й NPC' },
  // Розкладка інтер'єру (docs/LAYOUT_RULES.md) — лише для мап із шаром об'єктів `layout`.
  LAYOUT_OBJECT:        { check: 'layout-object', spec: 'об’єкт шару layout — відомий kind, прямокутник по сітці тайлів, у межах мапи, рівно в одній кімнаті' },
  LAYOUT_ROOM:          { check: 'layout-room', spec: 'kind дозволений у кімнаті, де стоїть (ліжко — у спальні, стіл-бюро — не у вітальні)' },
  LAYOUT_WALL:          { check: 'layout-wall', spec: 'пристінні меблі спинкою до стіни (ліжко узголів’ям), настінне — на стіні, а не над підлогою' },
  LAYOUT_DOOR:          { check: 'layout-door', spec: 'двері стоять на лінії підлоги своєї стіни; дверний проріз прохідний' },
  LAYOUT_ACCESS:        { check: 'layout-access', spec: 'до фронту кожних уживаних меблів і до кожних дверей є пішохідний шлях з кожної точки появи; до двоспального ліжка — з обох боків' },
  INTERNAL_ERROR:       { check: 'runner', spec: 'перевірка, що впала, не сміє виглядати як пройдена' },
};

export const OBJECT_LAYER = 'objects';
export const KINDS = ['spawn', 'trigger', 'npc', 'anchor'];   // GAME-172: anchor — іменована точка під майбутню дію (не тригер)
const TARGET_KINDS = ['trigger', 'npc', 'anchor'];

// ---------- розкладка (GAME-146): словник видів меблів ----------
// Шар об'єктів `layout`: прямокутники по сітці тайлів. type `room` + властивість room = назва кімнати;
// решта type — kind меблів. Правила на kind:
//   rooms   — де дозволено (null — будь-де, і поза кімнатами теж);
//   hug     — 'wall': над верхнім рядом об'єкта стіна (або край мапи); 'back': стіна АБО інші меблі
//             («спинкою до зони»). Властивість freestanding=true знімає hug для одного об'єкта — ціна
//             хибного спрацювання одна властивість, і число таких об'єктів друкується в PASS;
//   place   — 'floor' (стоїть на підлозі), 'wall' (висить: усі клітинки — колізія стіни), 'gap' (усі прохідні);
//   floor   — під нижнім рядом мусить бути прохідна підлога (двері на лінії підлоги);
//   access  — 'front': хоч одна клітинка під нижнім рядом досяжна; 'sides': хоч по одній досяжній клітинці
//             ліворуч і праворуч; 'self': досяжна хоч одна власна клітинка.
export const LAYOUT_LAYER = 'layout';
export const ROOMS = ['living', 'kitchen', 'bedroom', 'bathroom', 'hall', 'study'];
export const LAYOUT_KINDS = {
  bed:          { rooms: ['bedroom'], hug: 'wall', access: 'sides' },
  nightstand:   { rooms: ['bedroom'], hug: 'wall' },
  wardrobe:     { rooms: ['bedroom', 'hall'], hug: 'wall', access: 'front' },
  desk:         { rooms: ['study', 'bedroom'], hug: 'wall' },
  sofa:         { rooms: ['living'], hug: 'back', access: 'front' },
  coffee_table: { rooms: ['living'] },
  tv:           { rooms: ['living'], hug: 'wall' },
  shelf:        { rooms: ['living', 'bedroom', 'study', 'hall'], hug: 'wall', access: 'front' },
  counter:      { rooms: ['kitchen'], hug: 'wall', access: 'front' },
  fridge:       { rooms: ['kitchen'], hug: 'wall', access: 'front' },
  stove:        { rooms: ['kitchen'], hug: 'wall', access: 'front' },
  sink:         { rooms: ['kitchen', 'bathroom'], hug: 'wall', access: 'front' },
  table:        { rooms: ['kitchen', 'living', 'study'] },
  chair:        { rooms: ROOMS },
  lamp:         { rooms: ROOMS },
  plant:        { rooms: ROOMS },
  rug:          { rooms: ROOMS, place: 'gap' },
  painting:     { rooms: ROOMS, place: 'wall' },
  wall_shelf:   { rooms: ROOMS, place: 'wall' },
  window:       { rooms: ROOMS, place: 'wall' },
  door:         { rooms: null, place: 'wall', floor: true, access: 'front' },
  doorway:      { rooms: null, place: 'gap', access: 'self' },
};
// Старші біти gid — прапорці віддзеркалення/повороту Tiled (H, V, D, гекс-120°).
const GID_MASK = 0x0fffffff;
const gidOf = (raw) => raw & GID_MASK;
// Рух — 4 напрямки по тайлах. Діагональ між двома стінами — не прохід.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const I = (code, where, msg) => ({ code, where, msg });
const prop = (o, name) => (Array.isArray(o?.properties) ? o.properties.find((p) => p?.name === name)?.value : undefined);
const posInt = (v) => Number.isInteger(v) && v > 0;

function flatLayers(layers, out = []) {
  for (const l of layers ?? []) {
    if (l?.type === 'group') flatLayers(l.layers, out);
    else out.push(l);
  }
  return out;
}

// ---------- модель мапи: сітка колізій і об'єкти в тайлових координатах ----------

export function buildModel(map) {
  const { width: W, height: H, tilewidth: tw, tileheight: th } = map;
  const layers = flatLayers(map.layers);
  const tileLayers = layers.filter((l) => l.type === 'tilelayer');

  // Колізія: шар із властивістю collides=true блокує кожну непорожню клітинку;
  // тайл тайлсету з властивістю collides=true блокує в будь-якому шарі.
  const tileCollides = new Set();
  for (const ts of map.tilesets) for (const t of ts.tiles ?? []) if (prop(t, 'collides') === true) tileCollides.add(ts.firstgid + t.id);
  const blocked = new Array(W * H).fill(false);
  for (const layer of tileLayers) {
    const all = prop(layer, 'collides') === true;
    layer.data.forEach((raw, i) => {
      if (raw === 0) return;
      if (all || tileCollides.has(gidOf(raw))) blocked[i] = true;
    });
  }

  const objects = [];
  for (const l of layers) {
    if (l.type !== 'objectgroup' || l.name !== OBJECT_LAYER) continue;
    for (const o of l.objects) {
      const kind = o.type || o.class || '';
      const w = o.width || 0;
      const h = o.height || (o.gid ? th : 0);
      // Тайловий об'єкт (з gid) у Tiled має початок у ЛІВОМУ НИЖНЬОМУ куті, решта — у верхньому.
      const top = o.gid ? o.y - h : o.y;
      const cx = o.x + w / 2;
      const cy = top + h / 2;
      const tx = Math.floor(cx / tw);
      const ty = Math.floor(cy / th);
      const inside = tx >= 0 && ty >= 0 && tx < W && ty < H;
      objects.push({ raw: o, kind, name: o.name ?? '', tx, ty, i: ty * W + tx, inside });
    }
  }

  // Розкладка: прямокутники шару `layout` у тайлах. Невирівняний по сітці — лишається з aligned=false,
  // решта перевірок його пропускає (помилку видає layout-object), щоб не стріляти по сусідах.
  const layout = { present: false, rooms: [], items: [] };
  for (const l of layers) {
    if (l.type !== 'objectgroup' || l.name !== LAYOUT_LAYER) continue;
    layout.present = true;
    for (const o of l.objects) {
      const kind = (o.type || o.class) ?? '';
      const x0 = o.x / tw, y0 = o.y / th, w = (o.width || 0) / tw, h = (o.height || 0) / th;
      const aligned = [x0, y0, w, h].every(Number.isInteger) && w > 0 && h > 0 && !o.point;
      const x = aligned ? x0 : Math.floor(x0), y = aligned ? y0 : Math.floor(y0);
      const inside = aligned && x >= 0 && y >= 0 && x + w <= W && y + h <= H;
      const item = { raw: o, kind, name: o.name ?? '', x, y, w: aligned ? w : 1, h: aligned ? h : 1, aligned, inside, room: prop(o, 'room'), freestanding: prop(o, 'freestanding') };
      (kind === 'room' ? layout.rooms : layout.items).push(item);
    }
  }
  // Клітинка «зайнята меблями» — для hug='wall': стіна за спинкою мусить бути стіною, а не шафою.
  const furnished = new Set();
  for (const it of layout.items) if (it.inside && LAYOUT_KINDS[it.kind]?.place !== 'wall') for (const c of cells(it)) furnished.add(c.y * W + c.x);
  layout.furnished = furnished;
  return { W, H, tileLayers, blocked, objects, layout };
}

const cells = (it) => { const out = []; for (let y = it.y; y < it.y + it.h; y++) for (let x = it.x; x < it.x + it.w; x++) out.push({ x, y }); return out; };
const litem = (it) => `${it.kind || '?'} «${it.name}» (${it.x},${it.y} ${it.w}×${it.h})`;
// Кімнати, що цілком містять об'єкт.
const roomsOf = (m, it) => m.layout.rooms.filter((r) => r.inside && ROOMS.includes(r.room) && it.x >= r.x && it.y >= r.y && it.x + it.w <= r.x + r.w && it.y + it.h <= r.y + r.h);
// Об'єкти, до яких застосовні геометричні правила: відомий kind, вирівняний, у межах мапи.
const sound = (m) => m.layout.items.filter((it) => LAYOUT_KINDS[it.kind] && it.inside);
const blockedAt = (m, x, y) => x < 0 || y < 0 || x >= m.W || y >= m.H || m.blocked[y * m.W + x];

const label = (o) => `${o.kind || '?'} «${o.name}» (${o.tx},${o.ty})`;

function neighbours(m, i) {
  const x = i % m.W, y = Math.floor(i / m.W);
  const out = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < m.W && ny < m.H) out.push(ny * m.W + nx);
  }
  return out;
}

// 'ok' | 'on-wall' | 'walled' — спільне для spawn-free і reach, щоб замурована точка появи
// звітувала один раз (SPAWN_BLOCKED), а не ще й кожною ціллю, до якої з неї не дійти.
function spawnState(m, s) {
  if (m.blocked[s.i]) return 'on-wall';
  if (!neighbours(m, s.i).some((n) => !m.blocked[n])) return 'walled';
  return 'ok';
}

function flood(m, from) {
  const seen = new Array(m.W * m.H).fill(false);
  seen[from] = true;
  const queue = [from];
  while (queue.length) {
    const u = queue.shift();
    for (const n of neighbours(m, u)) if (!seen[n] && !m.blocked[n]) { seen[n] = true; queue.push(n); }
  }
  return seen;
}

// Тригер спрацьовує, коли на нього СТАЮТЬ — його клітинка мусить бути досяжна.
// З NPC говорять із сусідньої клітинки — досить досяжного сусіда (NPC може стояти в ніші).
const reached = (m, seen, t) => seen[t.i] || (t.kind === 'npc' && neighbours(m, t.i).some((n) => seen[n]));

// ---------- перевірки ----------

export const CHECKS = [
  {
    id: 'structure',
    run(map) {
      // @check:structure
      const out = [];
      const bad = (msg) => out.push(I('MAP_STRUCTURE', 'мапа', msg));
      if (!map || typeof map !== 'object' || Array.isArray(map)) { bad('корінь — не об’єкт'); return out; }
      if (map.orientation !== 'orthogonal') bad(`orientation=${map.orientation}, підтримується лише orthogonal`);
      if (map.infinite) bad('нескінченна мапа (infinite=true) не підтримується');
      for (const k of ['width', 'height', 'tilewidth', 'tileheight']) if (!posInt(map[k])) bad(`${k}=${map[k]} — не додатне ціле`);
      if (!Array.isArray(map.layers)) bad('немає масиву layers');
      if (!Array.isArray(map.tilesets)) bad('немає масиву tilesets');
      if (out.length) return out;
      map.tilesets.forEach((ts, n) => {
        const where = `тайлсет #${n} ${ts?.name ?? ''}`.trim();
        if (ts?.source) { bad(`${where}: зовнішній тайлсет (${ts.source}) — вбудуй його в мапу (Embed Tileset)`); return; }
        if (!posInt(ts?.firstgid) || !posInt(ts?.tilecount)) { bad(`${where}: firstgid/tilecount не додатні цілі`); return; }
        if (ts.tiles !== undefined && (!Array.isArray(ts.tiles) || ts.tiles.some((t) => !Number.isInteger(t?.id) || t.id < 0 || t.id >= ts.tilecount))) bad(`${where}: tiles з id поза 0..${ts.tilecount - 1}`);
      });
      const check = (layers, path) => {
        for (const l of layers) {
          const where = `${path}${l?.name ?? '?'}`;
          if (l?.properties !== undefined && !Array.isArray(l.properties)) bad(`шар ${where}: properties не масив`);
          if (l?.type === 'group') { if (!Array.isArray(l.layers)) bad(`група ${where}: немає layers`); else check(l.layers, `${where}/`); continue; }
          if (l?.type === 'tilelayer') {
            if (l.encoding || l.compression || !Array.isArray(l.data)) { bad(`шар ${where}: дані не масивом (експортуй із Tile Layer Format = CSV)`); continue; }
            if (l.width !== map.width || l.height !== map.height || l.data.length !== map.width * map.height) bad(`шар ${where}: ${l.width}×${l.height}, клітинок ${l.data.length}, а мапа ${map.width}×${map.height}`);
            if (l.data.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffffffff)) bad(`шар ${where}: gid не ціле в межах 0..2^32-1`);
          } else if (l?.type === 'objectgroup') {
            if (!Array.isArray(l.objects)) { bad(`шар ${where}: немає objects`); continue; }
            l.objects.forEach((o, n) => {
              if (!Number.isFinite(o?.x) || !Number.isFinite(o?.y)) bad(`шар ${where}: об’єкт #${n} без числових x/y`);
            });
          } else if (l?.type !== 'imagelayer') bad(`шар ${where}: невідомий тип ${l?.type}`);
        }
      };
      check(map.layers, '');
      return out;
    },
  },
  {
    id: 'tiles',
    run(map, m) {
      // @check:tiles
      const out = [];
      const known = (g) => map.tilesets.some((ts) => g >= ts.firstgid && g <= ts.firstgid + ts.tilecount - 1);
      for (const layer of m.tileLayers) {
        const bad = new Map();
        for (const raw of layer.data) {
          if (raw === 0) continue;
          const g = gidOf(raw);
          if (!known(g)) bad.set(g, (bad.get(g) ?? 0) + 1);
        }
        if (bad.size) {
          const n = [...bad.values()].reduce((a, b) => a + b, 0);
          out.push(I('TILE_OUT_OF_TILESET', `шар ${layer.name}`, `${n} клітинок із gid без тайлсету: ${[...bad].map(([g, k]) => `${g}×${k}`).join(', ')}`));
        }
      }
      for (const o of m.objects) if (o.raw.gid && !known(gidOf(o.raw.gid))) out.push(I('TILE_OUT_OF_TILESET', label(o), `тайловий об’єкт із gid ${gidOf(o.raw.gid)} без тайлсету`));
      return out;
    },
  },
  {
    id: 'objects',
    run(map, m) {
      // @check:objects
      const out = [];
      const names = new Map();
      for (const o of m.objects) {
        const why = [];
        if (!KINDS.includes(o.kind)) why.push(`тип «${o.kind}» не з ${KINDS.join(' | ')}`);
        if (o.raw.type && o.raw.class && o.raw.type !== o.raw.class) why.push(`type «${o.raw.type}» і class «${o.raw.class}» суперечать`);
        if (typeof o.name !== 'string' || o.name.trim() === '') why.push('порожнє ім’я');
        else if (TARGET_KINDS.includes(o.kind)) {
          const key = `${o.kind}:${o.name}`;
          if (names.has(key)) why.push(`ім’я вже є в ${names.get(key)}`);
          else names.set(key, label(o));
        }
        if (why.length) out.push(I('OBJECT_INVALID', label(o), why.join('; ')));
      }
      return out;
    },
  },
  {
    id: 'bounds',
    run(map, m) {
      // @check:bounds
      return m.objects
        .filter((o) => KINDS.includes(o.kind) && !(o.tx >= 0 && o.ty >= 0 && o.tx < m.W && o.ty < m.H))
        .map((o) => I('OBJECT_OUT_OF_BOUNDS', label(o), `поза мапою ${m.W}×${m.H}`));
    },
  },
  {
    id: 'spawn-present',
    run(map, m) {
      // @check:spawn-present
      if (m.objects.some((o) => o.kind === 'spawn')) return [];
      return [I('MAP_NO_SPAWN', `шар ${OBJECT_LAYER}`, 'жодного об’єкта типу spawn (або немає самого шару)')];
    },
  },
  {
    id: 'spawn-free',
    run(map, m) {
      // @check:spawn-free
      const out = [];
      for (const s of m.objects) {
        if (s.kind !== 'spawn' || !s.inside) continue;
        const st = spawnState(m, s);
        if (st === 'on-wall') out.push(I('SPAWN_BLOCKED', label(s), 'стоїть на тайлі з колізією'));
        if (st === 'walled') out.push(I('SPAWN_BLOCKED', label(s), 'замурована: жодної прохідної сусідньої клітинки'));
      }
      return out;
    },
  },
  {
    id: 'reach',
    run(map, m) {
      // @check:reach
      const out = [];
      // Точка появи поза мапою чи заблокована вже має свій код — тут її не враховуємо, без дублів.
      const starts = m.objects.filter((o) => o.kind === 'spawn' && o.inside && spawnState(m, o) === 'ok');
      const floods = starts.map((s) => ({ s, seen: flood(m, s.i) }));
      for (const t of m.objects) {
        if (!TARGET_KINDS.includes(t.kind) || !t.inside) continue;
        const failing = floods.filter(({ seen }) => !reached(m, seen, t)).map(({ s }) => s.name);
        // Ціль мусить бути досяжна з КОЖНОЇ точки появи; звіт — один на ціль, з числом точок.
        if (failing.length) out.push(I('TARGET_UNREACHABLE', label(t), `недосяжна пішки з ${failing.length} із ${starts.length} точок появи: ${failing.join(', ')}`));
      }
      return out;
    },
  },
  // ---------- розкладка (лише коли на мапі є шар `layout`) ----------
  {
    id: 'layout-object',
    run(map, m) {
      // @check:layout-object
      const out = [];
      if (!m.layout.present) return out;
      const where = `шар ${LAYOUT_LAYER}`;
      for (const r of m.layout.rooms) {
        const why = [];
        if (!r.aligned) why.push('кімната — не прямокутник по сітці тайлів');
        else if (!r.inside) why.push(`поза мапою ${m.W}×${m.H}`);
        if (!ROOMS.includes(r.room)) why.push(`властивість room «${r.room}» не з ${ROOMS.join(' | ')}`);
        if (why.length) out.push(I('LAYOUT_OBJECT', `${where} · ${litem(r)}`, why.join('; ')));
      }
      for (const it of m.layout.items) {
        const why = [];
        const spec = LAYOUT_KINDS[it.kind];
        if (!spec) why.push(`kind «${it.kind}» не зі словника: ${Object.keys(LAYOUT_KINDS).join(', ')}`);
        if (!it.aligned) why.push('не прямокутник по сітці тайлів (x, y, width, height кратні тайлу, точка не підходить)');
        else if (!it.inside) why.push(`поза мапою ${m.W}×${m.H}`);
        if (it.freestanding !== undefined && typeof it.freestanding !== 'boolean') why.push('freestanding — не bool');
        if (spec && it.freestanding !== undefined && !spec.hug) why.push(`freestanding без правила спинки: kind «${it.kind}» і так стоїть де завгодно`);
        if (spec && it.inside && spec.rooms !== null) {
          const n = roomsOf(m, it).length;
          if (n !== 1) why.push(n === 0 ? 'не лежить цілком у жодній кімнаті' : `лежить у ${n} кімнатах одразу`);
        }
        if (why.length) out.push(I('LAYOUT_OBJECT', `${where} · ${litem(it)}`, why.join('; ')));
      }
      return out;
    },
  },
  {
    id: 'layout-room',
    run(map, m) {
      // @check:layout-room
      const out = [];
      for (const it of sound(m)) {
        const spec = LAYOUT_KINDS[it.kind];
        if (spec.rooms === null) continue;
        const rooms = roomsOf(m, it);
        if (rooms.length !== 1) continue;                                   // уже LAYOUT_OBJECT
        const room = rooms[0].room;
        if (!spec.rooms.includes(room)) out.push(I('LAYOUT_ROOM', litem(it), `не місце в кімнаті «${room}» — дозволено: ${spec.rooms.join(', ')}`));
      }
      return out;
    },
  },
  {
    id: 'layout-wall',
    run(map, m) {
      // @check:layout-wall
      const out = [];
      for (const it of sound(m)) {
        const spec = LAYOUT_KINDS[it.kind];
        if (spec.place === 'wall') {
          const open = cells(it).filter((c) => !m.blocked[c.y * m.W + c.x]);
          if (open.length) out.push(I('LAYOUT_WALL', litem(it), `висить не на стіні: ${open.length} клітинок без колізії (${open.slice(0, 3).map((c) => `${c.x},${c.y}`).join('; ')})`));
        } else if (spec.place === 'gap') {
          const shut = cells(it).filter((c) => m.blocked[c.y * m.W + c.x]);
          if (shut.length) out.push(I('LAYOUT_WALL', litem(it), `має бути прохідним, а ${shut.length} клітинок із колізією`));
        }
        if (spec.hug && it.freestanding !== true) {
          // Над верхнім рядом — стіна (край мапи теж стіна); 'back' приймає й інші меблі.
          const gaps = [];
          for (let x = it.x; x < it.x + it.w; x++) {
            const y = it.y - 1;
            const wall = blockedAt(m, x, y) && (spec.hug === 'back' || y < 0 || !m.layout.furnished.has(y * m.W + x));
            if (!wall) gaps.push(`${x},${y}`);
          }
          if (gaps.length) out.push(I('LAYOUT_WALL', litem(it), `${spec.hug === 'back' ? 'спинкою не до стіни й не до зони' : it.kind === 'bed' ? 'узголів’ям не до стіни' : 'не біля стіни'}: над ним вільно в ${gaps.join('; ')} (або freestanding=true з поясненням)`));
        }
      }
      return out;
    },
  },
  {
    id: 'layout-door',
    run(map, m) {
      // @check:layout-door
      const out = [];
      for (const it of sound(m)) {
        if (!LAYOUT_KINDS[it.kind].floor) continue;
        const y = it.y + it.h;
        const bad = [];
        for (let x = it.x; x < it.x + it.w; x++) if (blockedAt(m, x, y)) bad.push(`${x},${y}`);
        if (bad.length) out.push(I('LAYOUT_DOOR', litem(it), `не стоять на лінії підлоги: під ними не підлога в ${bad.join('; ')}`));
      }
      return out;
    },
  },
  {
    id: 'layout-access',
    run(map, m) {
      // @check:layout-access
      const out = [];
      const items = sound(m).filter((it) => LAYOUT_KINDS[it.kind].access);
      if (!items.length) return out;
      const starts = m.objects.filter((o) => o.kind === 'spawn' && spawnState(m, o) === 'ok' && o.inside);
      const floods = starts.map((s) => ({ s, seen: flood(m, s.i) }));
      const seenAt = (seen, x, y) => x >= 0 && y >= 0 && x < m.W && y < m.H && seen[y * m.W + x];
      for (const it of items) {
        const spec = LAYOUT_KINDS[it.kind];
        const mode = spec.access;
        // Двері не на лінії підлоги вже мають LAYOUT_DOOR — не дублювати їх ще й «не підійти».
        if (spec.floor) { let shut = false; for (let x = it.x; x < it.x + it.w; x++) shut ||= blockedAt(m, x, it.y + it.h); if (shut) continue; }
        const ok = (seen) => {
          if (mode === 'front') { for (let x = it.x; x < it.x + it.w; x++) if (seenAt(seen, x, it.y + it.h)) return true; return false; }
          if (mode === 'self') return cells(it).some((c) => seenAt(seen, c.x, c.y));
          // sides — обидва боки, кожен хоч однією клітинкою
          let left = false, right = false;
          for (let y = it.y; y < it.y + it.h; y++) { left ||= seenAt(seen, it.x - 1, y); right ||= seenAt(seen, it.x + it.w, y); }
          return left && right;
        };
        const failing = floods.filter(({ seen }) => !ok(seen)).map(({ s }) => s.name);
        if (failing.length > 0) out.push(I('LAYOUT_ACCESS', litem(it), `${mode === 'sides' ? 'не підійти з обох боків' : mode === 'self' ? 'проріз недосяжний' : 'не підійти спереду'} з ${failing.length} із ${starts.length} точок появи: ${failing.join(', ')}`));
      }
      return out;
    },
  },
];

export function validateMap(map, name = 'мапа') {
  const tag = (issues) => issues.map((i) => ({ ...i, where: `${name} · ${i.where}` }));
  const issues = tag(CHECKS[0].run(map));
  if (issues.length) return issues;
  const m = buildModel(map);
  for (const c of CHECKS.slice(1)) {
    try { issues.push(...tag(c.run(map, m))); }
    catch (e) { issues.push(...tag([I('INTERNAL_ERROR', c.id, String(e?.stack ?? e))])); }
  }
  return issues;
}

// Підсумок для рядка PASS: що саме перевірено, числом.
export function summarize(map) {
  const m = buildModel(map);
  const count = (k) => m.objects.filter((o) => o.kind === k).length;
  return {
    spawns: count('spawn'), triggers: count('trigger'), npcs: count('npc'), walkable: m.blocked.filter((b) => !b).length, tiles: m.W * m.H,
    layouts: m.layout.present ? 1 : 0, rooms: m.layout.rooms.length, furniture: m.layout.items.length,
    freestanding: m.layout.items.filter((it) => it.freestanding === true).length,
  };
}

// ---------- завантажувач ----------

export function loadMaps(dir, { allowMissing = false } = {}) {
  const missing = (why) => (allowMissing
    ? { status: 'NOT_RUN', maps: [], issues: [], why }
    : { status: 'FAIL', maps: [], issues: [I('MAPS_MISSING', dir, why)] });
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return missing('теки мап немає');
  const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.(tmj|tmx)$/i.test(f)).sort();
  if (files.length === 0) return missing('у теці жодного файлу .tmj');
  const maps = [];
  const issues = [];
  for (const f of files) {
    if (/\.tmx$/i.test(f)) { issues.push(I('MAP_PARSE', f, 'XML-формат .tmx не читається — експортуй у JSON (.tmj)')); continue; }
    try { maps.push({ name: f, map: JSON.parse(readFileSync(join(dir, f), 'utf8')) }); }
    catch (e) { issues.push(I('MAP_PARSE', f, `не JSON: ${e.message}`)); }
  }
  return { status: issues.length ? 'FAIL' : 'OK', maps, issues };
}
