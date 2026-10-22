// Лінтер гри. Скрипти валідатора (scripts/*.mjs) мають свої самотести й мутації — тут їх не дублюємо.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Експортуються для самотесту: число зламаних прикладів = число заборон.
// globalThis/self заборонені цілком — інакше globalThis.document обходить заборону імені (рецензія PR #13).
// performance, таймери, crypto, Intl — теж джерела реального часу чи випадковості (CR-034).
export const CORE_BANNED_GLOBALS = [
  'window', 'document', 'localStorage', 'Date',
  'globalThis', 'self', 'sessionStorage', 'navigator', 'performance', 'crypto', 'Intl', 'process',
  'setTimeout', 'setInterval', 'requestAnimationFrame',
];
// Межі шару — від кореня src/: власна підтека ядра ./ui не червоніє (закон 5, ціна хибного спрацювання).
export const CORE_BANNED_IMPORT_REGEX = [
  '^(phaser|preact)(/|$)',
  '^(\\./)?(\\.\\./+)+(view|ui|platform)(/|$)',
  '(^|/)src/(view|ui|platform)(/|$)',
  '^@/(view|ui|platform)(/|$)',
];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'scripts/', 'art/', '.claude/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
  // GAME-11 · сторож меж ядра (TD-001, CR-034): src/core — чиста детермінована симуляція, що біжить у Node.
  // Час і випадковість приходять ззовні (ігровий годинник, RNG із зерном). Самотест: src/guards/core-boundary.test.ts.
  {
    files: ['src/core/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...CORE_BANNED_GLOBALS.map((name) => ({ name, message: 'ядро не знає про браузер і реальний час (TD-001)' }))],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'лише RNG із зерном (CR-034)' }],
      'no-restricted-imports': ['error', { patterns: CORE_BANNED_IMPORT_REGEX.map((regex) => ({ regex, caseSensitive: false, message: 'ядро не імпортує рушій, UI чи платформу (TD-001)' })) }],
      'no-restricted-syntax': ['error',
        { selector: 'ImportExpression', message: 'динамічний import() у ядрі заборонено: обходить межу шару (TD-001)' },
        { selector: "Identifier[name='Math']:not(MemberExpression > Identifier.object)", message: 'Math лише як Math.x: псевдонім обходить заборону Math.random (CR-034)' },
      ],
    },
  },
);
