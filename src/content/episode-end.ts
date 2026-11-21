// GAME-352 · кінець епізоду «Вихідні біля озера»: прихід додому (два дотики) і кінцева картка, що замінила «Підсумок дня».
// Тут лише дані й збірка рядків; показ — src/ui/SampleDay.tsx. Нічого не рахує за часом. Кожна ланка ланцюга дня — свій рядок підсумку:
//   дорога туди (приїзд) → ділянка → місії → слід ночі → чистота табору (ранок) → дорога додому → гаманець.
// Рядок ночі показується, лише коли ніч щойно зіграно в цій сесії (факти ночі в сейві не лежать); решта береться зі сейву.
import type { Key } from '../i18n';
import { arrivalOf } from './arrival-pitch';
import { strikeResult, type StrikeSave } from './camp-strike';
import { roughCount, type NightFacts } from './camp-night';
import { missionsDone } from './sample-day';
import { ROAD_HOME_OUTCOMES } from './road-home';

/** Репліки приходу додому: ключі i18n по порядку. Тварини тут нема навмисно: герой зразка їде без тварини (SAMPLE_*), вигадувати кота не можна. */
export function homeBeats(road: string | null): readonly Key[] {
  return ['sd.home.beat1', road === 'scrappy' ? 'sd.home.beat2.late' : 'sd.home.beat2'];
}

export interface RecapLine { readonly id: 'arrival' | 'pitch' | 'missions' | 'night' | 'clean' | 'road' | 'wallet'; readonly text: string; readonly outcome?: string; readonly why?: string }
export interface RecapInput {
  readonly flags: readonly string[];
  /** Назва обраної ділянки (null — не обирали): рядок «Ділянка» тоді «-». Розв'язує виклик (i18n контенту живе в UI-шарі). */
  readonly pitchName: string | null;
  readonly night: NightFacts | null;
  readonly strike: StrikeSave | undefined;
  readonly road: string | null;
  /** Уже відформатований гаманець («Гаманець: €…»). */
  readonly walletText: string;
}

export function recapLines(i: RecapInput, t: (k: Key) => string): readonly RecapLine[] {
  const out: RecapLine[] = [
    { id: 'arrival', text: `${t('sd.sum.arrival')}: ${t(`sd.arrival.${arrivalOf(i.flags)}` as Key)}` },
    { id: 'pitch', text: `${t('sd.sum.pitch')}: ${i.pitchName ?? '-'}` },
    { id: 'missions', text: `${t('sd.sum.missions')}: ${missionsDone(i.flags)}` },
  ];
  if (i.night) out.push({ id: 'night', text: `${t('sd.sum.rough')}: ${roughCount(i.night)}` });
  const clean = i.strike?.closed === true ? strikeResult(i.strike.results) : null;
  if (clean) out.push({ id: 'clean', outcome: clean.outcome, text: `${t('strike.result')}: ${t(`strike.res.${clean.outcome}` as Key)}`, ...(clean.whyKey !== null ? { why: `${t('strike.why')}: ${t(clean.whyKey as Key)}` } : {}) });
  if (i.road !== null && ROAD_HOME_OUTCOMES.some((o) => o === i.road)) out.push({ id: 'road', outcome: i.road, text: `${t('road.home.result')}: ${t(`road.home.res.${i.road}` as Key)}` });
  out.push({ id: 'wallet', text: i.walletText });
  return out;
}
