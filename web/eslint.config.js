import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'storybook-static',
      'test-results',
      'playwright-report',
      'src/api/schema.d.ts',
      'screenshots/__baseline__',
      'screenshots/__results__',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  reactHooks.configs.flat.recommended,
  { files: ['*.cjs'], languageOptions: { globals: globals.node, sourceType: 'commonjs' } },
  { files: ['screenshots/*.mjs'], languageOptions: { globals: globals.node } },
  {
    languageOptions: { globals: globals.browser },
    rules: {
      // 颜色和尺寸只能来自设计变量（src/ui/theme.css），不要在组件里写十六进制颜色。
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: '不要写死颜色，用 src/ui/theme.css 里的设计变量。',
        },
      ],
    },
  },
);
