# Реєстр ліцензій

🔴 Ресурс без рядка в цій таблиці у гру не потрапляє.

| ID | ресурс | джерело | ліцензія (дослівно) | атрибуція | перевірено | де використано |
|---|---|---|---|---|---|---|
| ART-001 | Kenney Roguelike/RPG pack | https://kenney.nl/assets/roguelike-rpg-pack | "Creative Commons CC0" | ні | 22.10.2026 | `public/spike/kenney-rpg.png` — спайк Phaser (GAME-14), аркуш без змін |
| ART-002 | 0_mem0ry Camping Furniture Set | https://0-mem0ry.itch.io/camping-furniture-set-free | "May be used for commercial and non-commercial projects… may not be resold or redistributed" | ні | 22.10.2026 | _ще не використано_ |
| ART-003 | Forchild Basic Village Tileset | https://forchild.itch.io/village-tileset | "You can use this tileset in any way you prefer (CC-0)" | ні | 22.10.2026 | _ще не використано_ |
| ART-004 | inkBubi Forest Tileset (sample) | https://opengameart.org/content/free-sample-16x16-pixel-forest-tileset-%E2%80%93-top-down-rpg-style | "License(s): CC0" | ні | 22.10.2026 | _ще не використано_ |
| ART-005 | LPC Tile Atlas (adrix89; автори зі зведеного `Attribution.txt` набору — у `assets/CREDITS.csv`) | https://opengameart.org/content/lpc-tile-atlas | "License(s): CC-BY-SA 3.0", "GPL 3.0" — обрано "CC-BY-SA 3.0" (цитата зі сторінки: `research/packs/pack-lpc-atlas/page.html.lic-snippet.txt`) | так, титри | 22.10.2026 | `assets/tiles/` — `terrain_atlas.png` і `base_out_atlas.png` без змін (GAME-21) |
| ART-006 | Universal LPC Spritesheet Character Generator — 17 шарів ходьби `walk.png` | https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/CREDITS.csv (сторінки авторів — колонка `source_urls` у `assets/CREDITS.csv`) | по шару, дослівно з колонки `licenses` CREDITS.csv генератора: 14 шарів "OGA-BY 3.0" (поряд "CC-BY-SA 3.0", "GPL 3.0" або "CC-BY"), 3 шари волосся лише "CC-BY-SA 3.0", "GPL 3.0"; обрано найм'якшу: "OGA-BY 3.0" або "CC-BY-SA 3.0" | так, титри | 22.10.2026 за генератором; сторінки OGA з сесії не звірені — **NOT RUN** | `assets/characters/` (GAME-21) |
| FONT-001 | Press Start 2P (CodeMan38) | https://github.com/google/fonts/tree/main/ofl/pressstart2p | "This Font Software is licensed under the SIL Open Font License, Version 1.1." (OFL.txt першоджерела) | так — текст ліцензії поруч: `public/fonts/PressStart2P-OFL.txt` | 22.10.2026 | `public/fonts/PressStart2P-Regular.ttf` — шрифт UI (GAME-26), без змін |

**Не брати без окремого рішення:** CraftPix (ліцензія відкликувана, заборона навчання ШІ),
chuckiecatt (CC BY 4.0 — обов'язкова атрибуція), MrBeast OGA (CC-BY 3.0 / GPL 2.0).

## Як сторож зв'язує файли з рядками (GAME-21)

`node scripts/assets/check-assets.mjs` читає клітинку «де використано»: кожен шлях у бектиках,
що починається з `assets/`, — точний файл, а шлях із `/` у кінці — тека з усім, що під нею.

* кожен PNG в `assets/` потрапляє **рівно в один** рядок;
* кожен такий шлях покриває хоч один файл (інакше рядок застарів);
* у клітинці «джерело» є посилання на сторінку;
* обрана в `assets/CREDITS.csv` ліцензія файлу дослівно стоїть у клітинці «ліцензія».

Шляхи поза `assets/` (як `public/spike/` в ART-001) сторож не чіпає. Титри по файлах —
`assets/CREDITS.csv`; для екрана титрів — `assets/credits.json`, що генерується з нього
(`--write-json`; застарілий json — червоне). Шари персонажів імпортує
`scripts/assets/import_lpc_characters.py`.

**Чесна межа ART-006.** Ліцензії шарів персонажів процитовано з `CREDITS.csv` генератора, тобто з
агрегатора, а не зі сторінок авторів на OpenGameArt: OGA із сесії закрито. Звірка зі сторінками
першоджерел — через runner `research-fetch` (`oga:<slug>` із `source_urls`); до того — NOT RUN.
Шар `head/heads/human/male_small` у генераторі не має жодного посилання на сторінку: у титрах
стоїть посилання на сам генератор і примітка про це.
