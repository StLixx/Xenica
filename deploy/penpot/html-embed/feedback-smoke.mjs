const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const evidence = JSON.parse(
  await fs.readFile(new URL("./evidence.json", import.meta.url), "utf8"),
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const report = {
  ok: false,
  errors: [],
  samples: 0,
  maxPositionError: 0,
  maxSizeError: 0,
  zooms: [],
};
try {
  const context = await browser.newContext({
    storageState: "/var/lib/penpot-ops/html81-auth.json",
    viewport: { width: 1606, height: 1820 },
  });
  if (process.env.PREVIEW_ORIGIN)
    await context.route("https://penpot.truebigsand.top/**", async (route) => {
      const u = new URL(route.request().url());
      await route.fulfill({
        response: await route.fetch({
          url: process.env.PREVIEW_ORIGIN + u.pathname + u.search,
        }),
      });
    });
  if (process.env.INJECT_OVERLAY)
    await context.route("**/js/xenica-html-embed.js*", (r) =>
      r.fulfill({
        path: new URL("./overlay.js", import.meta.url).pathname,
        contentType: "text/javascript",
      }),
    );
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(process.env.TEST_URL || evidence.publicReport.url);
  await page.locator('iframe[title="HTML 交互块"]').waitFor();
  const check = async () => {
    const result = await page
      .locator("xenica-html-embed-layer")
      .evaluate((el) => {
        const s = el.context.shapes[0],
          card = el.shadowRoot.querySelector(".card"),
          box = card.getBoundingClientRect(),
          host = el.getBoundingClientRect(),
          z = el.context.zoom,
          v = el.context.vbox;
        return {
          finite: [s.x, s.y, s.width, s.height].every(Number.isFinite),
          position: Math.max(
            Math.abs(box.x - host.x - (s.points[0].x - v.x) * z),
            Math.abs(box.y - host.y - (s.points[0].y - v.y) * z),
          ),
          size: Math.max(
            Math.abs(box.width - s.width * z),
            Math.abs(box.height - s.height * z),
          ),
          zoom: z,
        };
      });
    assert.ok(result.finite);
    assert.ok(result.position < 2, JSON.stringify(result));
    assert.ok(result.size < 2, JSON.stringify(result));
    report.samples++;
    if (!report.zooms.includes(result.zoom)) report.zooms.push(result.zoom);
    report.maxPositionError = Math.max(
      report.maxPositionError,
      result.position,
    );
    report.maxSizeError = Math.max(report.maxSizeError, result.size);
    return result.zoom;
  };
  await check();
  await page.getByTestId("viewport").click({ position: { x: 40, y: 130 } });
  await page.keyboard.press("Shift+1");
  await page.waitForTimeout(200);
  const box = await page.locator('iframe[title="HTML 交互块"]').boundingBox();
  await page.mouse.move(box.x + 50, box.y + 60);
  const initial = await check();
  await page.keyboard.down("Control");
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, i < 12 ? -90 : 90);
    await page.waitForTimeout(40);
    await check();
  }
  await page.keyboard.up("Control");
  report.finalZoom = await check();
  report.initialZoom = initial;
  assert.ok(report.zooms.length > 3, "wheel must actually change canvas zoom");
  const panBefore = await page
    .locator("xenica-html-embed-layer")
    .evaluate((el) => el.context.vbox.x);
  await page.keyboard.down("Space");
  await page.mouse.move(700, 700);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(700 + i * 12, 700 + i * 8);
    await page.waitForTimeout(30);
    await check();
  }
  await page.mouse.up();
  await page.keyboard.up("Space");
  report.panDelta =
    (await page
      .locator("xenica-html-embed-layer")
      .evaluate((el) => el.context.vbox.x)) - panBefore;
  assert.ok(Math.abs(report.panDelta) > 20, "Space drag must pan canvas");
  const current = await page
    .locator('iframe[title="HTML 交互块"]')
    .boundingBox();
  await page.mouse.dblclick(current.x + 40, current.y + 40);
  await page.getByRole("button", { name: "返回画布", exact: true }).waitFor();
  const frame = page.frameLocator('iframe[title="HTML 交互块"]');
  await frame.getByLabel("我的想法").press("Escape");
  await page.getByRole("button", { name: "进入交互", exact: true }).waitFor();
  await page.reload();
  await page.locator('iframe[title="HTML 交互块"]').waitFor();
  await check();
  assert.equal(await frame.locator("#count").innerText(), "3");
  await page.screenshot({
    path: new URL(
      "../../../output/playwright/html81-feedback.png",
      import.meta.url,
    ).pathname,
  });
  assert.deepEqual(report.errors, []);
  report.ok = true;
} finally {
  await browser.close();
  console.log(JSON.stringify(report));
}
