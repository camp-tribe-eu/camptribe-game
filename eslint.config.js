// Лінтер гри. Скрипти валідатора (scripts/*.mjs) мають свої самотести й мутації — тут їх не дублюємо.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'scripts/', 'art/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
);
