import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
assert.ok(
  process.env.TEST_URL?.includes(
    "file-id=21312d73-8dbe-8051-8008-cd6a4d3f9784",
  ),
  "Only the isolated feedback regression file may be mutated",
);
const b = await chromium.launch({
  headless: true,
  executablePath:
    "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
try {
  const c = await b.newContext({
      storageState: "/var/lib/penpot-ops/html81-auth.json",
      viewport: { width: 1600, height: 1000 },
    }),
    p = await c.newPage();
  await p.goto(process.env.TEST_URL);
  await p.locator('iframe[title="HTML 交互块"]').waitFor();
  const layer = p.locator("xenica-html-embed-layer");
  const before = await layer.evaluate((el) =>
    el.context.shapes.map((s) => s.id),
  );
  assert.equal(before.length, 1);
  await p.getByRole("button", { name: "＋ HTML", exact: true }).click();
  await p.getByRole("button", { name: "插入画板", exact: true }).click();
  await p.waitForFunction(
    () =>
      document.querySelector("xenica-html-embed-layer").context.shapes
        .length === 2,
  );
  const id = await layer.evaluate(
    (el, old) => el.context.shapes.find((s) => !old.includes(s.id)).id,
    before,
  );
  const card = p.locator(`.card[data-shape-id="${id}"]`);
  const box = await card.boundingBox();
  await p.mouse.dblclick(box.x + 40, box.y + 40);
  await p.getByRole("button", { name: "返回画布", exact: true }).waitFor();
  const nativeType = await p.evaluate(async (id) => {
    const { $APP: a } = await import(
      `/js/shared.js?version=${globalThis.penpotVersionTag}`
    );
    const objects = a.cljs.core.deref(a.app.main.refs.workspace_page_objects);
    const shape = a.cljs.core.get(objects, a.app.common.uuid.uuid(id));
    return String(a.cljs.core.get(shape, a.cljs.core.keyword("type")));
  }, id);
  assert.equal(nativeType, ":rect");
  await card.frameLocator("iframe").getByLabel("我的想法").press("Escape");
  await p.keyboard.press("Delete");
  await p.waitForFunction(
    () =>
      document.querySelector("xenica-html-embed-layer").context.shapes
        .length === 1,
  );
  await p.getByTitle("Saved", { exact: true }).waitFor();
  console.log(
    JSON.stringify({
      ok: true,
      nativeType,
      scenario:
        "native double click enters HTML without converting the new rectangle to a vector path",
    }),
  );
} finally {
  await b.close();
}
