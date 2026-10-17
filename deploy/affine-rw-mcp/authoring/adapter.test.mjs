import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Journal, READ, WRITE } from "./adapter.mjs";
test("persistent write replay, actor separation and mismatched arguments", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "affine91-journal-"));
  let db = new Journal(path.join(root, "writes.sqlite3")),
    count = 0;
  const invoke = async () => ({
    structuredContent: { docId: "synthetic-" + ++count },
    content: [],
  });
  const first = await db.run(
    "client-a",
    "operation-1",
    "create_doc",
    { title: "original" },
    invoke,
  );
  assert.deepEqual(
    await db.run(
      "client-a",
      "operation-1",
      "create_doc",
      { title: "original" },
      invoke,
    ),
    first,
  );
  assert.equal(count, 1);
  db.close();
  db = new Journal(path.join(root, "writes.sqlite3"));
  assert.deepEqual(
    await db.run(
      "client-a",
      "operation-1",
      "create_doc",
      { title: "original" },
      invoke,
    ),
    first,
  );
  assert.equal(
    (
      await db.run(
        "client-a",
        "operation-1",
        "create_doc",
        { title: "changed" },
        invoke,
      )
    ).structuredContent.code,
    "IDEMPOTENCY_KEY_REUSED",
  );
  await db.run(
    "client-b",
    "operation-1",
    "create_doc",
    { title: "original" },
    invoke,
  );
  assert.equal(count, 2);
  db.close();
  fs.rmSync(root, { recursive: true });
});
test("an uncertain write is never executed a second time after restart", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "affine91-uncertain-"));
  let db = new Journal(path.join(root, "writes.sqlite3")),
    attempts = 0;
  await assert.rejects(
    db.run(
      "a",
      "lost-response",
      "append_block",
      { text: "content" },
      async () => {
        attempts++;
        throw Error("response lost");
      },
    ),
  );
  db.close();
  db = new Journal(path.join(root, "writes.sqlite3"));
  const result = await db.run(
    "a",
    "lost-response",
    "append_block",
    { text: "content" },
    async () => {
      attempts++;
      return {};
    },
  );
  assert.equal(result.structuredContent.code, "WRITE_OUTCOME_UNCERTAIN");
  assert.equal(attempts, 1);
  db.close();
  fs.rmSync(root, { recursive: true });
});
test("the policy contains only the approved authoring surface", () => {
  for (const name of [
    "delete_doc",
    "delete_block",
    "delete_blob",
    "publish_doc",
    "revoke_doc",
    "create_workspace",
    "sign_in",
    "update_settings",
    "update_profile",
    "cleanup_blobs",
    "replace_doc_with_markdown",
  ])
    assert(!READ.has(name) && !WRITE.has(name), name);
  assert(READ.has("read_image"));
  assert(!WRITE.has("read_image"));
  for (const name of READ) assert(!WRITE.has(name));
});

test("native Chinese mindmap labels fit their padded shape bounds", async () => {
  const { pathToFileURL } = await import("node:url");
  const source = process.env.UPSTREAM_ROOT || "/app/upstream";
  const { mutateNativeMindmap } = await import(
    pathToFileURL(source + "/dist/tools/mindmap.js").href
  );
  const Y = await import("yjs");
  const doc = new Y.Doc(),
    values = doc.getMap("elements");
  let seq = 0;
  const helpers = {
    buildSurfaceElementData: (type, index, { text }) => ({
      elementId: "node_" + ++seq,
      data: { type, index, xywh: "[0,0,100,30]", text: new Y.Text(text) },
    }),
    writeSurfaceElement: (map, id, data) =>
      map.set(id, new Y.Map(Object.entries(data))),
    nextSurfaceElementIndex: () => "a" + seq,
  };
  const map = mutateNativeMindmap(
    values,
    "create",
    { text: "数学复习导图", style: 3 },
    helpers,
  );
  const root = values.get(map.rootId),
    box = JSON.parse(root.get("xywh"));
  assert(
    box[2] >= 6 * 16 + 44,
    "CJK label must fit one line plus native horizontal padding",
  );
  assert(box[3] >= 16 + 20, "CJK label must fit vertically");
  doc.destroy();
});
test("collapsed descendants are actually hidden, and reparent/expand restores visibility", async () => {
  const { pathToFileURL } = await import("node:url");
  const source = process.env.UPSTREAM_ROOT || "/app/upstream";
  const { mutateNativeMindmap } = await import(
    pathToFileURL(source + "/dist/tools/mindmap.js").href
  );
  const Y = await import("yjs");
  const doc = new Y.Doc(),
    values = doc.getMap("elements");
  let seq = 0;
  const helpers = {
    buildSurfaceElementData: (type, index, { text }) => ({
      elementId: "node_" + ++seq,
      data: { type, index, xywh: "[0,0,100,30]", text: new Y.Text(text) },
    }),
    writeSurfaceElement: (map, id, data) =>
      map.set(id, new Y.Map(Object.entries(data))),
    nextSurfaceElementIndex: () => "a" + seq,
  };
  const map = mutateNativeMindmap(values, "create", { text: "root" }, helpers);
  const mutate = (op, p) =>
    mutateNativeMindmap(
      values,
      op,
      { mindmapId: map.mindmapId, ...p },
      helpers,
    );
  const parent = mutate("add", { parentId: map.rootId, text: "branch" }).nodeId;
  const child = mutate("add", { parentId: parent, text: "child" }).nodeId;
  mutate("update", { nodeId: parent, collapsed: true });
  assert.equal(
    values.get(child).get("hidden"),
    true,
    "collapsed descendants must have the native hidden field",
  );
  mutate("reparent", { nodeId: child, parentId: map.rootId });
  assert.equal(values.get(child).get("hidden"), false);
  mutate("reparent", { nodeId: child, parentId: parent });
  assert.equal(values.get(child).get("hidden"), true);
  mutate("update", { nodeId: parent, collapsed: false });
  assert.equal(values.get(child).get("hidden"), false);
  doc.destroy();
});
