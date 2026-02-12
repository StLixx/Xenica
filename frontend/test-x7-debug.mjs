import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)

const buttons = await page.locator('button').all()
for (const btn of buttons) {
  const title = await btn.getAttribute('title')
  const visible = await btn.isVisible()
  if (title) console.log(`button: "${title}" visible: ${visible}`)
}

const draftBtns = await page.locator('button[title="写草稿"]').count()
console.log(`draft buttons total: ${draftBtns}`)

// also check the aside panel
const chatPanel = await page.locator('.app-desktop-chat').isVisible().catch(() => false)
console.log(`chat panel visible: ${chatPanel}`)

await page.screenshot({ path: 'C:/dev/Commader/.reports/pm-a/screenshots/x7-06-desktop-full.png', fullPage: true })
console.log('full page screenshot saved')

await browser.close()
