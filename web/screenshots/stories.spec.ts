import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

/** Storybook 构建产物里的 story 清单。先 `pnpm build-storybook`。 */
interface StoryIndex {
  entries: Record<string, { id: string; type: string; tags?: string[] }>;
}

const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8')) as StoryIndex;
const stories = Object.values(index.entries).filter(
  (e) => e.type === 'story' && !e.tags?.includes('no-screenshot'),
);

for (const story of stories) {
  test(story.id, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await page.locator('#storybook-root').waitFor();
    await page.waitForFunction(
      () =>
        (globalThis as unknown as { document: { fonts: { status: string } } }).document.fonts
          .status === 'loaded',
    );
    await expect(page).toHaveScreenshot(`${story.id}.png`, { fullPage: true });
  });
}
