# Звірка фактів `content/facts.json` зі сторінками першоджерел (GAME-56)

З контейнера сесії ці сайти закриті (проксі 403), тому сторінки забирає runner
`.github/workflows/research-fetch.yml` у режимі `page:` і друкує видимий текст у лог прогону.
Тут — короткі дослівні цитати, на яких стоїть `checkedAt`. Лог прогону GitHub зберігає 90 днів;
цитата лишається тут.

## 2026-10-23 · прогін [39896865650](https://github.com/camp-tribe-eu/camptribe-game/actions/runs/39896865650)

| факт | сторінка (sha256, перші 16) | цитата |
|---|---|---|
| `fact.nl-no-wild-camping` | natuurmonumenten.nl/kamperen (`8208f431e7bfdcb2`) | «Maar let op: écht wildkamperen is nergens in Nederland toegestaan.» Та сама сторінка називає три каное-місця в De Wieden, «waar je legaal mag vrij kamperen», — тому в тексті гри «лише там, де ночівлю дозволено». |
| `fact.nl-signboard-rules` | natuurmonumenten.nl/natuurgebieden/gebiedsregels (`e77e5511e6c79556`) | «…op de gele terreinborden bij de ingang van de gebieden. Daarop staat welke activiteiten zijn toegestaan. Voor alle andere activiteiten geldt: 'Overigens verboden toegang'. Dit betekent dat activiteiten die niet op het terreinbord staan automatisch niet toegestaan zijn…» |
| `fact.nl-sbb-pole-camping-closed` | staatsbosbeheer.nl/…/sluiten-paalkampeerterreinen (`f53f31db5fd238be`) | Заголовок «Staatsbosbeheer stopt per 1 juni met paalkampeerterreinen» (28 mei 2020); «de 17 paalkampeerterreinen … niet meer open gaan»; причини: «Steeds vaker werd er vuur gebruikt; afval en toiletpapier achtergelaten; vernielingen aangebracht en langer en met meer mensen dan toegestaan overnacht.» |

## Не звірено — у реєстр не внесено

- **Фландрія, бівак-зони** (`natuurenbos.be/activiteiten/bivakzone`) і **вогонь у природі**
  (`natuurenbos.be/een-kampvuur-maken-mag-dat`): сайт на runner відповідає `HTTP 202` і віддає
  2399 байт перевірки на бота замість сторінки (прогін
  [39897247127](https://github.com/camp-tribe-eu/camptribe-game/actions/runs/39897247127)).
  Перший прогін показав порожнє тіло з кодом успіху — сторож runner'а тоді цього не помітив, тепер помічає.
  Рецензія також вказала, що формулювання цих двох фактів, імовірно, перебільшують (не всі
  бівак-зони вимагають броні; є винятки з дозволом). Повернути — лише після звірки людиною в
  браузері, з цитатою сюди.
