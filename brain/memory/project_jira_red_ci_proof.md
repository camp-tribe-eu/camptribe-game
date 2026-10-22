---
name: Доказ «падіння валідатора блокує злиття» і стан Jira-сесії 22.10.2026
description: Червоний CI на PR #7 дав mergeable_state blocked; зелений PR #6 на тій самій базі — clean. Jira в цій сесії не з'єдналась
metadata:
  type: project
---

Доповнює `project_jira_pending.md` (гілка `game-profile-combos`, PR #6), картка 1, пункт 5.

**Доказ (22.10.2026, база обох PR — `main` d89f0cc):**
- PR #7 `proof-red-ci-blocks-merge`: `content/meta.json` без квестів → check-run `content`
  = failure (job 119939472417, лог: `CONTENT_EMPTY · quests.json`, `exit code 1`), `scan` = success.
  `mergeable_state: "blocked"` (знято після виходу з чернетки). PR закрито без злиття.
- PR #6 `game-profile-combos`: `content` і `scan` = success → `mergeable_state: "clean"`.
- Різниця між ними — лише червоний `content`. Отже ruleset 25642609 справді блокує злиття.

**Що досі НЕ доведено в картці 1:** пункт 6 «рецензент» — PR #4 злито з 0 рецензій.
Тому картку 1 не закривати, поки рецензію не отримано або власник не прийняв це рішенням.

**Jira:** у сесії 22.10.2026 16:0x UTC конектор `Atlassian_MCP` — `CONNECT_TIMEOUT`.
JQL на дубль не виконано, карток не заведено, ID переходів не відомі. Наступна сесія з
конектором: `getAccessibleAtlassianResources` (чекати cloudId `835bc68c-…`) → далі за `docs/JIRA.md`.

**Хвіст:** гілку `proof-red-ci-blocks-merge` не вдалося видалити з сесії (`git push --delete` →
`remote end hung up`). Видалити кнопкою «Delete branch» на закритому PR #7.

**Як застосовувати:** пункт 5 картки 1 закривати посиланням на PR #7 і цей файл, не «зеленим CI».
