import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

/** 设计变量总览：theme.css 里每一类刻度排一遍。改了变量先看这里。 */
const meta = { title: '底座/设计变量', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-label text-fg-3">{title}</h2>
      {children}
    </section>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <div className="flex w-180 flex-col gap-8 bg-bg p-8">{children}</div>;
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="font-mono text-meta whitespace-nowrap text-fg-3">{children}</code>
);

export const Colors: Story = {
  name: '颜色',
  render: () => (
    <Page>
      <Section title="表面（越往上越亮）">
        <div className="flex gap-3">
          {(
            [
              ['bg-bg', '背景'],
              ['bg-side', '侧栏'],
              ['bg-raised', '浮起的面板'],
              ['bg-pop', '弹层'],
            ] as const
          ).map(([c, label]) => (
            <div key={c} className="flex flex-1 flex-col gap-1.5">
              <div className={`h-16 rounded-md shadow-raise ${c}`} />
              <span className="text-ui text-fg-2">{label}</span>
              <Code>{c}</Code>
            </div>
          ))}
        </div>
      </Section>
      <Section title="文字">
        <div className="flex flex-col gap-1 rounded-md bg-raised p-4">
          <span className="text-body text-fg">主要 text-fg：标题、正文</span>
          <span className="text-body text-fg-2">次要 text-fg-2：说明、未选中的项</span>
          <span className="text-body text-fg-3">提示 text-fg-3：时间、占位符</span>
        </div>
      </Section>
      <Section title="强调与状态">
        <div className="flex gap-3">
          {(
            [
              ['bg-accent', '强调'],
              ['bg-accent-soft', '强调（淡）/ 选中'],
              ['bg-hover', '悬停'],
              ['bg-press', '按下'],
              ['bg-danger', '危险'],
            ] as const
          ).map(([c, label]) => (
            <div key={c} className="flex flex-1 flex-col gap-1.5">
              <div className={`h-10 rounded-sm ${c}`} />
              <span className="text-ui text-fg-2">{label}</span>
              <Code>{c}</Code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

const ROLES = [
  ['text-display', '28 / 700', '文档标题'],
  ['text-heading', '18 / 600', '对话框、卡片标题'],
  ['text-strong', '15 / 600', '强调的一行'],
  ['text-body', '14 / 400', '列表、输入框、正文（随密度变）'],
  ['text-ui', '13 / 400', '按钮、次要信息'],
  ['text-label', '12 / 600', '分组标题'],
  ['text-meta', '12 / 400', '时间、快捷键、计数'],
] as const;

export const Type: Story = {
  name: '文字',
  render: () => (
    <Page>
      <Section title="字号（按用途命名，自带字重和行高）">
        <div className="flex flex-col gap-3">
          {ROLES.map(([cls, spec, use]) => (
            <div key={cls} className="flex items-baseline gap-4">
              <span className={`w-80 flex-none truncate text-fg ${cls}`}>秦统一六国 Xenica</span>
              <Code>{cls}</Code>
              <span className="text-meta text-fg-3">
                {spec} · {use}
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="强调 = 尺寸、字重、颜色一起往上走一级">
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1 rounded-md bg-raised p-4">
            <span className="text-meta text-fg-3">普通</span>
            <span className="text-body text-fg-2">郡县制</span>
            <span className="text-ui text-fg-3">3 条关系 · 昨天</span>
          </div>
          <div className="flex flex-1 flex-col gap-1 rounded-md bg-raised p-4">
            <span className="text-meta text-fg-3">强调</span>
            <span className="text-strong text-fg">郡县制</span>
            <span className="text-ui text-fg-2">3 条关系 · 昨天</span>
          </div>
          <div className="flex flex-1 flex-col gap-1 rounded-md bg-raised p-4">
            <span className="text-meta text-fg-3">只换颜色（不要这样）</span>
            <span className="text-body text-accent">郡县制</span>
            <span className="text-ui text-fg-3">3 条关系 · 昨天</span>
          </div>
        </div>
      </Section>
    </Page>
  ),
};

export const Shape: Story = {
  name: '圆角与阴影',
  render: () => (
    <Page>
      <Section title="圆角：同心嵌套，外层 = 内层 + 间距（6 → 10 → 14）">
        <div className="flex items-start gap-6">
          <div className="rounded-lg bg-raised p-1 shadow-raise">
            <div className="rounded-md bg-pop p-1">
              <div className="flex h-7 items-center rounded-sm bg-accent px-3 text-ui font-semibold text-on-accent">
                按钮
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Code>rounded-lg 14 · 面板、弹层、对话框</Code>
            <Code>rounded-md 10 · 卡片、图里的节点</Code>
            <Code>rounded-sm 6 · 按钮、输入框、列表项</Code>
            <Code>rounded-full · 圆点、头像</Code>
          </div>
        </div>
      </Section>
      <Section title="阴影">
        <div className="flex gap-6">
          {(
            [
              ['shadow-raise', '浮起的面板'],
              ['shadow-pop', '弹层'],
              ['shadow-drag', '拖拽中'],
              ['shadow-focus', '键盘焦点'],
            ] as const
          ).map(([c, label]) => (
            <div key={c} className="flex flex-col gap-2">
              <div className={`size-24 rounded-md bg-raised ${c}`} />
              <span className="text-ui text-fg-2">{label}</span>
              <Code>{c}</Code>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  ),
};

export const States: Story = {
  name: '交互状态',
  render: () => (
    <Page>
      <Section title="可交互的一行（类名 item）：侧栏、列表、命令面板、菜单都长这样">
        <div className="flex w-80 flex-col gap-0.5 rounded-lg bg-side p-1">
          <div className="item">普通</div>
          <div className="item bg-hover text-fg">悬停</div>
          <div className="item bg-press text-fg">按下</div>
          <div className="item" aria-selected="true">
            选中
          </div>
          <div className="item outline-2 outline-accent outline-offset-1">键盘焦点</div>
          <div className="item" data-dragging>
            拖拽中
          </div>
          <div className="item" aria-disabled="true">
            禁用
          </div>
        </div>
      </Section>
      <Section title="动效时长">
        <div className="flex gap-6">
          <Code>duration-fast 100ms · 悬停、按下</Code>
          <Code>duration-base 180ms · 展开、收起</Code>
          <Code>duration-slow 320ms · 布局变化</Code>
        </div>
      </Section>
    </Page>
  ),
};
