# Реєстр ліцензій

🔴 Ресурс без рядка в цій таблиці у гру не потрапляє.

| ID | ресурс | джерело | ліцензія (дослівно) | атрибуція | перевірено | де використано |
|---|---|---|---|---|---|---|
| ART-001 | Kenney Roguelike/RPG pack | https://kenney.nl/assets/roguelike-rpg-pack | "Creative Commons CC0" | ні | 22.10.2026 | `public/spike/kenney-rpg.png` — спайк Phaser (GAME-14), аркуш без змін |
| ART-002 | 0_mem0ry Camping Furniture Set | https://0-mem0ry.itch.io/camping-furniture-set-free | "May be used for commercial and non-commercial projects… may not be resold or redistributed" | ні | 22.10.2026 | _ще не використано_ |
| ART-003 | Forchild Basic Village Tileset | https://forchild.itch.io/village-tileset | "You can use this tileset in any way you prefer (CC-0)" | ні | 22.10.2026 | _ще не використано_ |
| ART-004 | inkBubi Forest Tileset (sample) | https://opengameart.org/content/free-sample-16x16-pixel-forest-tileset-%E2%80%93-top-down-rpg-style | "License(s): CC0" | ні | 22.10.2026 | _ще не використано_ |
| ART-005 | LPC Tile Atlas (adrix89; автори зі зведеного `Attribution.txt` набору — у `assets/CREDITS.csv`) | https://opengameart.org/content/lpc-tile-atlas | "License(s): CC-BY-SA 3.0", "GPL 3.0" — обрано "CC-BY-SA 3.0" (цитата зі сторінки: `research/packs/pack-lpc-atlas/page.html.lic-snippet.txt`) | так, титри | 22.10.2026 | `assets/tiles/terrain_atlas.png` і `assets/tiles/base_out_atlas.png` — без змін (GAME-21; `terrain_atlas.png` — основа мапи кемпінгу, GAME-93) |
| ART-006 | Universal LPC Spritesheet Character Generator — 17 шарів ходьби `walk.png` | https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/blob/master/CREDITS.csv (сторінки авторів — колонка `source_urls` у `assets/CREDITS.csv`) | по шару, дослівно з колонки `licenses` CREDITS.csv генератора: 14 шарів "OGA-BY 3.0" (поряд "CC-BY-SA 3.0", "GPL 3.0" або "CC-BY"), 3 шари волосся лише "CC-BY-SA 3.0", "GPL 3.0"; обрано найм'якшу: "OGA-BY 3.0" або "CC-BY-SA 3.0" | так, титри | 22.10.2026 за генератором; сторінки OGA з сесії не звірені — **NOT RUN** | `assets/characters/` (GAME-21) |
| ART-007 | Camp Fire Animation for RPGs, finished (Zabin) — вогнище 5 кадрів | https://opengameart.org/content/camp-fire-animation-for-rpgs-finished | "License(s): CC-BY-SA 3.0" (цитата зі сторінки: `research/packs/pack-lpc-campfire/page.html.lic-snippet.txt`) | так, титри; **змінено**: квантовано на палітру основи, змінений твір лишається CC-BY-SA 3.0 | 23.10.2026 | `assets/sprites/campfire.png` — анімоване вогнище сцени (GAME-93) |
| ART-008 | LPC modern car additions (Blue Moon Bear) — авто Skorpio | https://opengameart.org/content/lpc-modern-car-additions | "License(s): GPL 3.0", "CC-BY-SA 3.0" — обрано "CC-BY-SA 3.0" (`research/packs/pack-lpc-car/page.html.lic-snippet.txt`) | так, титри; **змінено**: обрізка, зменшення до висоти 64 px (NEAREST), квантування на палітру; лишається CC-BY-SA 3.0 | 23.10.2026 | `assets/tiles/camp_car.png` — авто на мапі кемпінгу (GAME-93; прогалина «авто ~30 % завелике» закрита зменшенням) |
| ART-009 | tent-3 (xhunterko) — намет | https://opengameart.org/content/tent-3 | "License(s): CC-BY 3.0", "GPL 3.0", "GPL 2.0", "OGA-BY 3.0", "CC0" — обрано "CC0" (`research/packs/pack-lpc-tent/page.html.lic-snippet.txt`) | ні (CC0), титр лишено з ввічливості; **змінено**: ×2 NEAREST, полотно 96×64, один колір контуру на палітру | 23.10.2026 | `assets/tiles/camp_tent.png` — два намети кемпінгу (GAME-93; намет у стилі LPC — досі прогалина, це найкращий наявний) |
| FONT-001 | Press Start 2P (CodeMan38) | https://github.com/google/fonts/tree/main/ofl/pressstart2p | "This Font Software is licensed under the SIL Open Font License, Version 1.1." (OFL.txt першоджерела) | так — текст ліцензії поруч: `public/fonts/PressStart2P-OFL.txt` | 22.10.2026 | `public/fonts/PressStart2P-Regular.ttf` — шрифт UI (GAME-26), без змін |

**Не брати без окремого рішення:** CraftPix (ліцензія відкликувана, заборона навчання ШІ),
chuckiecatt (CC BY 4.0 — обов'язкова атрибуція), MrBeast OGA (CC-BY 3.0 / GPL 2.0).

## Як сторож зв'язує файли з рядками (GAME-21)

`node scripts/assets/check-assets.mjs` читає клітинку «де використано» кожного рядка `XXX-NNN`
(ART-, FONT-, згодом SND-…): кожен шлях у бектиках, що починається з `assets/` або `public/`, —
точний файл, а шлях із `/` у кінці — тека з усім, що під нею. Текст поза бектиками (« — спайк …»)
не читається.

* відстежуються PNG в `assets/` і **медіа в `public/`** (PNG/JPG/GIF/WebP/SVG, TTF/OTF/WOFF/WOFF2,
  OGG/MP3/WAV/FLAC/M4A…) — бо `public/` копіюється в білд як є; мапи (`.tmj`) і тексти ліцензій — ні;
* кожен відстежуваний файл потрапляє **рівно в один** рядок;
* кожен такий шлях покриває хоч один відстежуваний файл (інакше рядок застарів);
* у клітинці «джерело» є посилання на сторінку;
* обрана в `assets/CREDITS.csv` ліцензія файлу дослівно стоїть у клітинці «ліцензія».

**`public/` без титрів — рішення.** Файли `public/` рядка в `assets/CREDITS.csv` не мають, тож туди
можна класти лише те, що титрів не вимагає: CC0 (ART-001, атрибуція «ні») або OFL (FONT-001),
чий текст ліцензії лежить поруч у `public/` і названий у клітинці «атрибуція» в бектиках.
Ліцензія з вимогою атрибуції (OGA-BY, CC-BY, CC-BY-SA) у `public/` — червоне
(`PUBLIC_NEEDS_CREDITS`): такий файл живе в `assets/` з рядком титрів.

**Звірка з першоджерелом.** Для шарів персонажів (`characters/…`) колонки `licences_offered` і
`authors` звіряються із закріпленою випискою `research/art-spike/CREDITS-lpc-characters.csv`
(`hair/messy1/adult/walk.png` ↔ `assets/characters/hair/messy1/adult/walk.png`); розбіжність —
`CREDITS_UPSTREAM_MISMATCH`, рядка у виписці немає — `CREDITS_UPSTREAM_MISSING`.

**Змінені файли.** Колонка `modified` у `assets/CREDITS.csv`: `no` (байти як у першоджерелі) або
короткий опис змін (≥ 8 знаків; він потрапляє в `credits.json` — CC-BY-SA вимагає вказати зміни).
Якщо файл змінено, а найм'якша доступна ліцензія — CC-BY-SA (за титрами або за реєстром), обрана
ліцензія лишається CC-BY-SA: похідний твір не переліцензовується (`CREDITS_SA_RELICENSED`).

Титри по файлах — `assets/CREDITS.csv`; для екрана титрів — `assets/credits.json`, що генерується
з нього (`--write-json`; застарілий json — червоне). Шари персонажів імпортує
`scripts/assets/import_lpc_characters.py` (`--offline research/art-spike/CREDITS-lpc-characters.csv`
відтворює їхні рядки байт у байт).

**Чесна межа ART-006.** Ліцензії шарів персонажів процитовано з `CREDITS.csv` генератора, тобто з
агрегатора, а не зі сторінок авторів на OpenGameArt: OGA із сесії закрито. Звірка зі сторінками
першоджерел — через runner `research-fetch` (`oga:<slug>` із `source_urls`); до того — NOT RUN.
Шар `head/heads/human/male_small` у генераторі не має жодного посилання на сторінку: у титрах
стоїть посилання на сам генератор і примітка про це.
