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
  OBJECT_INVALID:       { check: 'objects', spec: 'об’єкт шару objects — spawn | trigger | npc з унікальним іменем' },
  OBJECT_OUT_OF_BOUNDS: { check: 'bounds', spec: 'об’єкт лежить у межах мапи' },
  MAP_NO_SPAWN:         { check: 'spawn-present', spec: 'на мапі є точка появи' },
  SPAWN_BLOCKED:        { check: 'spawn-free', spec: 'точка появи не на стіні й не замурована' },
  TARGET_UNREACHABLE:   { check: 'reach', spec: 'з КОЖНОЇ точки появи пішки досяжні всі тригери й NPC' },
  INTERNAL_ERROR:       { check: 'runner', spec: 'перевірка, що впала, не сміє виглядати як пройдена' },
};

export const OBJECT_LAYER = 'objects';
export const KINDS = ['spawn', 'trigger', 'npc'];
const TARGET_KINDS = ['trigger', 'npc'];
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
  return { W, H, tileLayers, blocked, objects };
}

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
  return { spawns: count('spawn'), triggers: count('trigger'), npcs: count('npc'), walkable: m.blocked.filter((b) => !b).length, tiles: m.W * m.H };
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
