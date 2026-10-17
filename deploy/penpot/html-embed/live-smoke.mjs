const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const url =
  process.env.TEST_URL ||
  "https://penpot.truebigsand.top/#/workspace?team-id=8fa64b17-9fc4-8078-8008-c9bd47e80f37&file-id=21312d73-8dbe-8051-8008-cd4942b4b991&page-id=21312d73-8dbe-8051-8008-cd4942b4b992&board-id=13fe1aba-db42-8012-8008-cd496d70b0d2";
const out = new URL("../../../output/playwright/", import.meta.url);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const report = { ok: false, scenarios: [], errors: [] };
const passed = (name) => {
  report.scenarios.push(name);
  console.log("PASS", name);
};
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
  await page.goto(url);
  const layer = page.locator("xenica-html-embed-layer");
  const embed = page.locator('iframe[title="HTML 交互块"]');
  await embed.waitFor();
  await layer.evaluate((el) => el.context.select(el.context.shapes[0].id));
  for (const [name, value] of [
    ["X axis", "60"],
    ["Y axis", "90"],
    ["Width", "640"],
    ["Height", "420"],
  ]) {
    const input = page.getByRole("textbox", { name, exact: true });
    await input.fill(value);
    await input.press("Enter");
  }
  await page.getByTestId("viewport").click({ position: { x: 40, y: 820 } });
  await page.keyboard.press("Shift+1");
  const shape = () =>
    layer.evaluate((el) => {
      const s = el.context.shapes[0];
      return {
        id: s.id,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height,
        state: s.state,
        zoom: el.context.zoom,
      };
    });
  const select = async () => {
    await page
      .getByRole("button", { name: "选择 HTML 嵌入块", exact: true })
      .click();
    await page.getByRole("button", { name: "进入交互", exact: true }).waitFor();
  };
  await select();
  await page.getByRole("button", { name: "进入交互", exact: true }).click();
  let frame = page.frameLocator('iframe[title="HTML 交互块"]');
  await frame.getByRole("button", { name: "重置", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(
        document.querySelector("xenica-html-embed-layer").context.shapes[0]
          .state,
      ).count === 0,
  );
  await frame.getByLabel("我的想法").fill("画板内 <HTML>，刷新后仍在");
  for (let i = 0; i < 3; i++) {
    await frame.getByRole("button", { name: "点击 +1", exact: true }).click();
    await page.waitForFunction(
      (n) =>
        JSON.parse(
          document.querySelector("xenica-html-embed-layer").context.shapes[0]
            .state,
        ).count === n,
      i + 1,
    );
  }
  await page.getByRole("button", { name: "返回画布", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("xenica-html-embed-layer").active === null,
  );
  await page.waitForFunction(
    () =>
      JSON.parse(
        document.querySelector("xenica-html-embed-layer").context.shapes[0]
          .state,
      ).count === 3,
  );
  passed("input, buttons and persisted state bridge");
  const before = await shape();
  const b = await embed.boundingBox();
  await page.mouse.move(b.x + 100, b.y + 40);
  // Native WASM hover hit-testing is asynchronous; resolve it before pointerdown.
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.move(
    b.x + 100 + 65 * before.zoom,
    b.y + 40 + 45 * before.zoom,
    { steps: 20 },
  );
  await page
    .waitForFunction(
      (expected) => {
        const el = document
          .querySelector("xenica-html-embed-layer")
          ?.shadowRoot.querySelector("iframe");
        return el && Math.abs(el.getBoundingClientRect().x - expected) < 8;
      },
      b.x + 65 * before.zoom,
      { timeout: 5000 },
    )
    .catch(async (error) => {
      report.dragFailure = await page.evaluate(async () => {
        const el = document.querySelector("xenica-html-embed-layer");
        const { $APP: a } = await import(
          `/js/shared.js?version=${globalThis.penpotVersionTag}`
        );
        return {
          active: el.active,
          selected: el.context.selected,
          shapes: el.context.shapes.map((s) => ({
            x: s.x,
            y: s.y,
            points: s.points,
          })),
          zoom: el.context.zoom,
          box: el.shadowRoot
            .querySelector("iframe")
            .getBoundingClientRect()
            .toJSON(),
          scroll: el.parentElement.scrollLeft,
          pointer: getComputedStyle(el.shadowRoot.querySelector("iframe"))
            .pointerEvents,
          wasmModifiers: a.cljs.core.clj__GT_js(
            a.cljs.core.deref(a.app.main.refs.workspace_wasm_modifiers),
          ),
          local: a.cljs.core.clj__GT_js(
            a.cljs.core.deref(a.app.main.refs.workspace_local),
          ),
          nativeModifiers: a.cljs.core.clj__GT_js(
            a.cljs.core.deref(a.app.main.refs.workspace_modifiers),
          ),
          focus: document.activeElement?.tagName,
        };
      });
      throw error;
    });
  const during = await embed.boundingBox();
  await page.mouse.up();
  await page.waitForFunction(
    (old) =>
      document.querySelector("xenica-html-embed-layer").context.shapes[0].x !==
      old,
    before.x,
  );
  const moved = await shape();
  const afterBox = await embed.boundingBox();
  report.drag = { before, moved, during, afterBox };
  assert.ok(moved.x > before.x + 30);
  assert.ok(moved.y > before.y + 20);
  assert.ok(
    Math.abs(afterBox.x - b.x - (moved.x - before.x) * before.zoom) < 3,
  );
  assert.ok(
    Math.abs(afterBox.y - b.y - (moved.y - before.y) * before.zoom) < 3,
  );
  passed("native drag with live HTML alignment");
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("680");
  await page
    .getByRole("textbox", { name: "Width", exact: true })
    .press("Enter");
  await page.getByRole("textbox", { name: "Height", exact: true }).fill("440");
  await page
    .getByRole("textbox", { name: "Height", exact: true })
    .press("Enter");
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector("xenica-html-embed-layer").context.shapes[0]
          .width - 680,
      ) < 0.01,
  );
  const resized = await shape();
  assert.ok(Math.abs(resized.height - 440) < 0.01);
  passed("native width and height edits");
  await page.mouse.click(1200, 800);
  await page.keyboard.press("-");
  await page.waitForFunction(
    () => document.querySelector("xenica-html-embed-layer").context.zoom < 1,
  );
  const zoomed = await shape();
  const zb = await embed.boundingBox();
  assert.ok(Math.abs(zb.width - (680 - 2) * zoomed.zoom) < 3);
  passed("canvas zoom alignment");
  await page.keyboard.press("Shift+0");
  await page.waitForFunction(
    () => document.querySelector("xenica-html-embed-layer").context.zoom === 1,
  );
  await page.getByTitle("Saved", { exact: true }).waitFor({ timeout: 20000 });
  const persisted = await shape();
  await page.reload();
  await embed.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("xenica-html-embed-layer")?.context?.shapes
        .length === 1,
  );
  const restored = await shape();
  for (const k of ["x", "y", "width", "height", "state"])
    assert.equal(restored[k], persisted[k], k);
  frame = page.frameLocator('iframe[title="HTML 交互块"]');
  assert.equal(
    await frame.getByLabel("我的想法").inputValue(),
    "画板内 <HTML>，刷新后仍在",
  );
  assert.equal(await frame.locator("#count").innerText(), "3");
  passed("server file reload restores HTML, geometry and state");
  await page.screenshot({ path: new URL("html81-desktop.png", out).pathname });
  await page.setViewportSize({ width: 1000, height: 760 });
  await page.getByTestId("viewport").click({ position: { x: 30, y: 140 } });
  await page.keyboard.press("Shift+1");
  await page.screenshot({ path: new URL("html81-narrow.png", out).pathname });
  assert.equal(
    await page
      .getByRole("button", { name: "＋ HTML", exact: true })
      .isVisible(),
    true,
  );
  passed("narrow desktop toolbar");
  await page.setViewportSize({ width: 1600, height: 1000 });
  const popup = page.waitForEvent("popup");
  await page.getByTitle("View mode (G V)", { exact: true }).click();
  const viewer = await popup;
  const viewFrame = viewer.frameLocator('iframe[title="HTML 交互块"]');
  await viewFrame.locator("#count").waitFor();
  const viewBefore = Number(await viewFrame.locator("#count").innerText());
  await viewFrame.getByRole("button", { name: "点击 +1", exact: true }).click();
  assert.equal(
    Number(await viewFrame.locator("#count").innerText()),
    viewBefore + 1,
  );
  await viewer.screenshot({ path: new URL("html81-viewer.png", out).pathname });
  report.viewer = viewer.url();
  passed("prototype viewer interaction without file writes");
  await viewer.close();
  assert.equal((await shape()).state, restored.state);
  await page.setViewportSize({ width: 1600, height: 1000 });
  assert.deepEqual(report.errors, []);
  report.ok = true;
  report.url = url;
  report.geometry = restored;
} catch (e) {
  report.failure = String(e.stack);
  throw e;
} finally {
  await fs.writeFile(
    new URL("html81-live-report.json", out),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  console.log(JSON.stringify(report));
}
