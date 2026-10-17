import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const testUrl = process.env.TEST_URL;
const fixture = JSON.parse(
  await fs.readFile("/var/lib/penpot-ops/html81-third-clone.json", "utf8"),
);
assert.ok(
  testUrl?.includes("file-id=" + fixture.fileId),
  "Use the registered isolated regression copy",
);
const b = await chromium.launch({
  headless: true,
  executablePath:
    "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const report = { ok: false, scenarios: [], errors: [] };
let p;
try {
  const c = await b.newContext({
    storageState: "/var/lib/penpot-ops/html81-auth.json",
    viewport: { width: 1350, height: 1039 },
  });
  if (process.env.PREVIEW_ORIGIN)
    await c.route("https://penpot.truebigsand.top/**", async (r) => {
      const u = new URL(r.request().url());
      await r.fulfill({
        response: await r.fetch({
          url: process.env.PREVIEW_ORIGIN + u.pathname + u.search,
        }),
      });
    });
  p = await c.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  await p.goto(testUrl);
  const l = p.locator("xenica-html-embed-layer");
  await p.locator('iframe[title="HTML 交互块"]').first().waitFor();
  const snapshot = () =>
    l.evaluate((el) => ({
      selected: el.context.selected,
      active: el.active,
      zoom: el.context.zoom,
      shapes: el.context.shapes,
    }));
  const native = () =>
    p.evaluate(async () => {
      const { $APP: a } = await import(
        "/js/shared.js?version=" + globalThis.penpotVersionTag
      );
      const values = a.cljs.core.clj__GT_js(
        a.cljs.core.deref(a.app.main.refs.workspace_page_objects),
      );
      return Object.fromEntries(
        Object.values(values).map((o) => [String(o.id), o]),
      );
    });
  const titlePoint = async (id) => {
    const box = await p.locator("#frame-title-" + id).boundingBox();
    assert.ok(box);
    return { x: box.x + 15, y: box.y + 7 };
  };
  const selectBoard = async (id) => {
    const pt = await titlePoint(id);
    await p.mouse.move(pt.x, pt.y);
    await p.waitForTimeout(180);
    await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(120);
    assert.deepEqual((await snapshot()).selected, [id]);
  };
  const drag = async (from, dx, dy) => {
    await p.mouse.move(from.x, from.y);
    await p.waitForTimeout(180);
    await p.mouse.down();
    await p.waitForTimeout(100);
    await p.mouse.move(from.x + dx, from.y + dy, { steps: 15 });
    await p.mouse.up();
    await p.waitForTimeout(180);
  };
  const resize = async (dx, dy) => {
    const r = await p
      .locator('[data-position="bottom-right"]')
      .first()
      .boundingBox();
    assert.ok(r);
    await drag({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, dx, dy);
  };
  await p.getByTestId("viewport").click({ position: { x: 20, y: 180 } });
  await p.keyboard.press("Shift+1");
  await p.waitForTimeout(200);
  assert.equal(await l.locator(".select-embed").count(), 0);
  assert.equal(
    await l.evaluate(
      (el) => getComputedStyle(el.shadowRoot.querySelector(".bar")).display,
    ),
    "none",
  );
  await p.getByRole("button", { name: "更多工具", exact: true }).click();
  await p
    .getByRole("menuitem", { name: "将 HTML 固定到工具栏", exact: true })
    .click();
  await p.getByRole("button", { name: "嵌入 HTML", exact: true }).waitFor();
  report.scenarios.push(
    "native More menu and optional pinned toolbar tool replace floating UI",
  );
  const old = (await snapshot()).shapes[0];
  const fid = old.frameId;
  await selectBoard(fid);
  const f0 = (await native())[fid];
  await resize(-18, -14);
  const f1 = (await native())[fid];
  assert.ok(
    f1.width < f0.width - 20 && f1.height < f0.height - 20,
    JSON.stringify({ f0: f0.width, f1: f1.width }),
  );
  await resize(12, 10);
  const f2 = (await native())[fid];
  assert.ok(f2.width > f1.width + 20);
  report.scenarios.push("HTML Board native handles shrink and enlarge");
  await selectBoard(fid);
  const point = await titlePoint(fid);
  const before = (await native())[fid];
  await drag(point, 24, 20);
  const moved = (await native())[fid];
  assert.ok(
    Math.abs(moved.x - before.x) > 20 && Math.abs(moved.y - before.y) > 20,
    JSON.stringify({
      before: [before.x, before.y],
      after: [moved.x, moved.y],
      selected: (await snapshot()).selected,
    }),
  );
  report.scenarios.push("HTML Board title drag moves Board and HTML together");
  await p.getByRole("button", { name: "进入交互", exact: true }).click();
  assert.equal((await snapshot()).active, old.id);
  const html0 = (await snapshot()).shapes.find((s) => s.id === old.id);
  await resize(-14, -10);
  const html1 = (await snapshot()).shapes.find((s) => s.id === old.id);
  assert.ok(html1.width < html0.width - 10 && html1.height < html0.height - 10);
  assert.equal((await snapshot()).active, null);
  await resize(14, 10);
  const html2 = (await snapshot()).shapes.find((s) => s.id === old.id);
  assert.ok(html2.width > html1.width + 10);
  assert.equal(html2.html, html0.html);
  assert.equal(html2.state, html0.state);
  report.scenarios.push(
    "native HTML element handles shrink and enlarge after interaction without changing content",
  );
  await p.getByRole("button", { name: "进入交互", exact: true }).click();

  await selectBoard(fid);
  assert.equal((await snapshot()).active, null);
  await resize(-10, -8);
  report.scenarios.push(
    "selecting Board exits HTML interaction and restores native resize",
  );
  await selectBoard(fid);
  for (let i = 0; i < 16 && (await snapshot()).zoom > 0.085; i++) {
    await p.keyboard.press("-");
    await p.waitForTimeout(80);
  }
  assert.ok((await snapshot()).zoom <= 0.085);
  await selectBoard(fid);
  const tiny0 = (await native())[fid];
  await resize(-14, -12);
  const tiny1 = (await native())[fid];
  assert.ok(tiny1.width < tiny0.width - 10);
  await drag(await titlePoint(fid), 20, 15);
  const tiny2 = (await native())[fid];
  assert.ok(Math.abs(tiny2.x - tiny1.x) > 10);
  report.scenarios.push(
    "at eight percent canvas zoom the HTML Board still resizes and moves natively",
  );
  await p.keyboard.press("Shift+1");
  await p.waitForTimeout(200);
  const objects = await native();
  const other = Object.keys(objects).find(
    (id) =>
      objects[id].type === "frame" &&
      id !== fid &&
      id !== "00000000-0000-0000-0000-000000000000",
  );
  assert.ok(other);
  await selectBoard(other);
  const board = (await native())[other];
  const count = (await snapshot()).shapes.length;
  const previousIds = new Set((await snapshot()).shapes.map((s) => s.id));
  await p
    .getByRole("button", { name: "在此 Board 插入 HTML", exact: true })
    .click();
  await p.getByRole("button", { name: "插入画板", exact: true }).click();
  await p.waitForFunction(
    (n) =>
      document.querySelector("xenica-html-embed-layer").context.shapes
        .length === n,
    count + 1,
  );
  const fresh = (await snapshot()).shapes.find((s) => !previousIds.has(s.id));
  assert.ok(fresh);
  assert.equal(fresh.frameId, other);
  assert.ok(Math.abs(fresh.width - board.width) < 0.01);
  assert.ok(Math.abs(fresh.height - board.height) < 0.01);
  report.scenarios.push(
    "second Board sidebar inserts into the explicitly selected Board",
  );
  const frame = p
    .frameLocator(`iframe[title="HTML 交互块"]`)
    .nth((await snapshot()).shapes.findIndex((s) => s.id === fresh.id));
  await p.getByRole("button", { name: "进入交互", exact: true }).click();
  await frame.getByLabel("我的想法").fill("原生工具与 Board 操作回归");
  const clickInFrame = async () => {
    const state = await snapshot();
    const index = state.shapes.findIndex((s) => s.id === fresh.id),
      target = p.locator('iframe[title="HTML 交互块"]').nth(index),
      outer = await target.boundingBox();
    const inner = await frame
      .getByRole("button", { name: "点击 +1", exact: true })
      .evaluate((el) => el.getBoundingClientRect().toJSON());
    const width = await frame.locator("html").evaluate(() => innerWidth);
    await p.mouse.click(
      outer.x + ((inner.x + inner.width / 2) * outer.width) / width,
      outer.y + ((inner.y + inner.height / 2) * outer.width) / width,
    );
  };
  await clickInFrame();
  assert.equal(await frame.locator("#count").innerText(), "1");
  const logical = Math.round(fresh.width);
  assert.equal(await frame.locator("html").evaluate(() => innerWidth), logical);
  await frame.getByLabel("我的想法").press("Escape");
  await p.waitForTimeout(1300);
  await p.getByTitle("Saved", { exact: true }).waitFor();
  await p.reload();
  await p.locator('iframe[title="HTML 交互块"]').first().waitFor();
  await p.getByRole("button", { name: "嵌入 HTML", exact: true }).waitFor();
  const saved = (await snapshot()).shapes.find((s) => s.id === fresh.id);
  assert.equal(JSON.parse(saved.state).idea, "原生工具与 Board 操作回归");
  assert.equal(JSON.parse(saved.state).count, 1);
  report.scenarios.push(
    "HTML content, state, geometry and toolbar preference survive reload",
  );
  await selectBoard(other);
  await p.keyboard.press("Shift+2");
  await p.waitForTimeout(180);
  await p.screenshot({ path: "output/playwright/html81-native-ui.png" });
  await p.setViewportSize({ width: 1000, height: 760 });
  await p.keyboard.press("Shift+2");
  await p.waitForTimeout(180);
  const more = p.getByRole("button", { name: "更多工具", exact: true });
  const mb = await more.boundingBox(),
    vb = await p.getByTestId("viewport").boundingBox();
  assert.ok(mb.x >= vb.x && mb.x + mb.width <= vb.x + vb.width);
  await more.click();
  await p.getByRole("menuitem", { name: "嵌入 HTML", exact: true }).waitFor();
  await p.screenshot({ path: "output/playwright/html81-native-ui-menu.png" });
  await p.keyboard.press("Escape");

  await p.screenshot({ path: "output/playwright/html81-native-ui-narrow.png" });
  report.scenarios.push(
    "desktop and narrow native controls inspected without a floating toolbar",
  );

  await p.setViewportSize({ width: 1350, height: 1039 });
  await selectBoard(other);
  const popup = p.waitForEvent("popup");
  await p.getByTitle("View mode (G V)", { exact: true }).click();
  const viewer = await popup;
  await viewer.locator('iframe[title="HTML 交互块"]').first().waitFor();
  await viewer.waitForTimeout(200);
  const target = viewer
    .locator("xenica-html-embed-layer")
    .locator(".clip")
    .last()
    .locator("iframe");
  const vf = await (await target.elementHandle()).contentFrame();
  const initial = Number(await vf.locator("#count").innerText());
  const outer = await target.boundingBox();
  const inner = await vf
    .getByRole("button", { name: "点击 +1", exact: true })
    .evaluate((el) => el.getBoundingClientRect().toJSON());
  const width = await vf.evaluate(() => innerWidth);
  await viewer.mouse.click(
    outer.x + ((inner.x + inner.width / 2) * outer.width) / width,
    outer.y + ((inner.y + inner.height / 2) * outer.width) / width,
  );
  await vf.waitForFunction(
    (expected) =>
      Number(document.querySelector("#count").textContent) === expected,
    initial + 1,
    { timeout: 3000 },
  );
  await viewer.screenshot({
    path: "output/playwright/html81-native-ui-viewer.png",
  });
  await p.reload();
  await p.locator('iframe[title="HTML 交互块"]').first().waitFor();
  assert.equal(
    (await snapshot()).shapes.find((s) => s.id === fresh.id).state,
    saved.state,
  );
  report.scenarios.push(
    "prototype viewer remains interactive without writing viewer actions to file",
  );
  assert.deepEqual(report.errors, []);
  report.ok = true;
} finally {
  if (p && !report.ok)
    await p.screenshot({ path: "output/playwright/html81-native-failure.png" });
  await b.close();
  console.log(JSON.stringify(report));
}
