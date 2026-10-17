const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("./", import.meta.url);
const script = await fs.readFile(new URL("overlay.js", root), "utf8");
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://embed.test/**", (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith(".js")
        ? "text/javascript"
        : "text/html",
      body: route.request().url().endsWith(".js")
        ? script
        : '<html><head><script type="module" src="/overlay.js"></script></head><body><div data-testid="viewport" style="position:relative;margin-left:250px;height:900px;overflow:hidden;pointer-events:none"><div style="position:absolute;inset:0;pointer-events:auto"></div><xenica-html-embed-layer></xenica-html-embed-layer></div></body></html>',
    }),
  );
  await page.goto("http://embed.test/");
  await page.waitForFunction(() =>
    customElements.get("xenica-html-embed-layer"),
  );
  await page.evaluate(() => {
    const layer = document.querySelector("xenica-html-embed-layer");
    window.saved = null;
    window.ctx = {
      fileId: "test",
      pageId: "one",
      shapes: [],
      selected: [],
      vbox: { x: 0, y: 0 },
      zoom: 1,
      readOnly: false,
      viewer: false,
      create(html) {
        this.shapes = [
          {
            id: "one",
            x: 100,
            y: 100,
            width: 640,
            height: 420,
            html,
            state: "{}",
          },
        ];
        this.selected = ["one"];
        layer.setContext(this);
      },
      save(id, key, value) {
        window.saved = { id, key, value };
        this.shapes[0][key] = value;
        layer.setContext(this);
      },
    };
    layer.setContext(window.ctx);
  });
  await page.getByRole("button", { name: "＋ HTML", exact: true }).click();
  await page.getByRole("button", { name: "插入画板", exact: true }).click();
  const initialBox = await page.locator("iframe").boundingBox();
  await page.mouse.dblclick(initialBox.x + 40, initialBox.y + 40);
  await page.getByRole("button", { name: "返回画布", exact: true }).waitFor();
  const frame = page.frameLocator('iframe[title="HTML 交互块"]');
  await frame.getByLabel("我的想法").fill("刷新后仍在");
  await frame.getByRole("button", { name: "点击 +1", exact: true }).click();
  await frame.getByRole("button", { name: "点击 +1", exact: true }).click();
  await page.waitForFunction(() => window.saved?.value?.includes('"count":2'));
  assert.equal(await frame.locator("#count").innerText(), "2");
  assert.equal(
    await frame.locator("body").evaluate(() => {
      try {
        return !!parent.document;
      } catch {
        return false;
      }
    }),
    false,
  );
  await page.getByRole("button", { name: "返回画布", exact: true }).click();
  await page.evaluate(() => {
    const layer = document.querySelector("xenica-html-embed-layer");
    const next = layer.cloneNode();
    layer.replaceWith(next);
    next.setContext(window.ctx);
  });
  await page.getByRole("button", { name: "进入交互", exact: true }).click();
  assert.equal(
    await page.frameLocator("iframe").getByLabel("我的想法").inputValue(),
    "刷新后仍在",
  );
  assert.equal(
    await page.frameLocator("iframe").locator("#count").innerText(),
    "2",
  );
  await page.evaluate(() => {
    window.ctx.zoom = 0.5;
    document.querySelector("xenica-html-embed-layer").setContext(window.ctx);
  });
  assert.ok(
    Math.abs(
      (await page
        .locator("iframe")
        .evaluate((el) => el.getBoundingClientRect().width)) - 320,
    ) <= 2,
  );
  await page
    .frameLocator("iframe")
    .getByRole("button", { name: "点击 +1", exact: true })
    .click();
  assert.equal(
    await page.frameLocator("iframe").locator("#count").innerText(),
    "3",
  );
  let expected = 3;
  for (const zoom of [1.1, 1.0954545454545455, 1.3, 2]) {
    await page.evaluate((z) => {
      window.ctx.zoom = z;
      document.querySelector("xenica-html-embed-layer").setContext(window.ctx);
    }, zoom);
    await page
      .frameLocator("iframe")
      .getByRole("button", { name: "点击 +1", exact: true })
      .click();
    assert.equal(
      await page.frameLocator("iframe").locator("#count").innerText(),
      String(++expected),
    );
  }
  await page.frameLocator("iframe").getByLabel("我的想法").press("Escape");
  await page.waitForFunction(
    () => document.activeElement?.tagName === "XENICA-HTML-EMBED-LAYER",
  );

  await page.getByRole("button", { name: "编辑 HTML", exact: true }).click();
  await page.getByRole("textbox", { name: "HTML 源码" }).fill(" ");
  await page.getByRole("button", { name: "保存 HTML", exact: true }).click();
  assert.equal(await page.getByRole("alert").innerText(), "请输入 HTML 内容。");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      scenarios: [
        "insert",
        "script interaction",
        "input",
        "state restore",
        "sandbox",
        "zoom",
        "empty content",
      ],
    }),
  );
} finally {
  await browser.close();
}
