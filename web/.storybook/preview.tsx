import type { Preview } from '@storybook/react-vite';

import '../src/ui/theme.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { disable: true },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 24, minWidth: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default preview;
