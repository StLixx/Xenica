import type { Meta, StoryObj } from '@storybook/react-vite';

import { EmbedCard } from './EmbedCard';
import { ASIDE_URL } from './embed';

const meta: Meta<typeof EmbedCard> = { title: '草图/真实内容卡片', component: EmbedCard };
export default meta;

export const 共享侧栏: StoryObj<typeof EmbedCard> = {
  render: () => (
    <div className="h-96 w-full">
      <EmbedCard
        id="story-aside"
        active
        source={{
          schema: 1,
          kind: 'react',
          title: '共享侧栏',
          url: ASIDE_URL,
          component: 'PeekAside',
          source: 'web/src/ui/PeekAside.tsx',
          revision: '试样',
        }}
        exit={() => {}}
      />
    </div>
  ),
};

export const 无法加载: StoryObj<typeof EmbedCard> = {
  render: () => (
    <div className="h-96 w-full">
      <EmbedCard id="invalid" source={null} active={false} exit={() => {}} />
    </div>
  ),
};
