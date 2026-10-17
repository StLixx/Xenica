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
        : "<html><head><meta charset=\"utf-8\"><script type=\"module\" src=\"/overlay.js\"></script></head><body><button onclick=\"window.dispatchEvent(new CustomEvent('xenica-html-command',{detail:{action:'insert',id:'one'}}))\">＋ HTML</button><button onclick=\"window.dispatchEvent(new CustomEvent('xenica-html-command',{detail:{action:'enter',id:'one'}}))\">进入交互</button><button onclick=\"window.dispatchEvent(new CustomEvent('xenica-html-command',{detail:{action:'exit',id:'one'}}))\">返回画布</button><button onclick=\"window.dispatchEvent(new CustomEvent('xenica-html-command',{detail:{action:'edit',id:'one'}}))\">编辑 HTML</button><div data-testid=\"viewport\" style=\"position:relative;margin-left:250px;height:900px;overflow:hidden;pointer-events:none\"><div style=\"position:absolute;inset:0;pointer-events:auto\"></div><xenica-html-embed-layer></xenica-html-embed-layer></div></body></html>",
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
  const clickInFrame = async (label) => {
    const outer = await page.locator("iframe").boundingBox();
    const inner = await frame
      .getByRole("button", { name: label, exact: true })
      .evaluate((el) => el.getBoundingClientRect().toJSON());
    const width = await frame.locator("html").evaluate(() => window.innerWidth);
    const scale = outer.width / width;
    await page.mouse.click(
      outer.x + (inner.x + inner.width / 2) * scale,
      outer.y + (inner.y + inner.height / 2) * scale,
    );
  };

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
  await page.mouse.click(300, 50);
  await page.getByRole("button", { name: "进入交互", exact: true }).waitFor();
  await page.getByRole("button", { name: "进入交互", exact: true }).click();
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
  await clickInFrame("点击 +1");
  assert.equal(
    await page.frameLocator("iframe").locator("#count").innerText(),
    "3",
  );
  let expected = 3;
  for (const zoom of [0.08, 0.25, 0.5, 1.1, 1.0954545454545455, 1.3, 2]) {
    await page.evaluate((z) => {
      window.ctx.zoom = z;
      document.querySelector("xenica-html-embed-layer").setContext(window.ctx);
    }, zoom);
    assert.equal(
      await page
        .frameLocator("iframe")
        .locator("html")
        .evaluate(() => window.innerWidth),
      640,
    );
    assert.equal(
      await page
        .frameLocator("iframe")
        .locator("html")
        .evaluate(() => matchMedia("(min-width:600px)").matches),
      true,
    );
    await clickInFrame("点击 +1");
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
  await page.evaluate(() => {
    window.ctx.paletteSize = 80;
    document.querySelector("xenica-html-embed-layer").setContext(window.ctx);
  });
  assert.equal(
    await page
      .locator("xenica-html-embed-layer")
      .evaluate(
        (el) => getComputedStyle(el.shadowRoot.querySelector(".bar")).display,
      ),
    "none",
  );
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
