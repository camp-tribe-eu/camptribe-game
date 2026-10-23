# Мапи Tiled

Мапи гри у форматі Tiled JSON (`.tmj`). Кожну перевіряє `node scripts/maps/validate-maps.mjs`:
з кожної точки появи пішки досяжні всі тригери й NPC. Формат і коди — `docs/MAP-VALIDATOR.md`.

Коротко для Tiled:

* Map → orthogonal, не infinite; Tile Layer Format = **CSV**; тайлсет **вбудований** (Embed Tileset).
* Стіни — шар із властивістю `collides` (bool) = true.
* Шар об'єктів з назвою `objects`; кожен об'єкт: Class/Type = `spawn` | `trigger` | `npc`, непорожнє Name.

`camp-prologue.tmj` — 20×12, тайли 16 px (Kenney, `../public/spike/kenney-rpg.png`): точка появи
`s.prologue` у лівій кімнаті, через прохід у стіні — тригер `t.campfire` і NPC `npc.ranger`.

Мапи, які справді вантажить гра, лежать у `public/maps/` (їх роздає Vite) і перевіряються тим самим
валідатором: `node scripts/maps/validate-maps.mjs --dir public/maps` (частина `npm run validate`).
`public/maps/camp-lake.tmj` — кемпінг біля озера: точка появи `s.camp`, вогнище `obj.campfire`, Еліза
`npc.elise`. Сцена бере ці координати з шару `objects`, а не з коду.

**GAME-93.** `public/maps/camp-lake.tmj` — тепер тайли LPC 32 px (`assets/tiles/terrain_atlas.png`, намет і авто —
`camp_tent.png`, `camp_car.png`), координати об'єктів подвоєно разом із тайлом (ті самі клітинки: точка появи (6,5),
вогнище (3,4), Еліза (2,8); ті самі заблоковані клітинки: рядки 0 і 11, стовпець 10). Шари: `ground`, `decor`, `walls`
(колізії), `above` (верхівки дерев, дах намету — над персонажем, коли той стоїть позаду), `objects`. Мапу збирає
`python3 scripts/maps/build_camp_lake.py` (`--preview x.png` — картинка, `--check` — звірка з файлом); вручну в Tiled
правити не треба, але можна — сцена читає лише імена шарів і тайлсетів.

