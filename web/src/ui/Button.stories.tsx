import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './Button';

const meta = {
  title: '底座/Button',
  component: Button,
  args: { children: '新建节点' },
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Primary: Story = { args: { variant: 'primary', children: '接受' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Danger: Story = { args: { variant: 'danger', children: '删除' } };
export const Disabled: Story = { args: { disabled: true } };
