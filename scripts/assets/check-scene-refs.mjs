#!/usr/bin/env node
// GAME-32 · «усі об'єкти сцени — з реєстру ліцензій». Сторож ліцензій (check-assets.mjs) покриває
// УСЕ медіа в public/ і assets/ — тож досить довести, що код гри посилається лише туди й лише на
// наявні файли. Посилання в research/ (проби) чи на неіснуючий файл — червоне.
//   node scripts/assets/check-scene-refs.mjs [--self-test]
//
// Що сторож бачить (і де межа — закон 4):
//   • рядки-літерали з повним шляхом до медіа ('a.png', "b.json", `c.mp4`) у src/ і в КОЖНІЙ
//     HTML-сторінці збірки (входи Rollup із vite.config.ts + усі *.html у корені);
//   • CSS url(...) без лапок у .html / .css;
//   • КОЖЕН виклик load.<fn>(...) у src/: шлях мусить бути простим літералом, який сторож розпізнав.
//     Змінна, конкатенація, шаблон із ${} — SCENE_LOAD_NOT_LITERAL: сторож не може його перевірити,
//     отже це не зелене, а червоне (анти-порожнеча на кожен виклик, а не одна на всіх);
//   • будь-який рядок-літерал, що згадує research/ — навіть уламок для конкатенації;
//   • непрямі посилання: "image"/"source" у картах і тайлсетах Tiled (.tmj/.tsj/.tmx/.tsx),
//     file="…" у бітмап-шрифтах (.fnt/.xml) — від файлу карти, мусять існувати;
//   • <script src> / <link href=…css> у HTML — лише в src/, бо сторож сканує лише src/.
// Чого НЕ бачить: шлях, зібраний поза літералами без жодного уламка-літерала (напр. з JSON-даних
// у рантаймі), і доступ до завантажувача не через `load.` / `this.load` (на `this.load` без крапки —
// SCENE_LOAD_ALIAS). Коментарі-рядки (//, /*, *, <!--) не сканують на research/ і load-виклики.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../lib/cli.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = 'png|jpe?g|webp|gif|bmp|svg|tmj|tsj|tmx|json|xml|fnt|ttf|otf|woff2?|ogg|mp3|wav|m4a|aac|flac|mp4|webm';
const MEDIA = new RegExp(`(['"\`])([^'"\`\\s]+\\.(?:${EXT}))\\1`, 'g');
const FULL_MEDIA = new RegExp(`^[^'"\`\\s]+\\.(?:${EXT})$`);
// Шлях у виклику завантажувача може мати будь-яке розширення (.txt, .csv, .glsl…) — головне, що воно є.
const LOAD_PATH = /^[^'"`\s]+\.[A-Za-z0-9]+$/;
const FRAGMENT_EXT = new RegExp(`^\\.(?:${EXT})$`);
const CSS_URL = /(?<![\w-])url\(\s*([^'"\s)][^)\s]*)\s*\)/g;
const RESEARCH = /(['"`])([^'"`\n]*(?<![\w-])research\/[^'"`\n]*)\1/g;
const LOAD_CALL = /\bload\.(\w+)\s*\(/g;
const LOAD_ALIAS = /\bthis\.load\b(?!\s*\.)/g;
// Методи завантажувача, що не беруть шлях до файлу.
const LOAD_NO_PATH = new Set(['on', 'once', 'off', 'emit', 'addListener', 'removeListener', 'removeAllListeners', 'listenerCount', 'listeners',
  'start', 'reset', 'isLoading', 'isReady', 'setPrefix', 'setCORS']);
const LOAD_BASE = new Set(['setPath', 'setBaseURL']);
const MAP_FILE = /\.(tmj|tsj|tmx|tsx|fnt|xml)$/;
const CODE_FILE = /\.(ts|tsx|mjs|js)$/;

export const CODES = ['SCENE_REF_REMOTE', 'SCENE_REF_OUTSIDE', 'SCENE_REF_MISSING', 'SCENE_REF_RESEARCH', 'SCENE_REF_DYNAMIC',
  'SCENE_LOAD_NOT_LITERAL', 'SCENE_LOAD_BASE_PATH', 'SCENE_LOAD_ALIAS', 'SCENE_MAP_BAD', 'SCENE_ENTRY_OUTSIDE'];

/** Рядки-коментарі замінює пробілами (зсуви зберігаються). Хвостовий `//` — лише коли лапки до нього парні. */
function maskComments(text, file) {
  const html = /\.html$/.test(file);
  return text.split('\n').map((line) => {
    const t = line.trimStart();
    if (html ? t.startsWith('<!--') : /^(\/\/|\/\*|\*)/.test(t)) return ' '.repeat(line.length);
    if (html) return line;
    for (const m of line.matchAll(/\s\/\//g)) {
      const before = line.slice(0, m.index);
      if (['\'', '"', '`'].every((q) => before.split(q).length % 2 === 1)) return before + ' '.repeat(line.length - before.length);
    }
    return line;
  }).join('\n');
}

/** Від '(' виклику: аргументи верхнього рівня й кінець дужок. Рядки й шаблони пропускає цілими. */
function parseArgs(text, open) {
  const args = []; let depth = 0; let start = open + 1;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\'' || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) { const a = text.slice(start, i).trim(); if (a) args.push(a); return { args, end: i + 1 }; }
    } else if (c === ',' && depth === 1) { args.push(text.slice(start, i).trim()); start = i + 1; }
  }
  return { args, end: text.length };
}

const plainString = (a) => { const m = /^(['"])(.*)\1$/s.exec(a) || /^(`)([^`]*)`$/s.exec(a); return m && !(m[1] === '`' && m[2].includes('${')) ? m[2] : null; };
const isScalar = (a) => /^(true|false|null|undefined|-?\d+(\.\d+)?)$/.test(a);

function makeFs(fs) {
  if (typeof fs === 'function') return { exists: fs, read: () => null, list: () => [] };
  return fs;
}

function globToRe(g) {
  return new RegExp(`^${g.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?')}$`);
}

/**
 * sources: [{ file, text }] ; fs: { exists(p), read(p) → string|null, list(dir) → [шляхи] } або просто exists(p).
 * opts.maps — додаткові карти/шрифти для обходу непрямих посилань. Повертає знахідки.
 */
export function check(sources, fsIn, { maps = [] } = {}) {
  const fs = makeFs(fsIn);
  const out = []; const followed = new Set(); const stats = { refs: 0, loads: 0, mapRefs: 0 };
  const push = (code, where, msg) => out.push({ code, where, msg });

  // ctx: 'import' — шлях від файлу (імпорт Vite); 'url' — шлях від кореня сторінки = public/; 'map' — від файлу карти.
  function classify(ref, file, ctx) {
    stats.refs++;
    if (/^data:/.test(ref)) return;
    if (/^(https?:)?\/\//.test(ref)) { push('SCENE_REF_REMOTE', file, `${ref}: медіа з мережі — гра має працювати офлайн, а ліцензію не перевірити`); return; }
    const clean = ref.replace(/[?#].*$/, '');
    let target;
    if (ctx === 'url') target = posix.normalize(posix.join('public', clean.replace(/^\/+/, '')));
    else if (clean.startsWith('.') || ctx === 'map') target = posix.normalize(posix.join(posix.dirname(file), clean));
    else target = posix.normalize(posix.join('public', clean.replace(/^\/+/, '')));
    // Дані гри (.json), вшиті імпортом, живуть у content/ і src/ — їх стереже валідатор контенту.
    const roots = ctx === 'import' && /\.json$/.test(clean) ? /^(public|assets|content|src)\// : /^(public|assets)\//;
    if (!roots.test(target)) { push('SCENE_REF_OUTSIDE', file, `${ref} → ${target}: поза public/ і assets/, сторож ліцензій його не бачить`); return; }
    if (target.includes('*')) {
      const re = globToRe(target);
      const base = target.slice(0, target.indexOf('*')).replace(/\/[^/]*$/, '');
      if (!fs.list(base).some((p) => re.test(p))) push('SCENE_REF_MISSING', file, `${ref} → ${target}: шаблон не збігся з жодним файлом`);
      return;
    }
    if (!fs.exists(target)) { push('SCENE_REF_MISSING', file, `${ref} → ${target}: файлу немає`); return; }
    if (MAP_FILE.test(target)) followMap(target);
  }

  // Непрямі посилання: карта Tiled / тайлсет / бітмап-шрифт → картинки й зовнішні тайлсети.
  function followMap(path) {
    if (followed.has(path)) return;
    followed.add(path);
    const text = fs.read(path);
    if (text == null) { push('SCENE_MAP_BAD', path, 'не вдалося прочитати — непрямі посилання не перевірено'); return; }
    const refs = [];
    if (/\.(tmj|tsj)$/.test(path)) {
      let data;
      try { data = JSON.parse(text); } catch (e) { push('SCENE_MAP_BAD', path, `не JSON (${e.message}) — непрямі посилання не перевірено`); return; }
      const sets = data.type === 'tileset' || /\.tsj$/.test(path) ? [data] : (data.tilesets ?? []);
      for (const [i, ts] of sets.entries()) {
        const own = [ts.image, ts.source, ...(ts.tiles ?? []).map((t) => t.image)].filter((v) => typeof v === 'string');
        if (!own.length) push('SCENE_MAP_BAD', path, `тайлсет #${i} без image/source — сторож нічого не побачив (анти-порожнеча)`);
        refs.push(...own);
      }
      const walkLayers = (ls) => { for (const l of ls ?? []) { if (typeof l.image === 'string') refs.push(l.image); walkLayers(l.layers); } };
      walkLayers(data.layers);
    } else {
      for (const m of text.matchAll(/\b(?:source|file|imagePath)\s*=\s*"([^"]+)"/g)) refs.push(m[1]);
      if (/\.(fnt|tsx)$/.test(path) && !refs.length) push('SCENE_MAP_BAD', path, 'жодного file=/source= — сторож нічого не побачив (анти-порожнеча)');
    }
    stats.mapRefs += refs.length;
    for (const r of refs) classify(r, path, 'map');
  }

  for (const { file, text } of sources) {
    const masked = maskComments(text, file);
    const spans = [];
    const inSpan = (i) => spans.some(([a, b]) => i >= a && i < b);

    if (CODE_FILE.test(file)) {
      for (let k = masked.match(LOAD_ALIAS)?.length ?? 0; k > 0; k--) push('SCENE_LOAD_ALIAS', file, `this.load без виклику методу — завантажувач під іншим іменем сторож не бачить`);
      for (const m of masked.matchAll(LOAD_CALL)) {
        const fn = m[1]; const open = m.index + m[0].length - 1;
        const { args, end } = parseArgs(masked, open);
        spans.push([m.index, end]);
        if (LOAD_NO_PATH.has(fn)) continue;
        const call = masked.slice(m.index, end).replace(/\s+/g, ' ');
        if (LOAD_BASE.has(fn)) {
          if (args.length && plainString(args[0]) !== '') push('SCENE_LOAD_BASE_PATH', file, `${call}: базовий шлях міняє, звідки вантажаться ВСІ наступні файли — пиши шлях повністю в кожному виклику`);
          continue;
        }
        stats.loads++;
        let paths = 0; let flagged = false;
        for (const a of args.slice(1)) {
          if (isScalar(a)) continue;
          if (a.startsWith('{') && a.endsWith('}')) {
            for (const r of a.matchAll(MEDIA)) { paths++; classify(r[2], file, 'url'); }
            for (const r of a.matchAll(RESEARCH)) if (!FULL_MEDIA.test(r[2])) push('SCENE_REF_RESEARCH', file, `${r[2]}: research/ у налаштуваннях ${call}`);
            continue;
          }
          const items = a.startsWith('[') && a.endsWith(']') ? parseArgs(`(${a.slice(1, -1)})`, 0).args : [a];
          for (const it of items) {
            const s = plainString(it);
            if (s !== null && LOAD_PATH.test(s)) { paths++; classify(s, file, 'url'); }
            else { flagged = true; push('SCENE_LOAD_NOT_LITERAL', file, `${call}: аргумент «${it}» — не простий шлях-літерал із розширенням, сторож не може його перевірити`); }
          }
        }
        if (!paths && !flagged) push('SCENE_LOAD_NOT_LITERAL', file, `${call}: жодного шляху-літерала — сторож не перевірив цей виклик`);
      }
    }

    for (const m of text.matchAll(MEDIA)) {
      if (inSpan(m.index)) continue;
      const ref = m[2];
      if (ref.includes('${')) { push('SCENE_REF_DYNAMIC', file, `${ref}: шлях зі вставкою — сторож не знає, куди він веде`); continue; }
      classify(ref, file, /\.html$/.test(file) && !ref.startsWith('.') ? 'url' : 'import');
    }
    if (/\.(html|css)$/.test(file)) {
      for (const m of masked.matchAll(CSS_URL)) {
        if (m[1].includes('${')) { push('SCENE_REF_DYNAMIC', file, `url(${m[1]}): шлях зі вставкою`); continue; }
        classify(m[1], file, m[1].startsWith('.') ? 'import' : 'url');
      }
    }
    for (const m of masked.matchAll(RESEARCH)) {
      if (inSpan(m.index) || FULL_MEDIA.test(m[2])) continue;
      push('SCENE_REF_RESEARCH', file, `${m[1]}${m[2]}${m[1]}: рядок веде в research/ — проби в грі не вантажаться ні цілим шляхом, ні уламком`);
    }
    for (const m of masked.matchAll(/(['"`])([^'"`\s]*)\1/g)) {
      if (inSpan(m.index) || /research\//.test(m[2])) continue;
      const tail = masked.slice(m.index + m[0].length, m.index + m[0].length + 8);
      if (FRAGMENT_EXT.test(m[2]) || (/^[^'"`\s]+\/$/.test(m[2]) && /^\s*\+/.test(tail)))
        push('SCENE_REF_DYNAMIC', file, `${m[0]}: уламок шляху для конкатенації — повний шлях сторож не бачить, пиши його одним літералом`);
    }
    if (/\.html$/.test(file)) {
      for (const m of masked.matchAll(/<(script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/g)) {
        const ref = m[2];
        if (m[1] === 'link' && !/\.css(\?|$)/.test(ref) && !/rel\s*=\s*["']?stylesheet/.test(m[0])) continue;
        if (/^(https?:)?\/\//.test(ref)) { push('SCENE_REF_REMOTE', file, `${ref}: код чи стилі з мережі`); continue; }
        const target = posix.normalize(ref.startsWith('/') ? ref.slice(1) : posix.join(posix.dirname(file), ref));
        if (!/^src\//.test(target)) { push('SCENE_ENTRY_OUTSIDE', file, `${ref} → ${target}: вхід сторінки поза src/ — його медіа сторож не сканує`); continue; }
        if (!fs.exists(target)) push('SCENE_REF_MISSING', file, `${ref} → ${target}: файлу немає`);
      }
    }
  }
  for (const mp of maps) followMap(mp);
  out.stats = stats;
  return out;
}

/** HTML-сторінки збірки: входи Rollup із vite.config.ts + усі *.html у корені. */
export function htmlEntries(viteText, rootHtml) {
  const fromVite = [...String(viteText ?? '').matchAll(/['"]([^'"\s]+\.html)['"]/g)].map((m) => posix.normalize(m[1].replace(/^\.?\//, '')));
  return { fromVite, all: [...new Set([...fromVite, ...rootHtml])].sort() };
}

function walk(dir, re) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p, re));
    else if (re.test(f)) out.push(p);
  }
  return out;
}

function selfTest() {
  const camp = JSON.stringify({ tilesets: [{ firstgid: 1, image: 'kenney-rpg.png' }] });
  const files = {
    'public/spike/camp.tmj': camp, 'public/spike/kenney-rpg.png': '', 'assets/credits.png': '', 'assets/credits.json': '',
    'public/fonts/a.ttf': '', 'src/main.ts': '', 'content/meta.json': '', 'content/dialogue/d1.json': '', 'src/i18n/en.json': '',
    'public/m/ghost.tmj': JSON.stringify({ tilesets: [{ image: 'nope.png' }] }),
    'public/m/research.tmj': JSON.stringify({ tilesets: [{ image: '../../research/art-spike/tile.png' }] }),
    'public/m/empty.tmj': JSON.stringify({ tilesets: [{ name: 'x' }] }),
    'public/m/broken.tmj': '{ не json',
    'public/m/ext.tmj': JSON.stringify({ tilesets: [{ firstgid: 1, source: 'ext.tsj' }] }),
    'public/m/ext.tsj': JSON.stringify({ type: 'tileset', image: 'gone.png' }),
    'public/m/remote.tmj': JSON.stringify({ tilesets: [{ image: 'https://example.org/t.png' }] }),
    'public/f/ghost.fnt': 'info face="x"\npage id=0 file="ghost.png"\n',
  };
  const fs = { exists: (p) => p in files, read: (p) => files[p] ?? null, list: (d) => Object.keys(files).filter((p) => p.startsWith(`${d}/`)) };
  const ts = (text) => [{ file: 'src/view/a.ts', text }];
  const cases = [
    ['позитивний контроль: файл у public/', [{ file: 'src/view/a.ts', text: "load('spike/camp.tmj')" }], []],
    ['позитивний контроль: відносний імпорт з assets/', [{ file: 'src/a.ts', text: "import x from '../assets/credits.png'" }], []],
    ['позитивний контроль: справжня сцена (карта + spritesheet з налаштуваннями)', ts("this.load.tilemapTiledJSON('camp', 'spike/camp.tmj');\n    this.load.spritesheet('kenney-rpg', 'spike/kenney-rpg.png', { frameWidth: TILE, frameHeight: TILE, spacing: 1 });"), []],
    ['позитивний контроль: дані .json імпортом із content/ і src/, glob діалогів', [{ file: 'src/content/story.ts', text: "import meta from '../../content/meta.json';\nimport en from '../i18n/en.json';\nconst d = import.meta.glob('../../content/dialogue/*.json', { eager: true });" }], []],
    ['позитивний контроль: index.html зі шрифтом і входом у src/', [{ file: 'index.html', text: "<style>@font-face{src:url('fonts/a.ttf')} .x{background:url(fonts/a.ttf)}</style><script type=\"module\" src=\"/src/main.ts\"></script>" }], []],
    ['позитивний контроль: службові методи завантажувача, масив, булевий аргумент, коментарі', ts("// не з 'research/x' — коментар\nthis.load.on('complete', done); this.load.start();\nthis.load.audio('a', ['spike/kenney-rpg.png']); this.load.image('b', 'spike/kenney-rpg.png', true); // об'єкт\nconst c = toB64url(x); this.load.setPath('');"), []],
    ['позитивний контроль: карта з public/ — картинка тайлсета поруч', [], [], ['public/spike/camp.tmj']],
    ['файлу немає', [{ file: 'src/view/a.ts', text: "load('spike/ghost.png')" }], ['SCENE_REF_MISSING']],
    ['проба з research/', [{ file: 'src/view/a.ts', text: "import t from '../../research/art-spike/tile.png'" }], ['SCENE_REF_OUTSIDE']],
    ['медіа з мережі', [{ file: 'src/view/a.ts', text: "load('https://example.org/tiles.png')" }], ['SCENE_REF_REMOTE']],
    // Сліпі плями з рецензії.
    ['конкатенація research/ поза load', ts("img.src = 'research/art-spike/' + name;"), ['SCENE_REF_RESEARCH']],
    ['конкатенація research/ у load', ts("this.load.image('k', 'research/art-spike/' + name + '.png');"), ['SCENE_LOAD_NOT_LITERAL']],
    ['шлях у змінній (рецензія)', ts("const P = 'research/x'; this.load.image('k', P + '.png');"), ['SCENE_LOAD_NOT_LITERAL', 'SCENE_REF_RESEARCH']],
    ['шлях у змінній без research/', ts("const P = 'spike/kenney-rpg.png'; this.load.image('k', P);"), ['SCENE_LOAD_NOT_LITERAL']],
    ['шаблон із ${} у load', ts('this.load.image(\'k\', `spike/${n}.png`);'), ['SCENE_LOAD_NOT_LITERAL']],
    ['шаблон із ${} поза load', ts('img.src = `spike/${n}.png`;'), ['SCENE_REF_DYNAMIC']],
    ['уламки шляху поза load', ts("img.src = 'spike/' + n + '.png';"), ['SCENE_REF_DYNAMIC']],
    ['load без розширення (Phaser допише .png сам)', ts("this.load.image('k', 'research/tile');"), ['SCENE_LOAD_NOT_LITERAL']],
    ['load з об\'єктом-налаштуванням замість шляху', ts("this.load.image({ key: 'k', url: P });"), ['SCENE_LOAD_NOT_LITERAL']],
    ['load у багаторядковому виклику зі змінною', ts("this.load.spritesheet(\n  'k',\n  base,\n  { frameWidth: 16 },\n);"), ['SCENE_LOAD_NOT_LITERAL']],
    ['tilemapTiledJSON з ../research/ (рецензія)', ts("this.load.tilemapTiledJSON('camp', '../research/camp.json');"), ['SCENE_REF_OUTSIDE']],
    ['setPath у research/', ts("this.load.setPath('research/'); this.load.image('k', 'spike/kenney-rpg.png');"), ['SCENE_LOAD_BASE_PATH']],
    ['завантажувач під іншим іменем', ts("const L = this.load; L.image('k', P);"), ['SCENE_LOAD_ALIAS']],
    ['CSS url без лапок — файлу немає', [{ file: 'index.html', text: '<style>@font-face{src:url(fonts/ghost.ttf)}</style>' }], ['SCENE_REF_MISSING']],
    ['CSS url без лапок у .css — research/', [{ file: 'src/ui/a.css', text: '.x{background:url(../../research/a.png)}' }], ['SCENE_REF_OUTSIDE']],
    ['вхід сторінки поза src/ (spike.html)', [{ file: 'spike.html', text: '<script type="module" src="/tools/spike/main.ts"></script>' }], ['SCENE_ENTRY_OUTSIDE']],
    ['вхід сторінки в src/, але файлу немає', [{ file: 'spike.html', text: '<script type="module" src="/src/ghost.ts"></script>' }], ['SCENE_REF_MISSING']],
    ['glob даних без жодного збігу', [{ file: 'src/a.ts', text: "import.meta.glob('../content/ghost/*.json')" }], ['SCENE_REF_MISSING']],
    ['load → карта, у якій картинки тайлсета немає', ts("this.load.tilemapTiledJSON('g', 'm/ghost.tmj');"), ['SCENE_REF_MISSING']],
    ['карта: тайлсет із research/', [], ['SCENE_REF_OUTSIDE'], ['public/m/research.tmj']],
    ['карта: тайлсет без image/source', [], ['SCENE_MAP_BAD'], ['public/m/empty.tmj']],
    ['карта: не JSON', [], ['SCENE_MAP_BAD'], ['public/m/broken.tmj']],
    ['карта: зовнішній тайлсет .tsj, картинки немає', [], ['SCENE_REF_MISSING'], ['public/m/ext.tmj']],
    ['карта: картинка з мережі', [], ['SCENE_REF_REMOTE'], ['public/m/remote.tmj']],
    ['бітмап-шрифт: сторінки немає', [], ['SCENE_REF_MISSING'], ['public/f/ghost.fnt']],
  ];
  // Кожне нове розширення доводимо окремо: '../../research/x.<ext>' мусить почервоніти.
  for (const ext of ['json', 'gif', 'mp4', 'webm', 'xml', 'fnt', 'tmj', 'tsj', 'svg', 'woff2', 'ogg']) {
    cases.push([`розширення .${ext} з research/`, ts(`import a from '../../research/a.${ext}';`), ['SCENE_REF_OUTSIDE']]);
  }
  let bad = 0; const proven = new Set();
  for (const [name, src, expect, maps = []] of cases) {
    const got = [...new Set(check(src, fs, { maps }).map((f) => f.code))].sort();
    if (JSON.stringify(got) === JSON.stringify([...expect].sort())) expect.forEach((c) => proven.add(c));
    else { bad++; console.log(`FAIL ${name}: очікував [${expect}], отримав [${got}]`); }
  }
  // Пошук сторінок: spike.html із входів Rollup мусить потрапити в скан, навіть якщо його немає серед *.html кореня.
  const e = htmlEntries("build: { rollupOptions: { input: { main: 'index.html', spike: 'spike.html' } } }", ['index.html']);
  if (!e.all.includes('spike.html') || !e.all.includes('index.html')) { bad++; console.log(`FAIL htmlEntries: ${e.all}`); }
  const unproven = CODES.filter((c) => !proven.has(c));
  if (unproven.length) { bad++; console.log(`FAIL без прикладу: ${unproven}`); }
  const n = cases.length + 1;
  console.log(bad ? `SCENE REFS SELF-TEST: FAILED ${bad}` : `SCENE REFS SELF-TEST: PASSED ${n}/${n} · кодів ${CODES.length}, доведено ${proven.size}`);
  return bad ? 1 : 0;
}

const args = cli({ flags: ['self-test'] });
if (args['self-test']) process.exit(selfTest());

const viteCfg = join(ROOT, 'vite.config.ts');
const { fromVite, all: html } = htmlEntries(existsSync(viteCfg) ? readFileSync(viteCfg, 'utf8') : '', readdirSync(ROOT).filter((f) => /\.html$/.test(f)));
const pre = [];
if (!fromVite.length) pre.push({ code: 'SCENE_REF_MISSING', where: 'vite.config.ts', msg: 'жодного .html серед входів збірки — пошук сторінок зламано?' });
for (const h of html) if (!existsSync(join(ROOT, h))) pre.push({ code: 'SCENE_REF_MISSING', where: 'vite.config.ts', msg: `${h}: сторінки збірки немає` });
const files = [...walk(join(ROOT, 'src'), /\.(ts|tsx|mjs|js|css)$/).filter((f) => !/\.test\.|\.spec\./.test(f)), ...html.filter((h) => existsSync(join(ROOT, h))).map((h) => join(ROOT, h))];
const sources = files.map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));
const maps = [...walk(join(ROOT, 'public'), MAP_FILE), ...walk(join(ROOT, 'assets'), MAP_FILE)].map((f) => relative(ROOT, f));
const realFs = {
  exists: (p) => existsSync(join(ROOT, p)),
  read: (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return null; } },
  list: (d) => walk(join(ROOT, d), /./).map((f) => relative(ROOT, f)),
};
const res = check(sources, realFs, { maps });
const { stats } = res;
const found = [...pre, ...res];
for (const f of found) console.log(`::error::${f.code} · ${f.where} · ${f.msg}`);
if (stats.refs === 0) { console.log('::error::SCENE REFS: 0 посилань на медіа — сторож нічого не бачить (шаблон зламано?)'); process.exit(1); }
if (stats.loads === 0) { console.log('::error::SCENE REFS: 0 викликів load.<fn>() у src/ — сторож завантажувача нічого не бачить (шаблон зламано?)'); process.exit(1); }
const summary = `${stats.refs} посилань (з них ${stats.mapRefs} непрямих із ${maps.length} карт/шрифтів), ${stats.loads} викликів load.*, ${files.length} файлів (HTML: ${html.join(', ')})`;
console.log(found.length ? `SCENE REFS: FAILED ${found.length}` : `SCENE REFS: OK · ${summary} — усі в public/ або assets/ і наявні`);
process.exit(found.length ? 1 : 0);
