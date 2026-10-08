import type { Meta, StoryObj } from '@storybook/react-vite';

import { KindBadge } from './KindBadge';
import { KINDS } from './kinds';

const meta = {
  title: '底座/KindBadge',
  component: KindBadge,
  args: { kind: 'knowledge' },
} satisfies Meta<typeof KindBadge>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Single: Story = {};
export const Large: Story = { args: { size: 'lg' } };
export const AllKinds: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {Object.entries(KINDS).map(([kind, { label }]) => (
        <div key={kind} className="flex items-center gap-2 text-fg-2">
          <KindBadge kind={kind} />
          {label}
          <span className="font-mono text-meta text-fg-3">{kind}</span>
        </div>
      ))}
    </div>
  ),
};
