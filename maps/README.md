# Мапи Tiled

Мапи гри у форматі Tiled JSON (`.tmj`). Кожну перевіряє `node scripts/maps/validate-maps.mjs`:
з кожної точки появи пішки досяжні всі тригери й NPC. Формат і коди — `docs/MAP-VALIDATOR.md`.

Коротко для Tiled:

* Map → orthogonal, не infinite; Tile Layer Format = **CSV**; тайлсет **вбудований** (Embed Tileset).
* Стіни — шар із властивістю `collides` (bool) = true.
* Шар об'єктів з назвою `objects`; кожен об'єкт: Class/Type = `spawn` | `trigger` | `npc`, непорожнє Name.

`camp-prologue.tmj` — 20×12, тайли 16 px (Kenney, `../public/spike/kenney-rpg.png`): точка появи
`s.prologue` у лівій кімнаті, через прохід у стіні — тригер `t.campfire` і NPC `npc.ranger`.
