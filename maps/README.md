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


**GAME-172 «Живий кемпінг».** `public/maps/camp-lake.tmj` — 40×24 (було 20×12). Ліва частина (стовпці 0–9, рядки 0–11) і всі об'єкти шару
`objects` стоять у тих самих клітинках; єдина зміна старої частини — ворота у східній стіні (стовпці 10–11, рядки 5–8). Зони: наметні місця
(старі й південна галявина), вогнище, рецепція (13–17, 3–5), санітарний блок (21–25, 3–5), берег і причал (озеро 28–39 × 1–12, настил у рядку 7),
лісова стежка (стовпці 18–19) і галявина. Генератор тепер знає й чотири цілі дня 3, дописані раніше руками (id у файлі були задвоєні). Зони, їхні якорі й
мешканці — `src/view/world/ambient.ts` (сторож — `ambient.test.ts` і `tests/e2e/game-172.spec.ts`).
