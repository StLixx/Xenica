/**
 * X5D Markdown 导入 - Playwright headless 测试
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('..', '.reports', 'pm-a', 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `x5d-${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  📸 ${filepath}`);
}

async function main() {
  console.log('🚀 X5D Markdown 导入 Playwright headless 测试\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // 1. 打开首页
  console.log('1. 打开 Xenica 首页...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await screenshot(page, '01-home');

  // 2. 打开设置面板（title="设置" 的按钮）
  console.log('2. 打开设置面板...');
  const settingsBtn = page.locator('button[title="设置"]');
  if (await settingsBtn.isVisible()) {
    await settingsBtn.click();
    await page.waitForTimeout(500);
    console.log('  ✅ 设置面板已打开');
  } else {
    console.log('  ❌ 找不到设置按钮');
  }
  await screenshot(page, '02-settings');

  // 3. 点击"导入 Markdown 文件"
  console.log('3. 点击导入 Markdown 按钮...');
  const importBtn = page.locator('button').filter({ hasText: '导入 Markdown 文件' });
  if (await importBtn.isVisible()) {
    await importBtn.click();
    await page.waitForTimeout(500);
    console.log('  ✅ 导入面板已打开');
  } else {
    console.log('  ❌ 找不到导入按钮');
  }
  await screenshot(page, '03-import-panel');

  // 4. 检查导入面板元素
  console.log('4. 检查导入面板元素...');

  const dropzone = page.locator('.md-import-dropzone');
  const sourceButtons = page.locator('.md-import-source-btn');
  const panelTitle = page.locator('.settings-title').filter({ hasText: '导入 Markdown' });

  const hasTitle = await panelTitle.isVisible().catch(() => false);
  const hasDropzone = await dropzone.isVisible().catch(() => false);
  const sourceCount = await sourceButtons.count().catch(() => 0);

  console.log(`  标题「导入 Markdown」: ${hasTitle ? '✅' : '❌'}`);
  console.log(`  拖拽上传区: ${hasDropzone ? '✅' : '❌'}`);
  console.log(`  来源选择按钮: ${sourceCount} 个`);

  // 5. 切换来源
  if (sourceCount > 0) {
    console.log('5. 测试来源切换...');
    for (const name of ['Cursor', 'Notion', '其他', 'Obsidian']) {
      const btn = page.locator('.md-import-source-btn').filter({ hasText: name });
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(200);
        const isActive = await btn.evaluate(el => el.classList.contains('active'));
        console.log(`  ${name}: ${isActive ? '✅ active' : '❌ not active'}`);
      }
    }
  }
  await screenshot(page, '04-source-toggle');

  // 6. 手机端测试
  console.log('6. 手机端 (375x812)...');
  // 先关闭面板
  const closeBtn = page.locator('.settings-close').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await screenshot(page, '05-mobile-home');

  // 在手机端打开设置
  const mobileSettingsBtn = page.locator('button[title="设置"]');
  if (await mobileSettingsBtn.isVisible()) {
    await mobileSettingsBtn.click();
    await page.waitForTimeout(500);
    await screenshot(page, '06-mobile-settings');

    // 点击导入按钮
    const mobileImportBtn = page.locator('button').filter({ hasText: '导入 Markdown 文件' });
    if (await mobileImportBtn.isVisible()) {
      await mobileImportBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, '07-mobile-import');
      console.log('  ✅ 手机端导入面板正常');
    }
  }

  // 恢复桌面
  await page.setViewportSize({ width: 1280, height: 800 });

  console.log('\n✅ 所有测试完成！');
  await browser.close();
}

main().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
