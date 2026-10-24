# YouTube Playables: вимоги першоджерела для CampLife

Зібрано з логів GitHub Actions, workflow `research-fetch`, гілка `claude/youtube-playables-research`. Цитати дослівно англійською, переклад не видається за цитату. Дата вибірки всіх сторінок: 2026-10-24.

## 1. Джерела

Основний прогін: run 40081959023 (job 120837173828, head 89b151cc). Попередній: run 40081430968 (job 120835638926, head 415b92c7). Обидва прогони завершилися з `failure` на кроці «Забрати» через 404 на `yt-faq`.

| Назва | URL | HTTP | sha256 (префікс) | Дата | Run |
|---|---|---|---|---|---|
| yt-requirements | https://developers.google.com/youtube/gaming/playables/certification/requirements | 200 | c74dd7b0e0fa6376 | 2026-10-24 | 40081959023 |
| yt-sdk | https://developers.google.com/youtube/gaming/playables/reference/sdk | 200 | 7b7038ce8208a3df | 2026-10-24 | 40081959023 |
| yt-test-suite | https://developers.google.com/youtube/gaming/playables/test_suite | 200 | c3393ecddcfeaa45 | 2026-10-24 | 40081959023 |
| yt-faq | https://developers.google.com/youtube/gaming/playables/faq | **404 (failed)** | не виведено | 2026-10-24 | 40081959023 |
| yt-phaser-template | https://github.com/phaserjs/template-youtube-playables | 200 | da097910dc6b91f7 | 2026-10-24 | 40081959023 |
| yt-phaser-readme | https://raw.githubusercontent.com/phaserjs/template-youtube-playables/main/README.md | 200 | 8b868fb831c34b5c | 2026-10-24 | 40081959023 |
| yt-req-stability | https://developers.google.com/youtube/gaming/playables/certification/requirements_stability | 200 | a4ede829c83a2de2 | 2026-10-24 | 40081959023 |
| yt-req-privacydata | https://developers.google.com/youtube/gaming/playables/certification/requirements_privacydata | 200 | 13cf837124beba62 | 2026-10-24 | 40081959023 |
| yt-req-monetization | https://developers.google.com/youtube/gaming/playables/certification/requirements_monetization | 200 | 72dc6e5c7c9e347b | 2026-10-24 | 40081959023 |
| yt-req-trustsafety | https://developers.google.com/youtube/gaming/playables/certification/requirements_trustsafety | 200 | d835c30fcb2fabba | 2026-10-24 | 40081959023 |
| yt-support-faq | https://developers.google.com/youtube/gaming/playables/support/faq | 200 | 147c92ce80f6729c | 2026-10-24 | 40081959023 |
| yt-ref-monetization | https://developers.google.com/youtube/gaming/playables/reference/monetization | 200 | c931de8af5d32969 | 2026-10-24 | 40081959023 |

Дати «Last updated» на самих сторінках: requirements 2026-06-16; stability 2026-06-16; privacydata 2026-06-15; monetization 2026-10-19; trustsafety 2026-08-26; support/faq 2026-03-09; reference/monetization 2026-06-01.

Застереження про повноту:
- Логи друкують не більше 12000 символів тексту сторінки. Сторінка SDK обрізана посеред розділу `ytgame.system` (на `onAudioEnabledChange`), тож сигнатури `isAudioEnabled`, `onAudioEnabledChange`, `onPause`, `onResume` з самої SDK-сторінки не прочитані. Їхні імена підтверджені іншими сторінками (монетизація, README Phaser).
- `yt-test-suite` повернула лише оболонку сторінки без тексту (вочевидь, сторінка будується скриптом). Кроків сертифікації з неї отримати не вдалося.
- `yt-requirements` є лише індексом: перелік категорій, визначення MUST/SHOULD, три рядки про контакт, тест і реліз.
- Сторінки Accessibility, Design, Integration, i18n/L10n requirements у вибірку не входили, не завантажені. Вимоги про орієнтацію, співвідношення сторін, мінімальну тривалість гри, ймовірно, лежать там.
- У run 40081430968 сторінок `yt-req-*`, `yt-support-faq`, `yt-ref-monetization` немає: скрипт упав на `yt-faq` раніше. Вміст `yt-requirements` в обох прогонах ідентичний, sha256 відрізняється (129461005284a8b2 проти c74dd7b0e0fa6376) за однакового тексту; причина невідома.

## 2. Вимоги

Визначення з yt-requirements: «MUST ... If a Playable cannot meet any of such requirements, it will not be allowed to publish on YouTube.» «SHOULD ... Completing those requirements would help Playables get better visibility.»

| Тема | Дослівна цитата | URL | Що це означає для гри |
|---|---|---|---|
| Початковий бандл | "Game initial bundle size MUST be less than 30 MiB." / "Game initial bundle size SHOULD be less than 15 MiB." | requirements_stability | Жорстка межа 30 MiB, бажана 15 MiB. Вимірюється від початку завантаження сторінки до `gameReady`. Для LPC-спрайтів і тайлів потрібен атлас і ліниве довантаження. |
| Що таке initial bundle | "This is measured from the start of page load to the moment the game calls gameReady." | requirements_stability | Мірять завантажене до `gameReady`, а не весь пакет. |
| HTTP-стиснення | "Due to the use of HTTP compression, the transfer size of game assets is sometimes less than the stored size of the assets." | requirements_stability | Мірять передане, не збережене. Для самоперевірки радять стиснення або zip початкового вмісту. |
| Загальний бандл | "By default, the game total bundle size MUST be less than 250 MiB." | requirements_stability | Для CampLife не вузьке місце. Винятки відсилають до FAQ (`faq` дав 404, самі винятки не бачили). |
| Ліниве довантаження | "Game SHOULD only load the minimal amount of data needed to enable interactivity and lazy load the other data as needed." | requirements_stability | Країни та розділи вантажити за потреби. |
| Розмір файлу | "Every individual file within the game MUST be less than 30 MiB." / "Every individual file within the game SHOULD be less than 512 KiB." | requirements_stability | Бажано дрібні файли, ≤ 512 KiB. Великі атласи варто різати. |
| Кількість файлів | "The total number of files in the game bundle MUST be at most 8000." | requirements_stability | Для покритих тайлів і спрайтів із шарів запас є, але порахувати треба. |
| Імена файлів і шляхи | "Files in the game bundle MUST only contain alphanumeric and a few special characters: _ , - , ." / "Game MUST only use relative paths when referring to other files in the game bundle." | requirements_stability | Імена `assets/` без пробілів і кирилиці, лише відносні шляхи (у Vite `base: './'`). |
| Розмір збереження | "Saved game size MUST be less than 3 MiB." / "Saved game size SHOULD be less than 500 KiB." | requirements_stability | Стан гри компактний: ідентифікатори, не знімки світу. Ціль до 500 KiB. |
| Формат збереження | "The string must be a valid, well-formed UTF-16 string and a maximum of 3 MiB." | reference/sdk | `saveData(string)` приймає лише рядок. Перед записом `JSON.stringify` і перевірка `String.isWellFormed()`. Помилка перевищення має тип `SIZE_LIMIT_EXCEEDED`. |
| Хмарне збереження: форк | `if (ytgame?.IN_PLAYABLES_ENV) { ytgame.game.saveData(dataStr); } else { window.localStorage.setItem("SAVE_DATA", dataStr); }` | reference/sdk | Приклад самої документації: поза YouTube допустимий `localStorage`. Код збереження має мати обидві гілки. |
| Завантаження збереження | "Loads game data from YouTube in the form of a serialized string." | reference/sdk | `loadData()` повертає Promise<string>. Шаблон Phaser обгортає виклик тайм-аутом 1000 мс, бо він може зависати. |
| Зовнішні запити | "Game MUST NOT make external calls to any URLs or services, except where explicitly required to comply with other Technical Requirements (i.e., to call APIs owned by Google or YouTube)." | requirements_privacydata | Жодних запитів до наших серверів, CDN, шрифтів, аналітики. Усе всередині пакета. Збігається з принципом гри «офлайн». |
| Обхід заборони | "Game MUST NOT attempt to circumvent external call prevention." | requirements_privacydata | Не шукати обхідних шляхів. |
| QR-коди | "Game MUST NOT generate or display graphical content resembling or functioning as a Quick Response ("QR") code." | requirements_privacydata | У графіці, картах і Атласі не малювати QR-подібних візерунків. |
| Особисті дані | "Playables content MUST NOT prompt the user to enter, or in any way collect, personal information. This includes, but is not limited to, the names, ages, locations, usernames, or passwords of users." | requirements_privacydata | Ім'я героя, введене гравцем, зачепить «names»: не просити ім'я, дати вибір із готового списку. Рішення за власником. |
| Екрани входу | "Playables content MUST NOT display any graphical content resembling or functioning as a login or account creation screen." | requirements_privacydata | Жодних акаунтів у вбудованому варіанті. |
| Буфер обміну | "Game MUST NOT access the user's clipboard, unless it is in response to a player's explicit paste action." | requirements_privacydata | Кнопки «копіювати» немає. |
| Обфускація | "Creators MUST NOT obfuscate code or conceal the functionality of the game." Мінімізація дозволена. | requirements_privacydata | Звичайна збірка Vite з мінімізацією допустима. |
| Розмір і складність коду | "Games will be restricted to a total size or complexity of code (including the content of Script tags, JavaScript, WebAssembly, etc) that YouTube's tooling can scan and analyze." | requirements_privacydata | Є невизначена верхня межа коду, число не наведено. Phaser у бандлі дає великий JS: перевірити на bundle analyzer. |
| eval, WASM, Workers | "YouTube may decline to approve games it cannot evaluate ... due to use of language features such as: WebAssembly (WASM), eval(), Web workers" | requirements_privacydata | Не MUST NOT, але ризик відмови. Уникати eval і воркерів, перевірити залежності. |
| SPA | "Playables MUST be implemented as Single Page Applications ("SPAs")." | requirements_privacydata | Одна сторінка, без переходів між HTML. |
| Реклама: загально | "Game MAY display in-game advertising using YouTube-provided ads functions." / "Game MUST NOT display in-game advertising of any kind using off-platform services." | requirements_monetization | Лише рекламні функції YouTube, і то необов'язково. |
| Реклама: налаштування | "If you enable in-game advertising, you MUST also configure monetization settings in the YouTube Playables Developer Portal to turn them on." | requirements_monetization | Потрібен доступ до Developer Portal (питання власника). |
| Реклама: звук і пауза | "it MUST continue to correctly handle muting and unmuting using isAudioEnabled and onAudioEnabledChange and pause and resume using onPause and onResume." | requirements_monetization | Якщо є реклама, обробка звуку й паузи обов'язкова. Для CampLife на Phaser: `game.pause()` і `sound.setMute()`. |
| Interstitial: назва | "requestInterstitialAd() : Promise < void >" / "Makes no guarantees about whether the ad was shown. Do not use this API to reward players for watching an ad." | reference/sdk | Показ не гарантований, за нього нагороду не давати. |
| Interstitial: коли | "Interstitial ads MUST only be shown at natural transition points between two different content screens, such as after completing a level or after a game over." | requirements_monetization | Тільки між екранами: кінець етапу, прибуття до країни, завершення дня. |
| Interstitial: заборона | "Interstitial ads MUST NOT be shown during active gameplay or while the user is actively interacting with the game." | requirements_monetization | Не під час руху, діалогу, події. |
| Rewarded: назва | "requestRewardedAd ( rewardId : string ) : Promise < boolean >" | reference/sdk | Повертає true, якщо нагороду отримано. `rewardId` постійний для типу нагороди, без користувацьких даних. |
| Rewarded: опт-ін | "Rewarded ads MUST be strictly opt-in. ... Rewarded ads MUST NOT launch automatically." | requirements_monetization | Лише за явною кнопкою. |
| Rewarded: не блокувати | "Game MUST NOT stop or block standard gameplay progress until a rewarded ad is viewed. The user MUST always have a clear option to continue playing without viewing a rewarded ad." | requirements_monetization | Узгоджується з нашим «без pay-to-win»: нагорода не може бути єдиним шляхом далі. Чи нагорода лише косметична, першоджерело не каже. |
| Нагороди з вартістю | "Game MUST NOT offer rewards or items that have real-world monetary value, such as cash payouts or cryptocurrency." | requirements_monetization | Лише ігрова цінність, без обміну між гравцями. |
| Платежі | "Game MUST NOT offer in-app purchases of any kind using off-platform services." | requirements_monetization | Жодних покупок поза платформою. |
| Pre-roll | "YouTube handles pre-roll ads automatically—no integration work is required on your end." | reference/monetization | Пре-ролл ставить YouTube, його час додається до завантаження. |
| Дружній до реклами вміст | "If the game has monetization enabled, game content, including its title, description, and imagery, MUST adhere to YouTube's advertiser-friendly content guidelines." | requirements_monetization | Правило дійсне лише при ввімкненій монетизації. |
| Перше кадр | "The game MUST call this API. Otherwise, the game is not shown to users. firstFrameReady() MUST be called before gameReady()." | reference/sdk | `firstFrameReady()` викликати, як у шаблоні Phaser, у `init()` прелоадера після малювання екрана завантаження. |
| gameReady | "The game MUST call this API when it is interactable. The game MUST NOT call this API when a loading screen is still shown. Otherwise, the game fails the YouTube certification process." | reference/sdk | `gameReady()` після появи головного меню, не під екраном завантаження. |
| Порядок SDK | "The SDK MUST be loaded before any of your game code." / "You MUST NOT override this variable." | reference/sdk | Скрипт SDK у `index.html` першим, глобальну `ytgame` не перекривати. |
| Час завантаження | "Game SHOULD finish loading and allow user interaction in under 5 seconds." | requirements_stability | Бажана межа 5 с, лише SHOULD. |
| Пам'ять | "Game MUST NOT exceed a peak JavaScript heap size of 512 MB." | requirements_stability | Для великої карти і спрайтів стежити за пам'яттю, ліміт від iOS Safari. |
| Збої | "Game MUST NOT have consistently reproducible crashes." | requirements_stability | Softlock із CLAUDE.md тут підпадає під ризик відмови. |
| Технології | "Game MUST be based on standards-compliant Web APIs (e.g., JavaScript, Canvas, WebGL)" / "Playables MUST be compatible with the YouTube app on Android and iOS." | requirements_stability | Phaser, Canvas/WebGL відповідають. Тест на iOS обов'язковий. |
| Звук: хто керує | "Returns whether the game audio is enabled in the YouTube settings." (опис `isAudioEnabled`); "If audio is enabled in the YouTube Player then enable it our game too." | reference/sdk, Phaser README | Звуком керують налаштування YouTube. Гра читає стан і слухає `onAudioEnabledChange`. Рядок «Your game should also query the YouTube Playables SDK to know if it should play audio, or not» із README стосується шаблону, не вимоги. |
| Аналітика / збої | "Logs an error to YouTube. Note: This API is best-effort and rate-limited which can result in data loss." | reference/sdk | Єдиний канал телеметрії: `health.logError()` і `logWarning()` без аргументів. Зовнішня аналітика і Sentry заборонені правилом про зовнішні виклики. |
| Мова | "Returns the language that is set in the user's YouTube settings in the form of a BCP-47 language tag." | reference/sdk | `getLanguage()` для вибору мови гри. |
| Посилання назовні | "Generally, this will open the content in a new tab on web." (про `openYTContent`) | reference/sdk | Єдиний задокументований вихід: відкрити відео чи Playable YouTube. Про довільні посилання (сайт `camptribe.eu`) на цих сторінках нічого немає. |
| Рахунок | "The score must be less than or equal to the maximum safe integer. Otherwise, the score will be rejected." | reference/sdk | `sendScore` необов'язковий; для подорожі потрібне єдине вимірювання. |
| Аудиторія 1 | "Playables content MUST NOT specifically target kids, or be "made for kids" or "just for kids"." | requirements_trustsafety | Тон гри не дитячий. |
| Аудиторія 2 | "Playables content MUST be suitable for the general audience (Age 13+)." | requirements_trustsafety | Вікова межа 13+. Це збігається з нашим «без графічного насильства і сексуального вмісту». |
| Спільнота | "Playables content MUST follow the YouTube Community Guidelines, and must not contain inappropriate content listed in the guidelines." | requirements_trustsafety | Сам перелік (політика, релігія тощо) не на цих сторінках. Політику й релігію першоджерело тут не згадує. |
| Оманливі метадані | "Playables does not allow using the title, thumbnail, or description to trick the users into believing the Playables content is something it is not." | requirements_trustsafety | Назва і мініатюра відповідають грі. |
| ІВ: ліцензії | "Playables MUST represent authorized, original, or properly licensed content." / "Playables MUST have all necessary music rights in place for distribution." | requirements_trustsafety | LPC (CC-BY-SA) і титри мають бути в пакеті. Умови CC-BY-SA щодо поширення варто звірити окремо (legal). |
| Дублікати | "Playables MUST NOT be duplicate uploads or substantially identical to other Playables that already exist on the platform." | requirements_trustsafety | Не заливати той самий вміст повторно. |
| Тестові посилання | "This dev link and staging link MUST NOT be shared externally or outside of game certification testing purposes." | requirements_trustsafety | Не публікувати dev/staging посилання в репозиторії, оскільки він публічний. |
| Сертифікація: процес | "all Playables must undergo a review process before being publicly launched." / "Use the test suite to validate your integration with the Playables SDK." / "Speak to your Partner Manager for details on this process." | requirements | Є перевірка перед запуском, тест-сьют і Partner Manager. Етапи реліз-процесу тут не описані. |
| Тест локально | "To run your game in the YouTube SDK Test Suite, go to https://developers.google.com/youtube/gaming/playables/test_suite and enter http://localhost:8080 as the Game URL." | Phaser README | Тест-сьют приймає локальний URL (дев-сервер на порту 8080). |
| Рушії | "Engines and frameworks that have been used for Playables in the past include BabylonJS, Cocos, Construct, Defold, melonJS, Phaser, PixiJS, PlayCanvas, React, three.js, Godot, and Unity." | support/faq | Phaser у переліку. |
| Preload SDK | "Calling YouTubePlayables.boot will wait until the document has loaded and the YouTube Playables SDK is ready before calling the provided callback function" | Phaser README | Запускати `new Phaser.Game` у колбеку `boot`. |

## 3. НЕ ПІДТВЕРДЖЕНО першоджерелом

Дослівно в завантажених сторінках немає (або сказано інакше):

1. Bundle і save: ПІДТВЕРДЖЕНО (розділ 2), тут лише уточнення. Одиниці у джерелі MiB/KiB, не MB/KB. Межі 30/15 MiB стосуються initial bundle (до `gameReady`), а не всього пакета. Для save: MUST < 3 MiB, SHOULD < 500 KiB.
2. «No external network requests»: підтверджено лише частково. Джерело забороняє зовнішні виклики до URL і сервісів, крім API Google і YouTube. Слів «no network requests» немає.
3. «All data and fonts inside the package»: не підтверджено. Про шрифти ні слова. Вимоги лише забороняють зовнішні виклики і вимагають відносні шляхи. Висновок «шрифти всередині» є наслідком, а не цитатою.
4. «Ads only via requestInterstitialAd and requestRewardedAd»: підтверджено по суті ("MUST NOT display in-game advertising of any kind using off-platform services"), але фрази «лише ці дві функції» немає; пре-ролл додає сам YouTube.
5. «Rewarded only cosmetic»: не підтверджено. Є лише заборона на нагороди з реальною грошовою вартістю та умова не блокувати прогрес. Обмеження «тільки косметика» в джерелі відсутнє.
6. «Short games rejected as low value»: не підтверджено. Фрази про малоцінний вміст, мінімальну тривалість і «low value» у завантажених сторінках немає. Сторінка Design requirements, де вона могла б бути, не завантажена.

Також не знайдено, бо сторінки не були у вибірці або порожні: орієнтація й співвідношення сторін, доступність, i18n (крім `getLanguage`), точні кроки Test Suite, винятки з ліміту 250 MiB (FAQ дав 404), перелік політики й релігії у Community Guidelines. Раджу окремим прогоном додати: `requirements_design`, `requirements_integration`, `requirements_accessibility`, `requirements_i18n`, `certification/faq`, `reference/sdk` у кілька кусків (обрізано на 12000 символах).
