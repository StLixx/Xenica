// Synthetic sandbox test; never run this suite against the original workspace.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
const root = "/mnt/HDD/affine-mcp-91-sandbox";
const config = JSON.parse(fs.readFileSync(root + "/adapter.json"));
assert.equal(config.upstream_url, "http://127.0.0.1:3091");
const origin = "http://127.0.0.1:8893";
const headers = {
  authorization: "Bearer " + config.bridge_secret,
  "content-type": "application/json",
};
const request = async (data) =>
  await (
    await fetch(origin + "/rpc", {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    })
  ).json();
const tools = (await request({ action: "tools" })).tools;
assert(tools && tools.length > 40);
const definitions = new Map(tools.map((t) => [t.name, t]));
const readNames = JSON.parse(
  fs.readFileSync(new URL("./policy.json", import.meta.url)),
).read;
const callRaw = async (name, args = {}) => {
  const result = await request({
    action: "call",
    tool: name,
    args,
    actor: "sandbox-client-a",
  });
  assert(result.mcp, JSON.stringify(result));
  return result.mcp;
};
const call = async (name, args = {}) => {
  const def = definitions.get(name);
  assert(def, "Tool missing " + name);
  if (!readNames.includes(name)) {
    args = { ...args, idempotency_key: "sandbox-" + randomUUID() };
    if (def.inputSchema.required?.includes("expectedRevision")) {
      const r = await call("read_doc", { docId: args.docId });
      args.expectedRevision = r.revision;
    }
  }
  const result = await callRaw(name, args);
  assert(!result.isError, name + ": " + JSON.stringify(result));
  covered.add(name);
  console.log("PASS", name);
  return result.structuredContent;
};
const covered = new Set();
const report = {
  version: "0.27.4",
  testedAt: new Date().toISOString(),
  toolCount: tools.length,
  scenarios: {},
};
const made = await call("create_doc_from_markdown", {
  title: "MCP91 原生创作兼容性",
  markdown: "# 数学复习\n\n保留段落 **粗体** 与 `代码`。\n\n- 初始任务",
});
report.docId = made.docId;
let doc = await call("read_doc", { docId: made.docId, includeMarkdown: true });
const preserved = doc.blocks.find((b) => b.text?.includes("保留段落"));
const added = await call("append_block", {
  docId: made.docId,
  type: "paragraph",
  text: "只修改这个段落",
});
await call("update_block", {
  docId: made.docId,
  blockId: added.blockId,
  text: [
    { insert: "局部更新", attributes: { bold: true } },
    { insert: "完成" },
  ],
});
doc = await call("read_doc", { docId: made.docId });
assert.deepEqual(
  doc.blocks.find((b) => b.id === preserved.id).deltas,
  preserved.deltas,
);
assert.equal(
  doc.blocks.find((b) => b.id === added.blockId).deltas[0].attributes.bold,
  true,
);
report.scenarios.blockPreservesOthers = true;
const stale = doc.revision;
await call("append_markdown", {
  docId: made.docId,
  markdown: "\n\n新增 **Markdown** 内容",
});
const denied = await callRaw("update_block", {
  docId: made.docId,
  blockId: added.blockId,
  text: "过期覆盖",
  expectedRevision: stale,
  idempotency_key: "stale-" + randomUUID(),
});
assert(denied.isError);
assert.match(JSON.stringify(denied), /STALE_DOCUMENT_REVISION/);
report.scenarios.staleRejected = true;
const table = await call("append_block", {
  docId: made.docId,
  type: "table",
  rows: 2,
  columns: 2,
  tableData: [
    ["科目", "状态"],
    ["数学", "复习中"],
  ],
});
await call("update_table_cell", {
  docId: made.docId,
  blockId: table.blockId,
  row: 1,
  column: 1,
  text: "已完成",
});
const database = await call("append_block", {
  docId: made.docId,
  type: "database",
});
report.database = database;
const schema = await call("read_database_columns", {
  docId: made.docId,
  databaseBlockId: database.blockId,
});
report.databaseSchema = schema;
const db = { docId: made.docId, databaseBlockId: database.blockId };
await call("add_database_column", {
  ...db,
  name: "状态",
  type: "select",
  options: ["复习中", "已完成"],
});
await call("add_database_column", { ...db, name: "分数", type: "number" });
const row = await call("add_database_row", {
  ...db,
  cells: { title: "数学第一章", 状态: "复习中", 分数: 80 },
});
report.databaseRow = row;
await call("update_database_row", {
  ...db,
  rowBlockId: row.rowBlockId,
  cells: { 状态: "已完成", 分数: 95 },
});
const cells = await call("read_database_cells", db);
assert.match(JSON.stringify(cells), /95/);
report.scenarios.databaseNative = true;
const map = await call("create_mindmap", {
  docId: made.docId,
  text: "数学复习导图",
  layout: "right",
  x: 1000,
  y: 200,
});
const target = { docId: made.docId, mindmapId: map.mindmapId };
const a = await call("add_mindmap_node", {
  ...target,
  parentId: map.rootId,
  text: "高等数学",
});
const b = await call("add_mindmap_node", {
  ...target,
  parentId: map.rootId,
  text: "线性代数",
});
const child = await call("add_mindmap_node", {
  ...target,
  parentId: a.nodeId,
  text: "极限",
});
await call("reparent_mindmap_node", {
  ...target,
  nodeId: child.nodeId,
  parentId: b.nodeId,
});
await call("update_mindmap_node", {
  ...target,
  nodeId: b.nodeId,
  collapsed: true,
});
await call("set_mindmap_layout", { ...target, layout: "balance" });
await call("set_mindmap_style", { ...target, style: 3 });
const mapped = await call("get_mindmap", target);
assert(mapped.nodes.find((n) => n.nodeId === b.nodeId).collapsed);
assert.equal(
  mapped.nodes.find((n) => n.nodeId === child.nodeId).parentId,
  b.nodeId,
);
report.scenarios.mindmapNative = true;
report.mindmapId = map.mindmapId;
const shape = await call("add_surface_element", {
  docId: made.docId,
  type: "shape",
  text: "复习计划",
  x: 900,
  y: 800,
  width: 200,
  height: 90,
});
const shape2 = await call("add_surface_element", {
  docId: made.docId,
  type: "shape",
  text: "完成",
  x: 1300,
  y: 800,
  width: 180,
  height: 90,
});
const connector = await call("add_surface_element", {
  docId: made.docId,
  type: "connector",
  sourceId: shape.elementId,
  targetId: shape2.elementId,
});
await call("update_surface_element", {
  docId: made.docId,
  elementId: shape.elementId,
  text: "复习计划已更新",
  x: 880,
});
const canvas = await call("get_edgeless_canvas", { docId: made.docId });
assert.match(JSON.stringify(canvas), /复习计划已更新/);
report.scenarios.canvas = true;
const probe = fs.readFileSync(
  new URL("../../../crates/server/src/routes/probe.png", import.meta.url),
);
const blob = await call("upload_blob", {
  content: probe.toString("base64"),
  encoding: "base64",
  filename: "sandbox-pixel.png",
  contentType: "image/png",
});
const image = await call("append_block", {
  docId: made.docId,
  type: "image",
  sourceId: blob.key,
});
const images = await call("inspect_document_assets", { docId: made.docId });
assert(images.assets.some((i) => i.blockId === image.blockId));
const pixels = await callRaw("read_image", {
  docId: made.docId,
  blockId: image.blockId,
});
assert(!pixels.isError, JSON.stringify(pixels));
assert(
  pixels.content.some((c) => c.type === "image" && c.mimeType === "image/png"),
);
assert.equal(
  createHash("sha256")
    .update(
      Buffer.from(
        pixels.content.find((c) => c.type === "image").data,
        "base64",
      ),
    )
    .digest("hex"),
  createHash("sha256").update(probe).digest("hex"),
);
const attachment = await call("upload_blob", {
  content: "MCP91 合成附件，只用于验证。",
  filename: "compatibility.txt",
  contentType: "text/plain",
});
await call("append_block", {
  docId: made.docId,
  type: "attachment",
  sourceId: attachment.key,
  name: "compatibility.txt",
  mimeType: "text/plain",
  size: attachment.size,
});
report.imageBlockId = image.blockId;
report.scenarios.imagePixels = true;
const folder = await call("create_folder", { name: "MCP91 数学资料" });
const nested = await call("create_folder", {
  name: "待整理",
  parentId: folder.id,
});
const link = await call("add_organize_link", {
  folderId: folder.id,
  type: "doc",
  targetId: made.docId,
});
report.organize = { folder, nested, link };
await call("rename_folder", { folderId: nested.id, name: "已整理" });
await call("move_organize_node", { nodeId: link.id, parentId: nested.id });
const collection = await call("create_collection", { name: "MCP91 复习合集" });
await call("add_doc_to_collection", {
  collectionId: collection.id,
  docId: made.docId,
});
const collected = await call("get_collection", { collectionId: collection.id });
assert.match(JSON.stringify(collected), new RegExp(made.docId));
const tag = await call("create_tag", { tag: "MCP91 数学" });
report.tag = tag;
await call("add_tag_to_doc", { docId: made.docId, tag: "MCP91 数学" });
const tree = await call("list_organize_nodes");
assert.match(JSON.stringify(tree), /已整理/);
report.scenarios.organize = true;
await call("update_table_column_widths", {
  docId: made.docId,
  blockId: table.blockId,
  widths: [180, 200],
});
await call("move_block", {
  docId: made.docId,
  blockId: added.blockId,
  placement: { afterBlockId: preserved.id },
});
await call("set_mindmap_lock", { ...target, locked: true });
await call("set_mindmap_lock", { ...target, locked: false });
const note = await call("append_block", {
  docId: made.docId,
  type: "note",
  markdown: "## 画布笔记\n支持原生编辑",
  x: 900,
  y: 1100,
  width: 420,
});
await call("update_edgeless_block", {
  docId: made.docId,
  blockId: note.blockId,
  x: 850,
  y: 1100,
  background: "--affine-note-background-blue",
});
const frame = await call("append_block", {
  docId: made.docId,
  type: "frame",
  text: "复习流程",
  childElementIds: [shape.elementId, shape2.elementId, connector.elementId],
});
await call("update_frame_children", {
  docId: made.docId,
  blockId: frame.blockId,
  childElementIds: [
    shape.elementId,
    shape2.elementId,
    connector.elementId,
    note.blockId,
  ],
});
const composed = await call("compose_database_from_intent", {
  docId: made.docId,
  intent: "task_board",
  title: "复习任务",
  seedRows: [{ title: "函数极限", Status: "Todo" }],
});
report.composedDatabase = composed;
await call("update_collection", {
  collectionId: collection.id,
  name: "MCP91 复习合集已更新",
});
await call("remove_doc_from_collection", {
  collectionId: collection.id,
  docId: made.docId,
});
await call("add_doc_to_collection", {
  collectionId: collection.id,
  docId: made.docId,
});
await call("remove_tag_from_doc", { docId: made.docId, tag: "MCP91 数学" });
await call("add_tag_to_doc", { docId: made.docId, tag: "MCP91 数学" });
const parent = await call("create_doc", { title: "MCP91 资料索引" });
await call("move_doc", { docId: made.docId, toParentDocId: parent.docId });
for (const name of [
  "get_doc",
  "analyze_doc_fidelity",
  "export_with_fidelity_report",
  "export_doc_markdown",
  "list_children",
  "list_surface_elements",
])
  await call(name, { docId: made.docId });
for (const name of [
  "list_tags",
  "list_collections",
  "list_docs",
  "get_capabilities",
])
  await call(name);
await call("list_workspace_tree", { depth: 1 });
await call("search_docs", { query: "MCP91", limit: 5 });
covered.add("read_image");
report.coveredTools = [...covered].sort();
assert.deepEqual(
  tools.map((t) => t.name).filter((name) => !covered.has(name)),
  [],
  "Every enabled tool requires a successful live call",
);

fs.writeFileSync(
  root + "/compatibility-report.json",
  JSON.stringify(report, null, 2),
  { mode: 0o600 },
);
console.log(
  "REPORT",
  JSON.stringify({
    docId: report.docId,
    toolCount: report.toolCount,
    covered: report.coveredTools.length,
    scenarios: report.scenarios,
  }),
);
