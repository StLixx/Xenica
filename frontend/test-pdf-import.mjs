import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = 'C:\\dev\\Commader\\.reports\\pm-a\\screenshots';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  console.log('1. 打开 Xenica 前端...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(REPORT_DIR, 'x5e-01-home.png') });
  console.log('   截图: x5e-01-home.png');

  // 打开设置面板
  console.log('2. 打开设置面板...');
  const settingsBtn = await page.$('[title="设置"], button:has-text("设置")');
  if (settingsBtn) {
    await settingsBtn.click();
    await page.waitForTimeout(500);
    console.log('   设置面板已打开');
  } else {
    // 尝试找齿轮图标
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      if ((ariaLabel && ariaLabel.includes('设置')) || (title && title.includes('设置'))) {
        await btn.click();
        await page.waitForTimeout(500);
        console.log('   通过 aria-label/title 找到设置按钮');
        break;
      }
    }
  }
  await page.screenshot({ path: path.join(REPORT_DIR, 'x5e-02-settings.png') });

  // 点击导入按钮
  console.log('3. 点击导入按钮...');
  const importBtn = await page.$('button:has-text("导入文件"), button:has-text("导入 Markdown")');
  if (importBtn) {
    await importBtn.click();
    await page.waitForTimeout(500);
    console.log('   导入面板已打开');
  } else {
    console.log('   未找到导入按钮，尝试其他方式...');
    const btns = await page.$$('.settings-export');
    for (const btn of btns) {
      const text = await btn.textContent();
      if (text && (text.includes('导入') || text.includes('PDF'))) {
        await btn.click();
        await page.waitForTimeout(500);
        console.log(`   点击: ${text.trim()}`);
        break;
      }
    }
  }
  await page.screenshot({ path: path.join(REPORT_DIR, 'x5e-03-import-panel.png') });

  // 检查导入面板内容
  const bodyText = await page.textContent('body');
  console.log('4. 导入面板检查:');
  console.log(`   标题 "导入文件": ${bodyText.includes('导入文件') ? '✓' : '✗'}`);
  console.log(`   ".pdf" 提示: ${bodyText.includes('.pdf') ? '✓' : '✗'}`);

  // 找到正确的文件选择器（accept 包含 .pdf 的那个）
  const fileInputs = await page.$$('input[type="file"]');
  let targetInput = null;
  for (const input of fileInputs) {
    const accept = await input.getAttribute('accept');
    if (accept && accept.includes('.pdf')) {
      targetInput = input;
      console.log(`   文件选择器 accept: ${accept} ✓`);
      break;
    }
  }

  if (!targetInput) {
    console.log('   未找到接受 PDF 的文件输入框');
    // 最后一个 file input 作为 fallback
    if (fileInputs.length > 0) {
      targetInput = fileInputs[fileInputs.length - 1];
      const accept = await targetInput.getAttribute('accept');
      console.log(`   Fallback 文件选择器 accept: ${accept}`);
    }
  }

  if (targetInput) {
    // 上传测试 PDF 文件
    const testPdfPath = path.join(__dirname, 'test.pdf');
    console.log('5. 上传测试 PDF 文件...');
    await targetInput.setInputFiles(testPdfPath);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(REPORT_DIR, 'x5e-04-pdf-uploaded.png') });
    console.log('   截图: x5e-04-pdf-uploaded.png');

    // 检查 PDF 模式选择
    const panelText = await page.textContent('body');
    const hasTextMode = panelText.includes('文字模式');
    const hasVisionMode = panelText.includes('图片模式');
    const hasHint = panelText.includes('适用于电子书') || panelText.includes('适用于手写');
    console.log('6. PDF 模式选择检查:');
    console.log(`   文字模式: ${hasTextMode ? '✓' : '✗'}`);
    console.log(`   图片模式: ${hasVisionMode ? '✓' : '✗'}`);
    console.log(`   模式提示: ${hasHint ? '✓' : '✗'}`);

    // 切换到图片模式
    const visionBtn = await page.$('button:has-text("图片模式")');
    if (visionBtn) {
      await visionBtn.click();
      await page.waitForTimeout(500);
      const updatedText = await page.textContent('body');
      console.log(`   切换后提示: ${updatedText.includes('适用于手写') ? '✓ 图片模式提示' : '✗'}`);
      await page.screenshot({ path: path.join(REPORT_DIR, 'x5e-05-vision-mode.png') });
    }
  }

  // 手机端测试
  console.log('7. 手机端测试...');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(REPORT_DIR, 'x5e-06-mobile.png') });
  console.log('   截图: x5e-06-mobile.png');

  // 测试后端 API
  console.log('8. 后端端点测试...');

  // 8a. 无文件请求 — 应返回 400
  const noFileResp = await page.evaluate(async () => {
    const res = await fetch('/api/import/pdf', { method: 'POST', body: new FormData() });
    return { status: res.status, body: await res.json() };
  });
  console.log(`   无文件: ${noFileResp.status === 400 ? '✓' : '✗'} (${noFileResp.status})`);

  // 8b. 带 PDF 文件的请求 — 用文字模式实际导入
  console.log('9. 实际 PDF 导入测试（文字模式）...');
  const testPdfPath = path.join(__dirname, 'test.pdf');
  const pdfBuffer = await import('fs').then(fs => fs.readFileSync(testPdfPath));
  
  const importResult = await page.evaluate(async (pdfBytes) => {
    const arr = new Uint8Array(pdfBytes);
    const blob = new Blob([arr], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', blob, 'test.pdf');
    formData.append('mode', 'text');

    const res = await fetch('/api/import/pdf', { method: 'POST', body: formData });
    return { status: res.status, body: await res.json() };
  }, Array.from(pdfBuffer));

  console.log(`   状态码: ${importResult.status}`);
  console.log(`   响应: ${JSON.stringify(importResult.body)}`);
  if (importResult.body.success) {
    const d = importResult.body.data;
    console.log(`   ✓ 导入成功: ${d.pages_processed} 段, ${d.moments_created} 认知瞬间, ${d.entities_extracted} 实体`);
  } else {
    console.log(`   ✗ 导入失败: ${importResult.body.error}`);
  }

  console.log('\n=== 测试完成 ===');
  await browser.close();
}

run().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
