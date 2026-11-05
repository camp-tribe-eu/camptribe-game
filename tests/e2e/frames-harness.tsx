// GAME-259 · стенд для game-259.spec.ts: справжній DialogueBox із справжнім CSS гри, без проходу світом (рамку відкриває сам тест).
import { render } from 'preact';
import { DialogueBox } from '../../src/ui/DialogueBox';
import { t } from '../../src/i18n';
import type { Key } from '../../src/i18n';

interface Spec { speakerId: string | null; speakerKey: string | null; key: string; answers: { id: string; kind: 'continue' | 'choose'; key: string | null }[] }
(window as unknown as { __mount: (s: Spec) => void }).__mount = (s) => {
  let host = document.getElementById('harness');
  if (!host) { host = document.createElement('div'); host.id = 'harness'; host.style.cssText = 'position:fixed;inset:0;z-index:99;background:#4a7a4a;--edge-left:0px;--edge-right:0px;--edge-bottom:0px;--edge-top:0px'; document.body.append(host); }
  render(null, host);
  render(<DialogueBox dialogue={{ speakerKey: s.speakerKey, speakerId: s.speakerId, key: s.key, answers: s.answers } as never} lang="uk" t={(k: Key) => t('uk', k)} act={() => undefined}
    portrait={(id) => (id === null ? null : { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', kind: 'file' })} />, host);
};
