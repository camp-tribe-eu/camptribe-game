// Лінтер гри. Скрипти валідатора (scripts/*.mjs) мають свої самотести й мутації — тут їх не дублюємо.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Експортуються для самотесту: число зламаних прикладів = число заборон.
export const CORE_BANNED_GLOBALS = ['window', 'document', 'localStorage', 'Date'];
export const CORE_BANNED_IMPORTS = ['phaser', 'phaser/*', 'preact', 'preact/*', '**/view', '**/view/*', '**/ui', '**/ui/*', '**/platform', '**/platform/*'];

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'scripts/', 'art/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
  // GAME-11 · сторож меж ядра (TD-001, CR-034): src/core — чиста детермінована симуляція, що біжить у Node.
  // Час і випадковість приходять ззовні (ігровий годинник, RNG із зерном). Самотест: src/guards/core-boundary.test.ts.
  {
    files: ['src/core/**/*.ts'],
    ignores: ['src/core/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...CORE_BANNED_GLOBALS.map((name) => ({ name, message: 'ядро не знає про браузер і реальний час (TD-001)' }))],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'лише RNG із зерном (CR-034)' }],
      'no-restricted-imports': ['error', { patterns: [{ group: CORE_BANNED_IMPORTS, message: 'ядро не імпортує рушій, UI чи платформу (TD-001)' }] }],
    },
  },
);
