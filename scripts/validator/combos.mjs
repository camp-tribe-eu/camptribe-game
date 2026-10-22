// Комбінаторика стану гравця: профіль × транспорт × тварина.
// Перевірки досяжності проганяються для КОЖНОЇ комбінації окремо, бо «загальний» граф (усі
// переходи разом) бреше: шлях, що існує лише для велосипеда, не рятує гравця на авто.
//
// Модель (каркас, до підключення реального переліку профілів із bridge/inbox/):
//   • вимір без жодного запису в контенті не перебирається (одне значення null);
//   • тварина — щонайбільше одна: animal.none або одна з animals.json;
//   • профіль і тварина з полем transports дозволяють лише ці транспорти; несумісна комбінація
//     не перебирається, бо гравець не може її обрати;
//   • `when` на квесті/цілі/переході прибирає їх із комбінації, що не збігається;
//     на NPC/локації — робить їх недоступними (unlockedBy, який ніколи не настає),
//     щоб ціль на них червоніла, а не зникала мовчки.

export const NO_ANIMAL = 'animal.none';

// Id квесту, якого не існує: guaranteed(q) ніколи його не містить, тож запис ніколи не відкриється.
const NEVER = '\u0000never';
const I = (code, where, msg) => ({ code, where, msg });

export function enumerateCombos(content) {
  const ids = (k) => (content[k] ?? []).map((e) => e.id);
  const orNull = (xs) => (xs.length ? xs : [null]);
  const allows = (k, id, transport) => {
    const e = (content[k] ?? []).find((x) => x.id === id);
    return !e?.transports || e.transports.includes(transport);
  };
  const out = [];
  for (const profile of orNull(ids('profiles'))) {
    for (const transport of orNull(ids('transports'))) {
      if (!allows('profiles', profile, transport)) continue;
      for (const animal of [NO_ANIMAL, ...ids('animals')]) {
        if (allows('animals', animal, transport)) out.push({ profile, transport, animal });
      }
    }
  }
  return out;
}

// Лише на чистому контенті (див. validate()). Перевіряється транспорт, а не профіль чи тварина:
// профіль завжди має хоч одну комбінацію (його список непорожній і веде на існуючі транспорти,
// а «без тварини» дозволено завжди), а тварина недоступна рівно тоді, коли недоступні всі її
// транспорти. Перевірка цих вимірів не могла б почервоніти незалежно — це мертвий код (закон 5).
export function checkOptions(content, whens) {
  const all = enumerateCombos(content);
  const out = [];
  for (const t of content.transports ?? []) {
    if (!all.some((k) => k.transport === t.id)) out.push(I('COMBO_OPTION_UNUSABLE', t.id, 'жоден профіль не може ним їхати — і тварини, що їздять лише ним, теж недоступні'));
  }
  const dead = (conds) => !all.some((k) => conds.every((w) => matches(w, k)));
  // Перехід живий лише там, де збігаються умови квесту-джерела, самого переходу й квесту-цілі.
  // Квест із мертвою власною умовою звітує сам (нижче, через whens); його переходи не дублюють.
  const quests = new Map((content.quests ?? []).map((q) => [q.id, q]));
  const deadQuest = (id) => { const w = quests.get(id)?.when; return !!w && dead([w]); };
  for (const q of content.quests ?? []) {
    q.transitions.forEach((t, i) => {
      if (deadQuest(q.id) || deadQuest(t.to)) return;
      const conds = [q.when, t.when, quests.get(t.to)?.when];
      if (conds.some(Boolean) && dead(conds)) out.push(I('WHEN_UNSATISFIABLE', `${q.id}.transitions[${i}]`, `умовам джерела, переходу й цілі разом не відповідає жодна з ${all.length} дозволених комбінацій`));
    });
  }
  for (const [where, w, parent, kind] of whens) {
    if (kind === 'transition') continue;
    if (!all.some((k) => matches(w, k) && matches(parent, k))) out.push(I('WHEN_UNSATISFIABLE', `${where}.when`, `умові не відповідає жодна з ${all.length} дозволених комбінацій`));
  }
  return out;
}

export const comboLabel = (k) => [k.profile ?? '—', k.transport ?? '—', k.animal].join(' · ');

export function matches(when, k) {
  if (!when) return true;
  return (!when.profiles || when.profiles.includes(k.profile))
    && (!when.transports || when.transports.includes(k.transport))
    && (!when.animals || when.animals.includes(k.animal));
}

// Вигляд контенту з точки зору однієї комбінації. keep — якщо задано, лишаються тільки ці квести
// (досяжні в комбінації): що гравець не побачить, те й не перевіряється як тупик.
export function project(content, k, keep) {
  const strip = ({ when, ...rest }) => rest;
  const avail = (e) => (matches(e.when, k) ? strip(e) : { ...strip(e), unlockedBy: NEVER });
  const quests = (content.quests ?? []).filter((q) => matches(q.when, k) && (!keep || keep.has(q.id)));
  const ids = new Set(quests.map((q) => q.id));
  return {
    ...content,
    npcs: (content.npcs ?? []).map(avail),
    locations: (content.locations ?? []).map(avail),
    quests: quests.map((q) => ({
      ...strip(q),
      objectives: q.objectives.filter((o) => matches(o.when, k)).map(strip),
      transitions: q.transitions.filter((t) => matches(t.when, k) && ids.has(t.to)).map(strip),
    })),
  };
}

// checks — перевірки, що мають сенс у межах однієї комбінації (досяжність, тупики, гарантії).
// Однакова проблема в багатьох комбінаціях звітує один раз, із кількістю і прикладом.
export function checkCombos(content, { buildIndex, checks, today }) {
  const all = enumerateCombos(content);
  const found = new Map();
  const add = (i, k) => {
    const key = `${i.code}\u0001${i.where}\u0001${i.msg}`;
    if (!found.has(key)) found.set(key, { ...i, combos: [] });
    found.get(key).combos.push(comboLabel(k));
  };
  const reachedSomewhere = new Set();
  for (const k of all) {
    const view0 = project(content, k);
    if (!view0.quests.some((q) => q.id === content.meta.start)) {
      add(I('COMBO_NO_START', 'meta.start', `стартовий етап «${content.meta.start}» виключено умовою when`), k);
      continue;
    }
    const { reachable } = buildIndex(view0);
    reachable.forEach((q) => reachedSomewhere.add(q));
    for (const q of content.quests) {
      if (q.when && matches(q.when, k) && !reachable.has(q.id)) add(I('COMBO_TARGETED_UNREACHABLE', q.id, 'квест адресований цій комбінації умовою when, але в ній недосяжний'), k);
    }
    const view = project(content, k, reachable);
    const ctx = { content: view, today, ix: buildIndex(view) };
    for (const chk of checks) for (const i of chk.run(ctx)) add(i, k);
  }
  const out = [...found.values()].map(({ combos, ...i }) => ({
    ...i, msg: `${i.msg} · комбінацій ${combos.length} з ${all.length}, напр. ${combos[0]}`,
  }));
  for (const q of content.quests) {
    if (!reachedSomewhere.has(q.id)) out.push(I('COMBO_DEAD_CONTENT', q.id, `недосяжний у жодній із ${all.length} комбінацій`));
  }
  return out;
}
