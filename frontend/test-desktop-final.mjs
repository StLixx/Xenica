/**
 * X6M3 桌面端最终测试 — 修复所有已知问题
 */
import { chromium } from 'playwright'

const SCREENSHOTS = 'C:/dev/Commader/.reports/pm-a/screenshots'

const mockDueReviews = [
  {
    id: { tb: 'review_schedule', id: { String: 'test-r1' } },
    moment_id: { tb: 'moment', id: { String: 'test-m1' } },
    next_review: '2026-02-07T00:00:00Z', interval: 1.0, ease_factor: 2.5,
    review_count: 0, created_at: '2026-02-06T00:00:00Z',
    moment_text: '知识图谱连接想法',
  },
  {
    id: { tb: 'review_schedule', id: { String: 'test-r2' } },
    moment_id: { tb: 'moment', id: { String: 'test-m2' } },
    next_review: '2026-02-07T00:00:00Z', interval: 3.0, ease_factor: 2.5,
    review_count: 2, created_at: '2026-02-04T00:00:00Z',
    moment_text: '认知负荷管理',
  },
]

const mkMoment = (id, raw, refined, perspectives) => ({
  success: true,
  data: { id: { tb: 'moment', id: { String: id } }, raw_input: raw, refined, perspectives, timestamp: '2026-02-08T00:00:00Z', extracted: true, weight: 0 },
})

async function test() {
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      // 预设 localStorage 跳过 GoalSetup
      storageState: {
        cookies: [],
        origins: [{
          origin: 'http://localhost:5173',
          localStorage: [{ name: 'xenica-goal-setup-done', value: 'true' }],
        }],
      },
    })
    const page = await ctx.newPage()

    // Mock 所有需要的 API
    await page.route('**/api/reviews/due', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockDueReviews }),
    }))
    await page.route('**/api/goals/check-setup', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { setup_completed: true, goal_count: 3 } }),
    }))
    await page.route('**/api/moments/test-m1**', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(mkMoment('test-m1', 'Knowledge graphs connect ideas.', '知识图谱连接各种想法和概念。', ['认知科学', '知识管理'])),
    }))
    await page.route('**/api/moments/test-m2**', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(mkMoment('test-m2', '认知负荷：工作记忆容量有限', '人类工作记忆容量有限，需合理管理认知负荷。', ['心理学', '教育学'])),
    }))
    await page.route('**/api/graph/traverse/**', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { center: {}, depth: 1, edges: [], nodes: [
        { id: 'e1', type: 'entity', name: '认知负荷', entity_type: 'concept', weight: 8 },
        { id: 'e2', type: 'entity', name: '注意力', entity_type: 'concept', weight: 4 },
      ] } }),
    }))
    await page.route('**/api/reviews/*/respond', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {} }),
    }))

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(3000)

    // 截取全页
    await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-full.png`, fullPage: true })

    // 检查页面 HTML 信息
    const bodyHTML = await page.evaluate(() => document.body.innerHTML.length)
    console.log(`页面 HTML 长度: ${bodyHTML}`)
    const hasBottomNav = await page.evaluate(() => !!document.querySelector('.app-desktop'))
    console.log(`app-desktop: ${hasBottomNav}`)
    const hasGoalSetup = await page.evaluate(() => !!document.querySelector('[class*="goal"]'))
    console.log(`GoalSetup: ${hasGoalSetup}`)

    // 查找底部导航中的所有按钮
    const btnTexts = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      return btns.map(b => b.textContent?.trim().replace(/\s+/g, ' ').slice(0, 30))
    })
    console.log('按钮列表:', btnTexts)

    // 找"复习"按钮
    const reviewBtnLocator = page.locator('button').filter({ hasText: /复习/ }).first()
    const hasReviewBtn = await reviewBtnLocator.count() > 0
    console.log(`复习按钮: ${hasReviewBtn ? '✓' : '✗'}`)
    results.push({ name: '桌面端复习按钮', pass: hasReviewBtn })

    if (hasReviewBtn) {
      await reviewBtnLocator.click()
      await page.waitForTimeout(2000)
    } else {
      // 没有复习按钮，通过通知面板进入
      console.log('通过通知面板进入...')
      // 在 BottomNav 中找铃铛按钮（通过 SVG Bell 图标定位）
      const clicked = await page.evaluate(() => {
        // 找包含 SVG 的按钮，且 SVG 包含 bell 的路径特征
        const btns = Array.from(document.querySelectorAll('button'))
        for (const btn of btns) {
          const svg = btn.querySelector('svg')
          if (svg && svg.innerHTML.includes('M18 8') && btn.querySelector('.absolute')) {
            // 这是有 badge 的 bell 按钮
            btn.click()
            return 'bell-with-badge'
          }
        }
        // 退而求其次：找包含 badge 的按钮
        for (const btn of btns) {
          if (btn.querySelector('.absolute') && btn.querySelector('svg')) {
            btn.click()
            return 'button-with-badge'
          }
        }
        return null
      })
      console.log(`  点击结果: ${clicked}`)
      await page.waitForTimeout(500)

      const notifPanel = page.locator('.notification-panel')
      if (await notifPanel.count() > 0) {
        const reviewTab = page.locator('.notif-tab:has-text("待复习")')
        if (await reviewTab.count() > 0) {
          await reviewTab.click()
          await page.waitForTimeout(500)
          const startBtn = page.locator('.notif-review-start')
          if (await startBtn.count() > 0) {
            await startBtn.click()
            await page.waitForTimeout(2000)
          }
        }
      }
    }

    // 检查刷题面板
    const rcOverlay = page.locator('.rc-overlay')
    const rcOpen = await rcOverlay.count() > 0
    console.log(`刷题面板: ${rcOpen ? '✓ 打开' : '✗ 未打开'}`)
    results.push({ name: '桌面端刷题面板打开', pass: rcOpen })

    if (rcOpen) {
      await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-fc-front.png` })
      console.log('✓ 桌面端正面截图')

      // 检查组件
      const hasProgress = await page.locator('.rc-progress-text').count() > 0
      results.push({ name: '进度条', pass: hasProgress })

      const hasCard = await page.locator('.fc-scene').count() > 0
      results.push({ name: '卡片渲染', pass: hasCard })

      if (hasCard) {
        // 翻转
        await page.locator('.fc-scene').click()
        await page.waitForTimeout(800)
        const flipped = await page.locator('.fc-scene.fc-flipped').count() > 0
        results.push({ name: '3D翻转', pass: flipped })
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-fc-back.png` })

        // 4 个按钮
        const btnCount = await page.locator('.fc-btn').count()
        results.push({ name: '4个反馈按钮', pass: btnCount === 4 })

        // 精炼版
        const hasRefined = await page.locator('.fc-refined').count() > 0
        results.push({ name: '精炼版显示', pass: hasRefined })

        // 实体标签
        const entityCount = await page.locator('.fc-tag-entity').count()
        results.push({ name: '实体标签', pass: entityCount > 0 })

        // 视角标签
        const perspCount = await page.locator('.fc-tag-perspective').count()
        results.push({ name: '视角标签', pass: perspCount > 0 })

        // 点击良好 → 下一张
        await page.locator('.fc-btn.review-btn-good').click()
        await page.waitForTimeout(800)
        const p2 = await page.locator('.rc-progress-text').textContent()
        results.push({ name: '进度推进', pass: p2 === '2 / 2' })
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-fc-card2.png` })

        // 翻转第2张 → 点击简单 → 完成
        await page.locator('.fc-scene').click()
        await page.waitForTimeout(600)
        await page.locator('.fc-btn.review-btn-easy').click()
        await page.waitForTimeout(1000)

        const isDone = await page.locator('.rc-done').count() > 0
        results.push({ name: '完成画面', pass: isDone })
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-fc-done.png` })
      }
    }

    await ctx.close()
  } catch (e) {
    console.error('Error:', e.message)
    results.push({ name: '测试执行', pass: false, note: e.message })
  } finally {
    await browser.close()
  }

  console.log('\n=== 桌面端测试结果 ===')
  let p = 0, f = 0
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.note ? ` (${r.note})` : ''}`)
    r.pass ? p++ : f++
  }
  console.log(`${p} pass / ${f} fail`)
}

test().catch(console.error)
