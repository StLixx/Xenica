import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const testUrl = process.env.TEST_URL;
assert.ok(
  testUrl?.includes("file-id=21312d73-8dbe-8051-8008-cd6a4d3f9784"),
  "Use isolated regression copy",
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const report = { ok: false, errors: [], scenarios: [] };
try {
  const context = await browser.newContext({
    storageState: "/var/lib/penpot-ops/html81-auth.json",
    viewport: { width: 1600, height: 1000 },
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
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(testUrl);
  const layer = page.locator("xenica-html-embed-layer");
  await page.locator('iframe[title="HTML 交互块"]').waitFor();
  const shape = () => layer.evaluate((el) => el.context.shapes[0]);
  await layer.evaluate((el) => el.context.select(el.context.shapes[0].id));
  await page.getByRole("button", { name: "进入交互", exact: true }).click();
  const initialState = JSON.parse((await shape()).state);
  await page
    .frameLocator('iframe[title="HTML 交互块"]')
    .getByLabel("我的想法")
    .fill("Board 调整后保留输入");
  await page
    .frameLocator('iframe[title="HTML 交互块"]')
    .getByRole("button", { name: "点击 +1", exact: true })
    .click();
  await page.waitForFunction(
    (n) =>
      JSON.parse(
        document.querySelector("xenica-html-embed-layer").context.shapes[0]
          .state,
      ).count === n,
    Number(initialState.count || 0) + 1,
  );
  await page.getByRole("button", { name: "返回画布", exact: true }).click();
  const old = await shape();
  report.scenarios.push(
    "actual input and button state persist through native file changes",
  );
  await layer.evaluate((el) => el.context.select(el.context.shapes[0].id));
  await page.getByRole("button", { name: "适配 Board", exact: true }).click();
  const fitted = async () => {
    const s = await shape();
    assert.ok(s.clips?.length);
    let error = 0;
    for (let i = 0; i < 4; i++)
      error = Math.max(
        error,
        Math.abs(s.points[i].x - s.clips[0].points[i].x),
        Math.abs(s.points[i].y - s.clips[0].points[i].y),
      );
    assert.ok(error < 0.05, JSON.stringify({ error, s }));
    assert.equal(s.html, old.html);
    assert.equal(s.state, old.state);
    return s;
  };
  await page.waitForTimeout(200);
  await fitted();
  report.scenarios.push(
    "existing path fits Board without changing HTML or state",
  );
  const resize = async (corner, dx, dy) => {
    const handle = page.locator(`[data-position="${corner}"]`).first();
    const box = await handle.boundingBox();
    assert.ok(box);
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  await page.getByRole("button", { name: "进入交互", exact: true }).click();
  const before = await shape();
  await resize("bottom-right", -100, -70);
  const smaller = await shape();
  assert.ok(
    smaller.width < before.width - 40 && smaller.height < before.height - 30,
    JSON.stringify({ before, smaller }),
  );
  assert.equal(await layer.evaluate((el) => el.active), null);
  report.scenarios.push(
    "inward native handle drag releases active iframe and shrinks",
  );
  await resize("bottom-right", 80, 50);
  assert.ok((await shape()).width > smaller.width + 30);
  report.scenarios.push("outward native handle drag enlarges after shrinking");
  await page.getByRole("button", { name: "适配 Board", exact: true }).click();
  await page.waitForTimeout(150);
  await fitted();
  const fid = (await shape()).frameId;
  await layer.evaluate((el, id) => el.context.select(id), fid);
  for (const [corner, dx, dy] of [
    ["bottom-right", 90, 60],
    ["bottom-right", -70, -50],
    ["top-left", 50, 30],
    ["top-right", -40, 25],
    ["bottom-left", 30, -20],
  ]) {
    await resize(corner, dx, dy);
    await fitted();
  }
  report.scenarios.push(
    "all four Board corner handles keep HTML aligned in position and size",
  );
  await page.getByTitle("Saved", { exact: true }).waitFor();
  await page.reload();
  await page.locator('iframe[title="HTML 交互块"]').waitFor();
  await fitted();
  report.scenarios.push(
    "Board geometry and stretch constraints survive reload",
  );
  await layer.evaluate((el, id) => el.context.select(id), fid);
  await page.getByRole("button", { name: "＋ HTML", exact: true }).click();
  await page.getByRole("button", { name: "插入画板", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("xenica-html-embed-layer").context.shapes
        .length === 2,
  );
  const created = await layer.evaluate(
    (el, id) => el.context.shapes.find((s) => s.id !== id),
    old.id,
  );
  for (let i = 0; i < 4; i++) {
    assert.ok(
      Math.abs(created.points[i].x - created.clips[0].points[i].x) < 0.05,
    );
    assert.ok(
      Math.abs(created.points[i].y - created.clips[0].points[i].y) < 0.05,
    );
  }
  report.scenarios.push(
    "new HTML defaults to selected Board size and alignment",
  );
  await page.keyboard.press("Delete");
  await page.waitForFunction(
    () =>
      document.querySelector("xenica-html-embed-layer").context.shapes
        .length === 1,
  );
  await page.getByTitle("Saved", { exact: true }).waitFor();
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.getByTestId("viewport").click({ position: { x: 30, y: 140 } });
  await page.keyboard.press("Shift+1");
  await page.getByRole("button", { name: "＋ HTML", exact: true }).waitFor();
  await page.screenshot({
    path: new URL(
      "../../../output/playwright/html81-board-narrow.png",
      import.meta.url,
    ).pathname,
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const popup = page.waitForEvent("popup");
  await page.getByTitle("View mode (G V)", { exact: true }).click();
  const viewer = await popup;
  const vf = viewer.frameLocator('iframe[title="HTML 交互块"]');
  await vf.locator("#count").waitFor();
  const count = Number(await vf.locator("#count").innerText());
  await vf.getByRole("button", { name: "点击 +1", exact: true }).click();
  assert.equal(Number(await vf.locator("#count").innerText()), count + 1);
  await viewer.screenshot({
    path: new URL(
      "../../../output/playwright/html81-board-viewer.png",
      import.meta.url,
    ).pathname,
  });
  await viewer.close();
  assert.equal((await shape()).state, old.state);
  report.scenarios.push(
    "narrow toolbar and interactive readonly viewer keep Board clipping",
  );
  await page.screenshot({
    path: new URL(
      "../../../output/playwright/html81-board.png",
      import.meta.url,
    ).pathname,
  });
  assert.deepEqual(report.errors, []);
  report.ok = true;
} finally {
  await browser.close();
  console.log(JSON.stringify(report));
}
