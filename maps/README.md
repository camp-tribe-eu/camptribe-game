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
