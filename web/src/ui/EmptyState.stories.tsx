import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: '底座/EmptyState',
  component: EmptyState,
  args: { title: '还没有节点', hint: '在上面输入标题，按回车新建。' },
  decorators: [(Story) => <div style={{ height: 240 }}>{Story()}</div>],
} satisfies Meta<typeof EmptyState>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Loading: Story = { args: { tone: 'loading', title: '加载中…', hint: undefined } };
export const Error: Story = {
  args: {
    tone: 'error',
    title: '后端不可用',
    hint: '检查服务是否在运行。',
    action: <Button>重试</Button>,
  },
};
