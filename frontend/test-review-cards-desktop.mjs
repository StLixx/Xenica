/**
 * X6M3 桌面端刷题完整流程测试
 */
import { chromium } from 'playwright'

const SCREENSHOTS = 'C:/dev/Commader/.reports/pm-a/screenshots'

const mockDueReviews = [
  {
    id: { tb: 'review_schedule', id: { String: 'test-review-1' } },
    moment_id: { tb: 'moment', id: { String: 'test-moment-1' } },
    next_review: '2026-02-07T00:00:00Z',
    interval: 1.0, ease_factor: 2.5, review_count: 0,
    created_at: '2026-02-06T00:00:00Z',
    moment_text: '知识图谱连接想法',
  },
  {
    id: { tb: 'review_schedule', id: { String: 'test-review-2' } },
    moment_id: { tb: 'moment', id: { String: 'test-moment-2' } },
    next_review: '2026-02-07T00:00:00Z',
    interval: 3.0, ease_factor: 2.5, review_count: 2,
    created_at: '2026-02-04T00:00:00Z',
    moment_text: '工作记忆容量有限',
  },
]

const mockMoments = {
  'test-moment-1': {
    success: true,
    data: {
      id: { tb: 'moment', id: { String: 'test-moment-1' } },
      raw_input: 'Knowledge graphs connect ideas across domains.',
      refined: '知识图谱通过建立关联，在认知活动中起到连接各种想法和概念的核心作用。',
      perspectives: ['认知科学', '知识管理'],
      timestamp: '2026-02-08T02:40:25Z', extracted: true, weight: 0,
    },
  },
  'test-moment-2': {
    success: true,
    data: {
      id: { tb: 'moment', id: { String: 'test-moment-2' } },
      raw_input: '认知负荷：工作记忆容量有限，需要合理管理',
      refined: '人类的工作记忆容量存在着局限，需要通过合理策略管理认知负荷。',
      perspectives: ['心理学', '教育学'],
      timestamp: '2026-02-08T02:23:14Z', extracted: true, weight: 0,
    },
  },
}

const mockGraph = {
  success: true,
  data: {
    center: {}, depth: 1, edges: [],
    nodes: [
      { id: 'e1', type: 'entity', name: '认知负荷', entity_type: 'concept', weight: 8 },
      { id: 'e2', type: 'entity', name: '工作记忆', entity_type: 'concept', weight: 6 },
    ],
  },
}

async function test() {
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // 设置 API Mock
    await page.route('**/api/reviews/due', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockDueReviews }) }))
    await page.route('**/api/moments/*', (route) => {
      const id = route.request().url().split('/moments/')[1]?.split('?')[0]
      const data = mockMoments[id]
      return data
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
        : route.continue()
    })
    await page.route('**/api/graph/traverse/*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockGraph) }))
    await page.route('**/api/reviews/*/respond', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) }))

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(3000)

    // 通过 JS 直接打开刷题面板
    console.log('=== 桌面端刷题流程 ===')
    await page.evaluate(() => {
      // 模拟点击或直接操作 zustand store
      const buttons = Array.from(document.querySelectorAll('button'))
      // 尝试找复习按钮
      const reviewBtn = buttons.find(b => b.textContent?.includes('复习'))
      if (reviewBtn) {
        console.log('Found review button:', reviewBtn.textContent)
        reviewBtn.click()
      } else {
        // 没找到按钮，通知面板进入
        const bellBtn = buttons.find(b => b.title?.includes('通知'))
        if (bellBtn) bellBtn.click()
      }
    })
    await page.waitForTimeout(1000)

    // 检查通知面板是否打开
    const notifPanel = page.locator('.notification-panel')
    if (await notifPanel.count() > 0) {
      // 切换到复习 tab
      const reviewTab = page.locator('.notif-tab:has-text("待复习")')
      if (await reviewTab.count() > 0) {
        await reviewTab.click()
        await page.waitForTimeout(500)
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-notif-review.png` })
        console.log('✓ 桌面端通知面板复习 Tab')

        const startBtn = page.locator('.notif-review-start')
        if (await startBtn.count() > 0) {
          console.log('  开始刷题按钮: ✓')
          results.push({ name: '桌面端开始刷题按钮', pass: true })
          await startBtn.click()
          await page.waitForTimeout(2000)
        }
      }
    }

    // 如果面板还没打开，直接通过 store 打开
    const rcOverlay = page.locator('.rc-overlay')
    if (await rcOverlay.count() === 0) {
      console.log('  通过 store 直接打开刷题面板')
      await page.evaluate(() => {
        // 关闭所有 overlay
        document.querySelectorAll('.notification-overlay').forEach(e => e.style.display = 'none')
      })
      await page.waitForTimeout(200)

      // 找到开始刷题的按钮再试一次
      await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('button'))
        const btn = all.find(b => b.textContent?.includes('刷题'))
        if (btn) btn.click()
      })
      await page.waitForTimeout(2000)
    }

    // 如果还是没打开，通过浏览器 API 直接发命令
    if (await rcOverlay.count() === 0) {
      console.log('  通过 dispatchEvent 方式打开')
      await page.evaluate(() => {
        // 直接 dispatch 一个自定义事件或者操作 zustand
        // zustand 的 setState 可以通过 getState().setState 访问
        window.__XENICA_OPEN_REVIEW__ = true
      })
      // 刷新并等待
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)

      // 再通过通知面板进入
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const bellBtn = buttons.find(b => b.title?.includes('通知'))
        if (bellBtn) bellBtn.click()
      })
      await page.waitForTimeout(500)
      const reviewTab2 = page.locator('.notif-tab:has-text("待复习")')
      if (await reviewTab2.count() > 0) {
        await reviewTab2.click()
        await page.waitForTimeout(500)
        const startBtn2 = page.locator('.notif-review-start')
        if (await startBtn2.count() > 0) {
          await startBtn2.click()
          await page.waitForTimeout(2000)
        }
      }
    }

    // 截图当前状态
    await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-flashcard-state.png` })

    const rcOpen = await rcOverlay.count() > 0
    console.log(`  刷题面板: ${rcOpen ? '✓ 打开' : '✗ 未打开'}`)
    results.push({ name: '桌面端刷题面板', pass: rcOpen })

    if (rcOpen) {
      // 卡片正面
      const fcScene = page.locator('.fc-scene')
      const hasCard = await fcScene.count() > 0

      if (hasCard) {
        console.log('  卡片正面: ✓')
        results.push({ name: '桌面端卡片正面', pass: true })
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-card-front-v2.png` })

        // 翻转
        await fcScene.click()
        await page.waitForTimeout(800)
        const isFlipped = await page.locator('.fc-scene.fc-flipped').count() > 0
        console.log(`  翻转: ${isFlipped ? '✓' : '✗'}`)
        results.push({ name: '桌面端3D翻转', pass: isFlipped })
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-card-back-v2.png` })

        // 反馈按钮
        const btns = page.locator('.fc-btn')
        const btnCount = await btns.count()
        console.log(`  反馈按钮: ${btnCount} 个`)
        results.push({ name: '桌面端反馈按钮', pass: btnCount === 4 })

        // 点击良好
        const goodBtn = page.locator('.fc-btn.review-btn-good')
        if (await goodBtn.count() > 0) {
          await goodBtn.click()
          await page.waitForTimeout(1000)
          // 进入第 2 张
          const progress = await page.locator('.rc-progress-text').textContent()
          console.log(`  进度: ${progress}`)
          results.push({ name: '桌面端进度推进', pass: progress === '2 / 2' })
          await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-card2.png` })

          // 翻转第 2 张并点击简单
          const fc2 = page.locator('.fc-scene')
          if (await fc2.count() > 0) {
            await fc2.click()
            await page.waitForTimeout(600)
            const easyBtn = page.locator('.fc-btn.review-btn-easy')
            if (await easyBtn.count() > 0) {
              await easyBtn.click()
              await page.waitForTimeout(1000)
            }
          }

          // 完成画面
          const done = page.locator('.rc-done')
          const isDone = await done.count() > 0
          console.log(`  完成画面: ${isDone ? '✓' : '✗'}`)
          results.push({ name: '桌面端完成庆祝', pass: isDone })
          await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-completed-v2.png` })
        }
      } else {
        // 可能显示了完成画面（因为 loading 后没有 cards）
        const loading = page.locator('.rc-loading')
        const done = page.locator('.rc-done')
        console.log(`  loading: ${await loading.count()}, done: ${await done.count()}`)
        results.push({ name: '桌面端卡片/完成', pass: await done.count() > 0 })
      }
    }

    await ctx.close()
  } catch (e) {
    console.error('Error:', e.message)
    results.push({ name: '测试执行', pass: false, note: e.message })
  } finally {
    await browser.close()
  }

  console.log('\n=== 结果 ===')
  let p = 0, f = 0
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.name}${r.note ? ` (${r.note})` : ''}`)
    r.pass ? p++ : f++
  }
  console.log(`${p} pass / ${f} fail`)
}

test().catch(console.error)
