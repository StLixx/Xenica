/**
 * X7 输出生成模块自测
 * Playwright headless 截图验证
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const SCREENSHOT_DIR = 'C:/dev/Commader/.reports/pm-a/screenshots'

async function main() {
  const browser = await chromium.launch({ headless: true })

  // ─── 桌面端测试 ───
  console.log('=== 桌面端测试 ===')
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await desktopPage.goto(BASE, { waitUntil: 'networkidle' })
  await desktopPage.waitForTimeout(2000)
  await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/x7-01-desktop-home.png` })
  console.log('✓ 桌面端首页截图')

  // 检查对话面板中的草稿模式按钮
  const draftBtn = await desktopPage.locator('button[title="写草稿"]')
  const draftBtnVisible = await draftBtn.isVisible().catch(() => false)
  console.log(`✓ 草稿模式按钮: ${draftBtnVisible ? '可见' : '不可见'}`)

  if (draftBtnVisible) {
    await draftBtn.click()
    await desktopPage.waitForTimeout(500)
    await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/x7-02-draft-mode.png` })
    console.log('✓ 草稿模式已激活截图')

    // 检查 textarea 的 rows 属性（草稿模式下应为 6）
    const rows = await desktopPage.locator('textarea').getAttribute('rows')
    console.log(`✓ textarea rows: ${rows} (期望 6)`)

    // 点击退出草稿模式
    await draftBtn.click()
    await desktopPage.waitForTimeout(300)
  }

  // ─── 手机端测试 ───
  console.log('\n=== 手机端测试 ===')
  const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await mobilePage.goto(BASE, { waitUntil: 'networkidle' })
  await mobilePage.waitForTimeout(2000)
  await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/x7-03-mobile-home.png` })
  console.log('✓ 手机端首页截图')

  // 检查草稿按钮在手机端的可见性
  const mobileDraftBtn = await mobilePage.locator('button[title="写草稿"]')
  const mobileDraftVisible = await mobileDraftBtn.isVisible().catch(() => false)
  console.log(`✓ 手机端草稿按钮: ${mobileDraftVisible ? '可见' : '不可见'}`)

  if (mobileDraftVisible) {
    await mobileDraftBtn.click()
    await mobilePage.waitForTimeout(500)
    await mobilePage.screenshot({ path: `${SCREENSHOT_DIR}/x7-04-mobile-draft.png` })
    console.log('✓ 手机端草稿模式截图')
  }

  // ─── 图谱页面测试 ───
  console.log('\n=== 图谱页面测试 ===')
  // 桌面端图谱（默认就是图谱页面）
  await desktopPage.screenshot({ path: `${SCREENSHOT_DIR}/x7-05-graph-desktop.png` })
  console.log('✓ 桌面端图谱截图')

  // ─── API 测试 ───
  console.log('\n=== API 测试 ===')

  // 测试 generate/from-nodes 端点
  try {
    const moments = await fetch('http://localhost:3002/api/moments?limit=2')
      .then(r => r.json())
    const ids = moments.data?.map(m => m.id?.id?.String).filter(Boolean)
    console.log(`✓ 找到 ${ids?.length || 0} 个 moment ID`)

    if (ids && ids.length >= 2) {
      const genRes = await fetch('http://localhost:3002/api/generate/from-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_ids: ids, format: 'summary' }),
      }).then(r => r.json())

      console.log(`✓ 生成 API: success=${genRes.success}`)
      if (genRes.data) {
        console.log(`  标题: ${genRes.data.title?.substring(0, 30)}...`)
        console.log(`  内容长度: ${genRes.data.content?.length} 字符`)
        console.log(`  来源节点: ${genRes.data.source_nodes?.length} 个`)
      }
    }
  } catch (e) {
    console.log(`✗ API 测试失败: ${e.message}`)
  }

  // 测试 chat 生成意图检测
  try {
    const chatRes = await fetch('http://localhost:3002/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '帮我总结一下', model: 'claude-sonnet' }),
    }).then(r => r.json())

    console.log(`✓ 对话生成意图: success=${chatRes.success}`)
    if (chatRes.data) {
      const hasArticle = !!chatRes.data.generated_article
      console.log(`  generated_article 字段: ${hasArticle ? '存在' : '不存在'}`)
      if (hasArticle) {
        console.log(`  文章标题: ${chatRes.data.generated_article.title?.substring(0, 30)}...`)
      }
    }
  } catch (e) {
    console.log(`✗ Chat 生成测试失败: ${e.message}`)
  }

  await browser.close()
  console.log('\n=== 自测完成 ===')
}

main().catch(console.error)
