import type { Meta, StoryObj } from '@storybook/react-vite';

import { Markdown } from './Markdown';

const meta = {
  title: '底座/正文',
  component: Markdown,
  decorators: [(Story) => <div style={{ maxWidth: 640, padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Markdown>;
export default meta;

type Story = StoryObj<typeof meta>;

/** 公式后面跟标记：公式靠左，标记同一行。 */
export const Formula: Story = {
  args: {
    md: '$$\\int \\frac{dx}{a^2+x^2} = \\frac{1}{a}\\arctan\\frac{x}{a} + C$$ #考前背 #积分公式',
  },
};

export const Text: Story = {
  args: {
    md: '## 常见极限处理\n**等价无穷小替换**：$x\\to 0$ 时 $\\sin x \\sim x$。只能在乘除里换，加减里不能直接换。 #必备 见 [[积分公式表]]\n- 触发特征：$0/0$ 型\n- 不适用：加减项',
  },
};
