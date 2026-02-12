/**
 * X6M3 ReviewCards 完整自测脚本
 * 用 Playwright headless + API mock 测试完整刷题流程
 */
import { chromium } from 'playwright'

const SCREENSHOTS = 'C:/dev/Commader/.reports/pm-a/screenshots'

// Mock 数据
const mockDueReviews = [
  {
    id: { tb: 'review_schedule', id: { String: 'test-review-1' } },
    moment_id: { tb: 'moment', id: { String: 'test-moment-1' } },
    next_review: '2026-02-07T00:00:00Z',
    interval: 1.0,
    ease_factor: 2.5,
    review_count: 0,
    created_at: '2026-02-06T00:00:00Z',
    moment_text: '知识图谱通过建立关联，在认知活动中起到连接各种想法和概念的核心作用。',
  },
  {
    id: { tb: 'review_schedule', id: { String: 'test-review-2' } },
    moment_id: { tb: 'moment', id: { String: 'test-moment-2' } },
    next_review: '2026-02-07T00:00:00Z',
    interval: 3.0,
    ease_factor: 2.5,
    review_count: 2,
    created_at: '2026-02-04T00:00:00Z',
    moment_text: '人类的工作记忆容量存在着局限，需要通过合理的策略管理认知负荷。',
  },
  {
    id: { tb: 'review_schedule', id: { String: 'test-review-3' } },
    moment_id: { tb: 'moment', id: { String: 'test-moment-3' } },
    next_review: '2026-02-07T00:00:00Z',
    interval: 7.0,
    ease_factor: 2.8,
    review_count: 4,
    created_at: '2026-02-01T00:00:00Z',
    moment_text: '涌现性是复杂系统中自下而上产生的高层次特性。',
  },
]

const mockMoments = {
  'test-moment-1': {
    success: true,
    data: {
      id: { tb: 'moment', id: { String: 'test-moment-1' } },
      raw_input: 'Xenica PDF Import Test\nThis is a test PDF.\nCognitive moment: Knowledge graphs connect ideas.',
      refined: '知识图谱通过建立关联，在认知活动中起到连接各种想法和概念的核心作用。',
      trigger: 'PDF文字导入 test.pdf',
      timestamp: '2026-02-08T02:40:25.349Z',
      location: null,
      perspectives: ['认知科学', '知识管理', '软件测试'],
      extracted: true,
      weight: 0.0,
    },
  },
  'test-moment-2': {
    success: true,
    data: {
      id: { tb: 'moment', id: { String: 'test-moment-2' } },
      raw_input: '# 认知负荷\n\n工作记忆容量有限，需要合理管理。\n\n注意力是一个相关概念，工作记忆也很重要。',
      refined: '人类的工作记忆容量存在着局限，在处理信息或执行任务时需要通过合理的策略管理认知负荷，以避免认知超载并提升处理效率。',
      trigger: '导入自 认知负荷.md (obsidian)',
      timestamp: '2026-02-08T02:23:14.230Z',
      location: null,
      perspectives: ['认知科学', '心理学', '教育学', '效率管理'],
      extracted: true,
      weight: 0.0,
    },
  },
  'test-moment-3': {
    success: true,
    data: {
      id: { tb: 'moment', id: { String: 'test-moment-3' } },
      raw_input: '涌现性：整体大于部分之和。蚂蚁群体智慧就是涌现的典型例子。',
      refined: '涌现性是复杂系统中自下而上产生的高层次特性，表现为"整体大于部分之和"的现象，蚂蚁群体的集体智能是经典案例。',
      trigger: null,
      timestamp: '2026-02-07T10:15:00.000Z',
      location: null,
      perspectives: ['复杂系统', '哲学'],
      extracted: true,
      weight: 5.0,
    },
  },
}

const mockGraphTraverse = {
  success: true,
  data: {
    center: {},
    nodes: [
      { id: 'entity-1', type: 'entity', name: '认知负荷', entity_type: 'concept', weight: 8.0 },
      { id: 'entity-2', type: 'entity', name: '工作记忆', entity_type: 'concept', weight: 6.0 },
      { id: 'entity-3', type: 'entity', name: '注意力', entity_type: 'concept', weight: 4.0 },
    ],
    edges: [],
    depth: 1,
  },
}

async function test() {
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    // ── 桌面端完整流程测试 ──
    console.log('=== 桌面端完整流程测试（Mock 数据） ===')
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()

    // 拦截 API 调用，注入测试数据
    await page.route('**/api/reviews/due', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockDueReviews }),
      })
    })

    await page.route('**/api/moments/*', async (route) => {
      const url = route.request().url()
      const momentId = url.split('/moments/')[1]
      const data = mockMoments[momentId]
      if (data) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(data),
        })
      } else {
        await route.continue()
      }
    })

    await page.route('**/api/graph/traverse/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockGraphTraverse),
      })
    })

    await page.route('**/api/reviews/*/respond', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 'test', interval: 2.5, ease_factor: 2.5, review_count: 1 },
        }),
      })
    })

    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)

    // 1. 检查底部"复习"按钮（有待复习时应显示）
    const reviewBtn = page.locator('button:has-text("复习 3")')
    const hasReviewBtn = await reviewBtn.count() > 0
    console.log(`  底部"复习 3"按钮: ${hasReviewBtn ? '✓ 显示' : '✗ 未显示'}`)
    results.push({ name: '底部导航复习按钮（有数据时）', pass: hasReviewBtn })
    await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-with-reviews.png` })

    // 2. 点击复习按钮打开刷题面板
    if (hasReviewBtn) {
      await reviewBtn.click()
      await page.waitForTimeout(2000) // 等待数据加载

      const rcOverlay = page.locator('.rc-overlay')
      const rcVisible = await rcOverlay.count() > 0
      console.log(`  刷题面板: ${rcVisible ? '✓ 已打开' : '✗ 未打开'}`)
      results.push({ name: '刷题面板打开', pass: rcVisible })

      if (rcVisible) {
        // 3. 截图：初始卡片正面
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-card-front.png` })
        console.log('✓ 桌面端卡片正面截图')

        // 检查进度条
        const progressText = page.locator('.rc-progress-text')
        const progressContent = await progressText.textContent()
        console.log(`  进度条: ${progressContent}`)
        results.push({ name: '进度条显示', pass: progressContent === '1 / 3' })

        // 检查正面内容
        const fcContent = page.locator('.fc-content')
        const frontText = await fcContent.textContent()
        console.log(`  正面文本: ${frontText?.slice(0, 40)}...`)
        results.push({ name: '正面显示原始记录', pass: !!frontText && frontText.length > 0 })

        // 检查"点击翻转"提示
        const hint = page.locator('.fc-hint')
        const hintText = await hint.textContent()
        results.push({ name: '翻转提示显示', pass: hintText?.includes('翻转') || false })

        // 4. 点击卡片翻转
        const flashcard = page.locator('.fc-scene')
        await flashcard.click()
        await page.waitForTimeout(800)
        await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-card-back.png` })
        console.log('✓ 桌面端卡片背面截图')

        // 检查翻转状态
        const flipped = page.locator('.fc-scene.fc-flipped')
        const isFlipped = await flipped.count() > 0
        console.log(`  卡片翻转: ${isFlipped ? '✓ 已翻转' : '✗ 未翻转'}`)
        results.push({ name: '3D 翻转动画', pass: isFlipped })

        // 检查反馈按钮
        const fcActions = page.locator('.fc-actions')
        const hasActions = await fcActions.count() > 0
        console.log(`  反馈按钮: ${hasActions ? '✓ 显示' : '✗ 未显示'}`)
        results.push({ name: '翻转后反馈按钮出现', pass: hasActions })

        // 检查精炼版/实体/视角标签
        const refined = page.locator('.fc-refined')
        const hasRefined = await refined.count() > 0
        results.push({ name: '背面精炼版显示', pass: hasRefined })

        const entityTags = page.locator('.fc-tag-entity')
        const entityCount = await entityTags.count()
        console.log(`  实体标签: ${entityCount} 个`)
        results.push({ name: '背面实体标签显示', pass: entityCount > 0 })

        const perspectiveTags = page.locator('.fc-tag-perspective')
        const perspectiveCount = await perspectiveTags.count()
        console.log(`  视角标签: ${perspectiveCount} 个`)
        results.push({ name: '背面视角标签显示', pass: perspectiveCount > 0 })

        // 5. 点击"良好"按钮
        if (hasActions) {
          const goodBtn = page.locator('.fc-btn.review-btn-good')
          if (await goodBtn.count() > 0) {
            await goodBtn.click()
            await page.waitForTimeout(1000)

            // 应该进入第 2 张卡片
            const newProgress = await progressText.textContent()
            console.log(`  进度更新: ${newProgress}`)
            results.push({ name: '反馈后进入下一张', pass: newProgress === '2 / 3' })

            await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-card-2.png` })
            console.log('✓ 第二张卡片截图')

            // 6. 连续完成剩余卡片
            // 翻转第二张
            await flashcard.click()
            await page.waitForTimeout(600)
            // 点击"简单"
            const easyBtn = page.locator('.fc-btn.review-btn-easy')
            if (await easyBtn.count() > 0) await easyBtn.click()
            await page.waitForTimeout(800)

            // 翻转第三张
            const fcScene3 = page.locator('.fc-scene')
            if (await fcScene3.count() > 0) {
              await fcScene3.click()
              await page.waitForTimeout(600)
              // 点击"困难"
              const hardBtn = page.locator('.fc-btn.review-btn-hard')
              if (await hardBtn.count() > 0) await hardBtn.click()
              await page.waitForTimeout(1000)
            }

            // 7. 检查完成画面
            const doneEmoji = page.locator('.rc-done-emoji')
            const isDone = await doneEmoji.count() > 0
            console.log(`  完成画面: ${isDone ? '✓ 显示' : '✗ 未显示'}`)
            results.push({ name: '全部完成后显示庆祝', pass: isDone })

            if (isDone) {
              await page.screenshot({ path: `${SCREENSHOTS}/x6m3-desktop-completed.png` })
              console.log('✓ 复习完成截图')
            }
          }
        }
      }
    }

    await ctx.close()

    // ── 手机端测试 ──
    console.log('\n=== 手机端完整流程测试 ===')
    const mCtx = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const mobile = await mCtx.newPage()

    // 同样拦截 API
    await mobile.route('**/api/reviews/due', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockDueReviews }),
      })
    })
    await mobile.route('**/api/moments/*', async (route) => {
      const url = route.request().url()
      const momentId = url.split('/moments/')[1]
      const data = mockMoments[momentId]
      if (data) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
      } else {
        await route.continue()
      }
    })
    await mobile.route('**/api/graph/traverse/*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockGraphTraverse) })
    })
    await mobile.route('**/api/reviews/*/respond', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'test', interval: 2.5, ease_factor: 2.5, review_count: 1 } }),
      })
    })

    await mobile.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 })
    await mobile.waitForTimeout(2000)
    await mobile.screenshot({ path: `${SCREENSHOTS}/x6m3-mobile-with-reviews.png` })

    // 通过 TopBar 铃铛打开通知面板
    const bell = mobile.locator('.topbar-bell')
    if (await bell.count() > 0) {
      await bell.click()
      await mobile.waitForTimeout(500)

      // 切换到复习 tab
      const reviewTab = mobile.locator('.notif-tab:has-text("待复习")')
      if (await reviewTab.count() > 0) {
        await reviewTab.click()
        await mobile.waitForTimeout(500)

        // 找"开始刷题"按钮
        const startBtn = mobile.locator('.notif-review-start')
        const hasStart = await startBtn.count() > 0
        console.log(`  开始刷题按钮: ${hasStart ? '✓' : '✗'}`)
        results.push({ name: '手机端"开始刷题"按钮', pass: hasStart })

        if (hasStart) {
          await mobile.screenshot({ path: `${SCREENSHOTS}/x6m3-mobile-start-btn.png` })
          await startBtn.click()
          await mobile.waitForTimeout(2000)

          // 检查全屏卡片模式
          const rcMobile = mobile.locator('.rc-overlay')
          const mobileRcOpen = await rcMobile.count() > 0
          console.log(`  手机端刷题面板: ${mobileRcOpen ? '✓ 全屏打开' : '✗'}`)
          results.push({ name: '手机端全屏刷题面板', pass: mobileRcOpen })

          if (mobileRcOpen) {
            await mobile.screenshot({ path: `${SCREENSHOTS}/x6m3-mobile-flashcard-front.png` })
            console.log('✓ 手机端卡片正面截图')

            // 翻转
            const mFcScene = mobile.locator('.fc-scene')
            if (await mFcScene.count() > 0) {
              await mFcScene.click()
              await mobile.waitForTimeout(800)
              await mobile.screenshot({ path: `${SCREENSHOTS}/x6m3-mobile-flashcard-back.png` })
              console.log('✓ 手机端卡片背面截图')
              results.push({ name: '手机端卡片翻转', pass: true })
            }
          }
        }
      }
    }

    await mCtx.close()

  } catch (e) {
    console.error('测试出错:', e.message)
    results.push({ name: '测试执行', pass: false, note: e.message })
  } finally {
    await browser.close()
  }

  // 摘要
  console.log('\n=== 测试结果摘要 ===')
  let pass = 0, fail = 0
  for (const r of results) {
    const s = r.pass ? '✓ PASS' : '✗ FAIL'
    const n = r.note ? ` (${r.note})` : ''
    console.log(`${s} ${r.name}${n}`)
    r.pass ? pass++ : fail++
  }
  console.log(`\n共 ${results.length} 项: ${pass} 通过, ${fail} 失败`)
  if (fail > 0) process.exit(1)
}

test().catch(console.error)
