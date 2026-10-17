import vm from "node:vm";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
globalThis.HTMLElement = class {};
globalThis.customElements = { define() {} };
const source = readFileSync(new URL("./overlay.js", import.meta.url), "utf8");
const { documentFor, matrixFor, sample, clipPolygonFor, pointInPolygon } =
  await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
test("canvas translation and zoom", () =>
  assert.deepEqual(
    matrixFor({ x: 150, y: 100, width: 400, height: 200 }, { x: 50, y: 20 }, 2),
    [2, 0, 0, 2, 200, 160],
  ));
test("rotated shape uses all four points", () =>
  assert.deepEqual(
    matrixFor(
      {
        width: 100,
        height: 50,
        points: [
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 50, y: 100 },
          { x: 50, y: 0 },
        ],
      },
      { x: 0, y: 0 },
      1,
    ),
    [0, 1, -1, 0, 100, 0],
  ));
test("invalid saved state recovers", () =>
  assert.match(documentFor("<p>hello</p>", "broken"), /state:\{\}/));
test("state cannot break out of bootstrap script", () => {
  const html = documentFor(
    "<p>ok</p>",
    JSON.stringify({ x: "</script><script>bad()</script>" }),
  );
  assert.ok(!html.includes('x":"</script>'));
});
test("generated document closes bootstrap before content", () =>
  assert.ok(
    documentFor("<p>hello</p>", "{}").includes(
      "</script></head><body><p>hello",
    ),
  ));
test("example includes an executable script closing tag", () =>
  assert.ok(sample.includes("</script>")));

test("saved state preserves angle brackets without executing markup", () => {
  const expected = { idea: "a < b </script><script>bad()</script>", count: 3 };
  const doc = documentFor("<p>ok</p>", JSON.stringify(expected));
  const bootstrap = doc.match(/<script>([\s\S]*?)<\/script>/)[1];
  const ctx = {
    window: { addEventListener() {} },
    document: { documentElement: { style: {} } },
    parent: { postMessage() {} },
  };
  vm.runInNewContext(bootstrap, ctx);
  assert.deepEqual(
    JSON.parse(JSON.stringify(ctx.window.penpotEmbed.state)),
    expected,
  );
});

test("converted path with omitted rectangle fields keeps finite geometry", () => {
  const result = matrixFor(
    {
      x: null,
      y: null,
      width: null,
      height: null,
      points: [
        { x: 65, y: 115 },
        { x: 745, y: 115 },
        { x: 745, y: 555 },
        { x: 65, y: 555 },
      ],
    },
    { x: 0, y: 0 },
    2,
  );
  assert.deepEqual(result, [2, 0, 0, 2, 130, 230]);
});

test("nested Board clips intersect in viewport coordinates", () => {
  const rect = (x, y, w, h) => ({
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  });
  const polygon = clipPolygonFor(
    [rect(0, 0, 100, 100), rect(50, 50, 100, 100)],
    { x: 10, y: 20 },
    2,
  );
  assert.equal(pointInPolygon({ x: 130, y: 110 }, polygon), true);
  assert.equal(pointInPolygon({ x: 30, y: 10 }, polygon), false);
  assert.equal(pointInPolygon({ x: 190, y: 190 }, polygon), false);
  assert.equal(clipPolygonFor([], { x: 0, y: 0 }, 1), null);
});
