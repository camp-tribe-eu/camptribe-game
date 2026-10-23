# Кемпер у стилі LPC — три шляхи і їхня ціна

Дослідження 23.10.2026. Прогалина: спрайт **кемпера / каравану** у вигляді LPC (3/4 зверху,
32 px, ~2×3–3×4 тайли, палітра й напрямок світла LPC). Рамки рішень: OD-010 (FAL до $10 на всю v1),
OD-013 (спершу доведення наявних спрайтів, 0 €).

🔴 **Метод і межа.** Сторінки з сесії напряму не відкриваються (проксі 403), тому всі числа нижче
взято з **фрагментів пошукової видачі** (WebSearch), а не з відкритої сторінки. Біля кожного числа
стоїть джерело. Жодна сторінка не звірена очима — це **NOT RUN** до перевірки через runner
`research-fetch` або власником у браузері. Ціни в USD/CAD; курс до EUR не звірявся
(порядок величини той самий).

## Зведення

| шлях | оцінка ціни | час | ризик ліцензії | джерела |
|---|---|---|---|---|
| 1. FAL + наш конвеєр палітри + ручне доведення | **$0.30–5 за 100 спроб** (schnell $0.003/МП, dev $0.025/МП — сніпети), у межах OD-010 $10 | 1–3 дні нашої роботи (доведення — основна ціна) | середній: FAL не гарантує, що вихід не порушує чужих прав; вихід не унікальний; графіка «чужа» до доведення | [fal pricing docs](https://fal.ai/docs/documentation/model-apis/pricing), [ModelsLab](https://modelslab.com/fal-ai-pricing), [Gurubase](https://gurubase.io/g/fal-ai/price-of-flux1-on-fal-ai), [fal ToS](https://www.fal.ai/legal/terms-of-service) |
| 2. Замовити піксель-артиста | **1 напрямок: ~$50–200; 4 напрямки: ~$200–600** (оцінка, виведена з годинних ставок і прайсів; готового прайсу «LPC-авто» не знайдено) | 1–4 тижні, залежить від артиста | низький, **якщо** в договорі прямо: передача прав + реліз під CC0 або CC-BY-SA 3.0 | [OGA, ~20 $/год, 6–8 год на LPC-об'єкт](https://opengameart.org/node/17135), [LPC-форум](https://lpc.opengameart.org/user/1/comments?page=36), [Aseprite community](https://community.aseprite.org/t/a-simple-pricing-sanity-check-for-pixel-art-commissions/28697) |
| 3. Купити платний набір | **$3.99–5 / 4.99 CAD** за набір | години (купівля) + доведення до LPC | 🔴 **високий**: платні набори забороняють перепоширення, а наш репозиторій **публічний** — покласти файли в `assets/` = перепоширити | [Cozy Campers](https://cosmeon.itch.io/cozy-campers), [Vehicle Pack](https://iclaimthisname.itch.io/vehicle-pack), [Terrible Campsite](https://terriblejared.itch.io/terrible-campsite) |
| 0. Безкоштовне доведення (OD-013) | **0 €** | 1–3 дні нашої роботи | низький (CC-BY-SA 3.0 / CC0 / CC-BY 4.0, титри) | [LPC Modern Car Additions](https://opengameart.org/content/lpc-modern-car-additions) (уже в `research/packs/pack-lpc-car/`) та ін. — див. нижче |

---

## 1. FAL + конвеєр + ручне доведення

**Яку модель кличемо.** `scripts/art-generate.py` за замовчуванням викликає ендпоінт
`fal-ai/flux/schnell` (рядок `spec.get("endpoint", "fal-ai/flux/schnell")`); spec-файл може
перевизначити його, наприклад на `fal-ai/flux/dev`.

**Ціна (усе — сніпети, не сторінка fal):**

* FLUX.1 [schnell] — **$0.003 за мегапіксель** — [ModelsLab](https://modelslab.com/fal-ai-pricing)
  (оновлено 23.09.2026, за їхніми словами — з модельних сторінок fal),
  [Gurubase](https://gurubase.io/g/fal-ai/price-of-flux1-on-fal-ai). Інші агрегатори:
  $0.0031 за 1024×1024 ([PricePerToken](https://pricepertoken.com/image/model/black-forest-labs-flux-schnell)),
  $0.005 за генерацію ([MuAPI](https://muapi.ai/id/playground/flux-schnell) — це ціна посередника,
  не fal).
* FLUX.1 [dev] — **$0.025 за мегапіксель** — [ModelsLab](https://modelslab.com/fal-ai-pricing).
  Ендпоінт dev із ControlNet/LoRA — $0.075/МП (сніпет зі сторінки fal
  [flux-general](https://fal.ai/models/fal-ai/flux-general/playground)).
* Офіційне джерело — [документація fal про ціни](https://fal.ai/docs/documentation/model-apis/pricing):
  за сніпетом, у кожної моделі своя ціна й одиниця, видно на сторінці моделі та на
  `fal.ai/pricing`. Саму сторінку `fal.ai/pricing` з сесії не прочитано — **NOT RUN**.
* ⚠️ Округлення: кілька сторонніх джерел пишуть, що fal округлює **вгору до цілого МП**; 1024×1024 ≈
  1.05 МП → може рахуватися як 2 МП (ціна ×2). Документацією fal не підтверджено. Безпечно
  генерувати 1000×1000 або менше.

**Кошторис для кемпера:** 100 спроб schnell ≈ $0.30–0.60; 100 спроб dev ≈ $2.50–5.00. Обидва
вміщаються в OD-010 ($10), але бюджет спільний із портретами й іконками.

**Справжня ціна — доведення.** Замір `brain/Передача/03-zamir-grafiky.md` показав, що FLUX малює
темну рамку і не тримає сітку. Для об'єкта (не тайла) конвеєр `to_tile` не підходить як є: потрібні
зменшення до 96×128, перезведення палітри до LPC (не до медіанного розрізу), ручний контур і
тінь з напрямком світла LPC. Це години ручної роботи в редакторі; хто її робить — питання до
власника (смак).

**Ліцензія.** За сніпетом [Terms of Service fal](https://www.fal.ai/legal/terms-of-service)
(оновлено 03.03.2026): fal не претендує на права на Output Content, але **не гарантує**, що вихід
оригінальний і не порушує чужих прав, і що він унікальний між користувачами. Тобто прав на вихід
fal не забирає, але й не дає гарантій. Ліцензія моделі FLUX.1 [dev] (BFL, некомерційна для ваг) може
мати свої умови для виходу через API — **не перевірено, NOT RUN**. Schnell — Apache 2.0 (за
загальним знанням, не звірено в цьому дослідженні).

---

## 2. Замовити піксель-артиста

**Готового прайсу «LPC-авто зверху 3/4» не знайдено.** Нижче — опорні точки, з яких виведено
діапазон.

| що | число | джерело | звідки |
|---|---|---|---|
| ставка досвідченого артиста | ~20 $/год; один LPC-об'єкт ≈ 6–8 год | [OGA, 2013](https://opengameart.org/node/17135) | сніпет |
| неформальна оцінка на LPC-форумі | простий 16×16 аркуш ~$75–150; більші (64×32) — «$400+», «може бути хибно в 2–3 рази» | [lpc.opengameart.org](https://lpc.opengameart.org/user/1/comments?page=36) | сніпет |
| мінімум за 32×32 і менше | $50 при 25 $/год | артист на itch.io, видача за [itch.io/post/10361496](https://itch.io/post/10361496/view-in-topic) | сніпет (який саме з результатів — не встановлено) |
| статичний 32×32 | $20–25 | прайси на carrd, видача [Aseprite community](https://community.aseprite.org/t/a-simple-pricing-sanity-check-for-pixel-art-commissions/28697) | сніпет |
| Fiverr | 32×32 — $5, 64×64 — $12 (гіг призупинено) | [fiverr.com/lordfitoi](https://fiverr.com/lordfitoi/make-the-items-art-for-you-game) | сніпет |
| за комерційні права | +10 % у одного з артистів | та сама видача прайсів | сніпет |

**Виведений діапазон (наша оцінка, не ціна з прайсу):** кемпер 96×128 px — це 12 тайлів 32 px,
не один. За 6–8 год × $10–25/год:

* **1 напрямок, статичний:** ~**$50–200**.
* **4 напрямки, статичні** (або 2 + дзеркало, що дешевше на ~третину): ~**$200–600**.
* Fiverr-низ ($5–12) для об'єкта такого розміру й узгодження з LPC — нереалістичний; там
  ризик отримати чужий стиль.

**Ліцензія — головне в договорі.** Потрібен прямий пункт: передача прав (work-for-hire) **і**
дозвіл опублікувати файл під **CC0** (найпростіше) або **CC-BY-SA 3.0** (як LPC; тоді титри
артиста). Без цього файл не можна класти в публічний репозиторій. Якщо артист бере LPC-спрайти
як основу, результат обов'язково CC-BY-SA (похідний твір). Де шукати: розділ commissions на
[lpc.opengameart.org](https://lpc.opengameart.org/forumtopic/2d-pixel-artist-open-for-commissions),
r/gameDevClassifieds, r/HungryArtists (Reddit у видачі не з'явився — **NOT RUN**).

---

## 3. Купити платний набір

🔴 **Головний ризик для нас.** Репозиторій **публічний**. Будь-який файл у `assets/` будь-хто може
завантажити, отже покласти туди платний набір = **перепоширити** його. Більшість платних наборів
це забороняють («may not re-sell / redistribute»). Навіть «used in a game» зазвичай означає
зібрану гру, а не відкриту теку з PNG. Прецедент уже є: ART-002 (0_mem0ry) у реєстрі має «may not be
resold or redistributed» і тому досі «_ще не використано_». Для платного набору потрібен або
письмовий дозвіл автора на публічний репозиторій, або зберігання поза репозиторієм (тоді ламається
відтворюваність білду і сторож `check-assets`).

| кандидат | ціна | ліцензія (сніпет) | вигляд / розмір | кемпер? | джерело |
|---|---|---|---|---|---|
| **Cozy Campers** (cosmeon) | **від 4.99 CAD** | «use… to develop any commercial/non-commercial game», «may not re-sell»; про перепоширення в репо — нічого | невідомо; файли HopperFullSheet.png 3.1 kB, Full Set.png 43 kB — маленькі, імовірно 16 px | назва каже так, вміст не звірено | [itch.io](https://cosmeon.itch.io/cozy-campers) · [purchase](https://cosmeon.itch.io/cozy-campers/purchase) |
| **Vehicle Pack** (iClaimThisName) | **від $5** | у сніпеті не вказана — **NOT RUN** | зверху, 32×32; караван 32 px, «car + caravan… 64px wide together» | так, **караван-причіп** | [itch.io](https://iclaimthisname.itch.io/vehicle-pack) · [purchase](https://iclaimthisname.itch.io/vehicle-pack/purchase) |
| **Terrible Campsite** (terriblejared) | у сніпеті не вказана — **NOT RUN** | формальної ліцензії в сніпеті немає; автор просить (не вимагає) персонажа-камео; «tiles are listed as public» — значення неясне | 32×32 **при щільності 2 px** (тобто піксель 16-px-арту, збільшений) — інша щільність, ніж LPC | так: popup-, teardrop-кемпери, **2 моделі кемпер-вена** по 4 кольори | [itch.io](https://terriblejared.itch.io/terrible-campsite) |
| Camping Builder Kit (MutterPixel) | від $3.99 | «free for personal and commercial use… can't resell or redistribute the files as-is» | піксель, тайли | **ні** (намети, вогнище, речі) | [itch.io](https://mutterpixel-studio.itch.io/camping-builder-kit) |

Жоден кандидат не 3/4 у стилі LPC 32 px за даними сніпетів: усі — пласкі «зверху» і/або 16-px
щільність. Тобто після купівлі все одно потрібне доведення, а гармонія (закон власника) під
питанням. GameDev Market і Humble у видачі не з'явились — **NOT RUN**.

---

## Безкоштовні кандидати для доведення (OD-013)

| кандидат | ліцензія | що там | придатність | джерело |
|---|---|---|---|---|
| **LPC Modern Car Additions** (Blue Moon Bear, на основі Skorpio) | CC-BY-SA 3.0 / GPL 3.0 (цитата зі сторінки вже в `research/packs/pack-lpc-car/LICENSE-from-page.txt`) | легкові авто LPC | **найкраща основа**: уже LPC-палітра й світло; на пробі ~30 % завелике. Кемпер = подовжений кузов-фургон на базі авто → похідний твір **CC-BY-SA 3.0** з описом змін | [OGA](https://opengameart.org/content/lpc-modern-car-additions) |
| [LPC] Skorpio's SciFi Sprite Pack | (за видачею — CC-BY-SA 3.0 / GPL 3.0; не звірено) | джерело авто Skorpio | донор деталей | [OGA](https://opengameart.org/content/lpc-skorpios-scifi-sprite-pack) (є в `research/lists/list-lpc-car.txt`) |
| [LPC] police car | не звірено — **NOT RUN** | LPC-авто | донор кузова/коліс | [OGA](https://opengameart.org/content/lpc-police-car) (є в `research/lists/list-lpc-car.txt`) |
| Trucks (pmhicks) | CC-BY-SA 3.0 (сніпет) | вантажівки зверху, PNG+SVG | не LPC; донор форми фургона | [OGA node/31279](https://opengameart.org/node/31279) |
| Top-down vehicle pack (Unlucky Studio) | CC0 (сніпет) | mini truck, **mini van**, truck | не LPC; форма мінівена як референс | [OGA node/33247](https://opengameart.org/node/33247) |
| Pixel Vehicles (MinZinn) | CC BY 4.0 (сніпет) | авто зверху 16/32, 8 кольорів; один сніпет каже, що v1.14 додала **Camper**, інший кемпера не знайшов — **суперечність, NOT RUN** | пласкі зверху, не 3/4; CC BY 4.0 вимагає титрів | [itch.io](https://minzinn.itch.io/pixelvehicles) |
| Caravan (nicubunu) | CC0 (сніпет) | SVG, тег «Isometric», з «game map clipart» | імовірно фентезійний віз, не автокараван — не звірено | [OGA node/3041](https://opengameart.org/node/3041) |

**Не брати:** chuckiecatt 90s Vehicles (є фургони) — у реєстрі вже стоїть «не брати без окремого
рішення»; Gnomish caravan — середньовічний віз (CC-BY-SA 3.0 / GPL 2.0).

**Рекомендований порядок (з OD-013):** спершу доведення LPC Modern Car Additions до кемпер-вена
(0 €, CC-BY-SA 3.0, титри вже налагоджені сторожем). Лише якщо не вийде — FAL у межах $10 як
референс форми, з ручним доведенням. Платний набір — останній, через публічний репозиторій.

---

## Що невідомо / NOT RUN

* Жодна сторінка не відкрита напряму (проксі 403); **усі числа — зі сніпетів** пошукової видачі.
  Перевірка — runner `research-fetch` (`oga:`-рядки) або власник у браузері.
* Точна ціна на `fal.ai/models/fal-ai/flux/schnell` і `…/flux/dev` та правило округлення МП — не
  звірені з першоджерела fal.
* Умови ліцензії FLUX.1 [dev] щодо виходу через API fal — не перевірені.
* Ціни й ліцензії Vehicle Pack та Terrible Campsite — не встановлені; вміст Cozy Campers не звірено.
* Чи є кемпер у MinZinn Pixel Vehicles — сніпети суперечать один одному.
* Ліцензії [LPC] police car і Skorpio's SciFi pack — не звірені зі сторінок.
* Діапазон для артиста — **наша оцінка** з годинних ставок, не чиясь опублікована ціна за
  такий спрайт. Reddit, GameDev Market, Humble у видачі не з'явились.
* Курс USD/CAD → EUR не звірявся.

---

## Проба FAL — заміряно 23.10.2026 (GAME-27, пункт 2 «Способу перевірки»)

**Запит:** `art/requests/camper-lpc.json` (FLUX schnell, seed 20261023, 1024×768, 4 кроки). Прогони
`art.yml`: [39900103148](https://github.com/camp-tribe-eu/camptribe-game/actions/runs/39900103148)
(згенерував, але впав на коміті — `art/out/` у `.gitignore`; workflow виправлено) і другий, що
закомітив `art/out/camper-lpc_raw.png`. **Витрачено:** 2 зображення × 0.79 МП ≈ **$0.005** з $10 (OD-010).

**Доведення** (`research/camper-trial/prep.py`, потім `scripts/palette/quantize.py`): прибрати рожевий
фон, обрізати, зменшити до 96 px завширшки (3 клітинки LPC) → `camper96.png` 96×65, звести до палітри
LPC → `research/camper-trial/camper96_lpc.png` (збільшено ×6: `camper96_lpc_6x.png`).

| замір | до зведення | після |
|---|---|---|
| сторож палітри `scripts/palette/check.py` | **FAIL**: 3 054 чужі кольори, 5 751 px (негативний контроль) | **PASS**: 0 чужих кольорів (палітра lpc, 519) |
| кольорів у спрайті | 3 073 | 105 |

**Чесно — чому це ще не спрайт гри:**

1. **Ракурс не той.** FLUX намалював кемпер **збоку** (дах ледь видно), а LPC — 3/4 зверху. Поруч із
   LPC-персонажами й авто це читатиметься як інша гра. Підказка «three-quarter top-down» не спрацювала.
2. **Немає контуру.** У LPC темна обвідка в 1 px; тут краї м'які, після зменшення — рожево-бузкова бахрома.
3. **Вшита тінь** (бузкова смуга під колесами) — у LPC тінь не малюють у спрайт.
4. **105 кольорів** — забагато для одного предмета LPC (зазвичай 10–25); палітра пройдена механічно, не художньо.

**Висновок проби:** шлях 1 дає **заготовку за копійки**, але не готовий спрайт: ракурс і контур
доведеться перемальовувати руками (1–3 дні), тобто за обсягом ручної роботи він близький до шляху 0
(перемалювати LPC-авто), а за ліцензією гірший (див. ризик у зведенні). Друга спроба з іншою підказкою
(ізометрія, «top-down RPG vehicle») — дешева, але порядок проблем той самий: модель не знає сітки LPC.

**Рекомендація для рішення власника:** шлях 0 (доведення LPC Modern Car Additions до кемпер-вена,
0 €), FAL — як ескіз-референс для пропорцій. Рішення — **за власником** (смак і гроші), запис у
`docs/DECISION_LOG.md` як OD-xxx після відповіді.
