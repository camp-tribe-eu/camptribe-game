---
name: git-push-and-api-are-different-identities
description: "У camp-репозиторії push іде по SSH від власника, а GitHub API — від бот-токена; успішний push нічого не каже про права в API"
metadata:
  node_type: memory
  type: project
  originSessionId: 89858e8b-4a6c-4c23-9782-7ef21e28cd10
  modified: 2026-09-23T15:20:00.491Z
---

У `camp-tribe-eu/camp` remote — це SSH-аліас `git@github-camptribe:...`, тобто
`git push` іде ключем **власника**. А `gh` працює через `GH_TOKEN` акаунта
`marketing1utdteam-spec`. Це дві різні особи з різними правами.

**Why:** 23.09.2026 пуш гілки `camp-103-osm-durability` пройшов і CI позеленів,
а `gh pr create` відмовив: `must be a collaborator`. Виглядало як збій GitHub,
насправді бот-акаунт втратив доступ до репозиторію
(`repos/…/permissions.push == false`, тричі поспіль; org membership → 404).

**How to apply:** успішний `git push` ≠ є права в API. Перед висновком «GitHub
зламався» перевіряти саме права токена:
`gh api repos/camp-tribe-eu/camp --jq .permissions` і `gh auth status`. Якщо
push: false — це крок власника (Settings → Collaborators and teams), а не те,
що обходиться. Гілку й CI це не блокує, блокує лише PR, merge,
`workflow run` і створення релізів від мого імені; воркфлоу всередині
GitHub користуються власним `github.token` і не залежать від цього.

Пов'язане: [[github-flow-and-branch-hygiene]], [[verify-before-asserting]]
