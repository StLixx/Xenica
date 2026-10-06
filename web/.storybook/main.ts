import type { StorybookConfig } from '@storybook/react-vite';

/** 组件演示页。每个前端片段都在这里有自己的 story，作为可交互的说明。 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
