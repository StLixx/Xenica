// X5C 视频导入 UI 自测（Playwright headless）
import { chromium } from 'playwright';

const SCREENSHOTS_DIR = 'C:/dev/Commader/.reports/pm-a/screenshots';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('1. 打开前端页面...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-01-initial.png` });
  console.log('   ✓ 页面加载成功');

  // 2. 桌面端 - 找到附件按钮（Paperclip）
  console.log('2. 测试附件菜单...');
  const attachBtn = page.locator('button[title="附件"]');
  if (await attachBtn.count() === 0) {
    console.error('   ✗ 找不到附件按钮');
    await browser.close();
    return;
  }
  console.log('   ✓ 附件按钮存在');

  // 3. 点击打开附件菜单
  await attachBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-02-attach-menu.png` });

  // 检查菜单里有两个选项
  const menuOptions = page.locator('text=上传图片识别, text=粘贴视频链接');
  const uploadBtn = page.locator('button:has-text("上传图片识别")');
  const videoBtn = page.locator('button:has-text("粘贴视频链接")');

  if (await uploadBtn.count() > 0 && await videoBtn.count() > 0) {
    console.log('   ✓ 附件菜单包含两个选项：上传图片识别、粘贴视频链接');
  } else {
    console.error('   ✗ 附件菜单选项不完整');
  }

  // 4. 点击"粘贴视频链接"
  console.log('3. 测试视频链接弹窗...');
  await videoBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-03-video-popup.png` });

  const videoInput = page.locator('input[type="url"]');
  if (await videoInput.count() > 0) {
    console.log('   ✓ 视频链接输入框已弹出');
  } else {
    console.error('   ✗ 找不到视频链接输入框');
  }

  // 5. 输入无效 URL 并测试校验
  console.log('4. 测试 URL 校验...');
  await videoInput.fill('https://example.com/not-a-video');
  const submitBtn = page.locator('button:has-text("提取")');
  await submitBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-04-invalid-url.png` });

  const errorText = page.locator('text=请输入 B站、YouTube 或抖音的视频链接');
  if (await errorText.count() > 0) {
    console.log('   ✓ 无效 URL 校验提示正确');
  } else {
    console.error('   ✗ 未显示无效 URL 提示');
  }

  // 6. 输入有效 URL 格式
  console.log('5. 测试有效 URL 输入...');
  await videoInput.fill('https://www.bilibili.com/video/BV1234567890');
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-05-valid-url.png` });
  console.log('   ✓ 有效 URL 格式可输入');

  // 7. 关闭弹窗
  const closeBtn = page.locator('button:has(svg.lucide-x)').first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(300);
    console.log('   ✓ 弹窗可关闭');
  }

  // 8. 手机端测试
  console.log('6. 手机端测试（375x812）...');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-06-mobile-initial.png` });

  // 手机端可能需要先切到对话 Tab
  const chatTab = page.locator('text=对话').first();
  if (await chatTab.count() > 0) {
    await chatTab.click();
    await page.waitForTimeout(300);
  }

  const mobileAttachBtn = page.locator('button[title="附件"]');
  if (await mobileAttachBtn.count() > 0) {
    await mobileAttachBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-07-mobile-attach-menu.png` });

    const mobileVideoBtn = page.locator('button:has-text("粘贴视频链接")');
    if (await mobileVideoBtn.count() > 0) {
      await mobileVideoBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/x5c-08-mobile-video-popup.png` });
      console.log('   ✓ 手机端视频链接弹窗正常');
    }
  } else {
    console.log('   - 手机端附件按钮未找到（可能在其他 Tab）');
  }

  await browser.close();
  console.log('\n═══ X5C 视频导入 UI 测试完成 ═══');
}

test().catch(console.error);
