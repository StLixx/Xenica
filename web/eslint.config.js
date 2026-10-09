import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * 类名只能用设计变量的刻度（src/ui/theme.css）。禁止：
 * - 任意值 `text-[12px]`、`w-[232px]`、`shadow-[...]`（变量写成 `w-(--x-sidebar)`；`data-[...]`、`aria-[...]` 这类选择器可以）
 * - Tailwind 默认刻度里我们没有的名字：`text-sm`、`rounded-xl`、`shadow-lg`、`duration-200`……
 */
const ARBITRARY = /(?<!\b(?:data|aria|group|peer|has|not|supports|in|nth))-\[[^\]]*\]/;
const OFF_SCALE =
  /(?:^|[\s:'"`])(?:text-(?:xs|sm|base|lg|[2-9]?xl)|rounded(?:-(?:xs|xl|[2-9]xl|none))?|shadow(?:-(?:2xs|xs|sm|md|lg|xl|2xl|inner))?|duration-\d+|font-(?:thin|extralight|light|extrabold|black))(?=$|[\s'"`])/;
const designTokens = {
  rules: {
    'class-names': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const check = (node, text) => {
          const a = ARBITRARY.exec(text);
          if (a) {
            context.report({
              node,
              message: `不要写任意值「${a[0].slice(1)}」：用 src/ui/theme.css 里的刻度，或者先在那里加一个变量。`,
            });
            return;
          }
          const o = OFF_SCALE.exec(text);
          if (o)
            context.report({
              node,
              message: `「${o[0].trim().replace(/^[:'"`]/, '')}」不在设计刻度里（字号用 text-meta/label/ui/body/strong/heading/display，圆角 rounded-sm/md/lg/full，阴影 shadow-raise/pop/drag/focus，时长 duration-fast/base/slow）。`,
            });
        };
        return {
          Literal(node) {
            if (typeof node.value === 'string') check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.raw);
          },
        };
      },
    },
  },
};

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
    files: ['src/**/*.{ts,tsx}'],
    plugins: { design: designTokens },
    rules: { 'design/class-names': 'error' },
  },
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
