---
name: law-platform-facts
description: Факти платформи, які я щоразу перевідкриваю болем — закон, що зібрав 12 заміряних випадків.
metadata:
  type: feedback
---

# Факти платформи, які я щоразу перевідкриваю болем

Факти, за кожен з яких я вже заплатив циклом CI або годинами. Тут
немає принципу — тут перелік, який треба ПРОЧИТАТИ перед дотиком до
відповідної технології.

## Випадки (12), кожен зі своїм заміром

- [[a-config-values-meaning-comes-from-vendor-code]] — Семантику значення конфігу читай у коді вендора, а не виводь із назви змінної
- [[a-hand-written-prefix-can-delete-the-standard]] — Написаний руками -webkit- поруч зі стандартною властивістю змусив LightningCSS лишити в збірці ТІЛЬКИ префіксну — і…
- [[a-next-route-file-forbids-extra-exports]] — route.ts може експортувати лише обробники й конфіг; локальний tsc мовчить, доки dev/build не згенерує .next/types
- [[a-paint-property-can-change-layout-containment]] — backdrop-filter зробив шапку контейнером для fixed-нащадків — шухляда 1024×768 стала 1024×64 і клік перестав доходити
- [[a-pure-function-change-can-move-a-url]] — Якщо сегмент адреси рахується на льоту, зміна чистої функції не додає URL, а рухає його — і при статичному експорті…
- [[check-how-the-route-is-served-before-loosening-a-limit]] — Збирався підняти ліміт на найважчому публічному ендпоінті; маршрут виявився force-static, і прод його взагалі не…
- [[lint-rules-differ-per-workspace]] — prettier вимкнений у scripts/ і ОБОВ'ЯЗКОВИЙ у apps/api — перевірка в корені дала хибну відповідь на обидва
- [[next-metadata-does-not-deep-merge]] — Next: openGraph сторінки ЗАМІНЮЄ openGraph макета, а title.template не діє в тому ж сегменті, де оголошений
- [[on-first-retry-traces-the-success]] — trace: 'on-first-retry' записує трасу ПОВТОРУ, тобто успіху — зависання лишається без жодного сліду; і повністю…
- [[patch-creates-and-absent-is-403]] — Directus: PATCH неіснуючого поля віддає 200 і створює його, а неіснуюча колекція — 403, не 404; гілка на 404 стає…
- [[relative-location-crashes-next-middleware]] — Відносний Location із middleware кидає TypeError в adapter() Next; моє «виправлення» замінило б 4455 поганих…
- [[the-framework-may-already-vendor-what-you-upgrade]] — Next несе власний React 19 усередині — ми були на ньому при встановленому 18, і 90% зеленого в тому PR не могло…
