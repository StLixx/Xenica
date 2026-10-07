import type { Meta, StoryObj } from '@storybook/react-vite';

import { SignIn } from './SignIn';

const meta = {
  title: '外壳/登录',
  component: SignIn,
  args: { mode: 'login', onSubmit: () => {} },
  decorators: [(Story) => <div style={{ height: 480 }}>{Story()}</div>],
} satisfies Meta<typeof SignIn>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Login: Story = {};
export const Demo: Story = { args: { demo: true } };
export const Setup: Story = { args: { mode: 'setup' } };
export const Failed: Story = { args: { error: '用户名或密码不对' } };
