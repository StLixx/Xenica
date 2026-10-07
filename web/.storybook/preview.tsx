import type { Preview } from '@storybook/react-vite';

import '../src/ui/theme.css';

/** 工具栏：强调色、密度。只是给 <html> 换 data-accent / data-density，变量定义在 theme.css。 */
const preview: Preview = {
  globalTypes: {
    accent: {
      description: '强调色',
      toolbar: {
        title: '强调色',
        icon: 'paintbrush',
        dynamicTitle: true,
        items: [
          { value: 'teal', title: '青（默认）' },
          { value: 'blue', title: '蓝' },
          { value: 'violet', title: '紫' },
          { value: 'amber', title: '琥珀' },
        ],
      },
    },
    density: {
      description: '密度',
      toolbar: {
        title: '密度',
        icon: 'component',
        dynamicTitle: true,
        items: [
          { value: 'compact', title: '紧凑（默认）' },
          { value: 'comfortable', title: '宽松' },
        ],
      },
    },
  },
  initialGlobals: { accent: 'teal', density: 'compact' },
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
  },
  decorators: [
    (Story, { globals }) => {
      const html = document.documentElement;
      if (globals.accent && globals.accent !== 'teal') html.dataset.accent = globals.accent;
      else delete html.dataset.accent;
      if (globals.density === 'comfortable') html.dataset.density = 'comfortable';
      else delete html.dataset.density;
      return (
        <div style={{ padding: 24, minWidth: 320 }}>
          <Story />
        </div>
      );
    },
  ],
};
export default preview;
