import fs from "node:fs";
import assert from "node:assert/strict";
const root = "/mnt/HDD/affine-mcp-91-sandbox";
const config = JSON.parse(fs.readFileSync(root + "/adapter.json"));
assert.equal(config.upstream_url, "http://127.0.0.1:3091");
const url = "http://127.0.0.1:8893/rpc";
const request = async (data, actor = "security-client-a") => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + config.bridge_secret,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...data, actor }),
  });
  return response.json();
};
assert.equal((await fetch(url, { method: "POST", body: "{}" })).status, 401);
for (const tool of ["delete_doc", "publish_doc", "sign_in"])
  assert.equal(
    (await request({ action: "call", tool, args: {} })).mcp.structuredContent
      .code,
    "UNKNOWN_TOOL",
  );
const cross = await request({
  action: "call",
  tool: "list_docs",
  args: { workspaceId: "another-workspace" },
});
assert.equal(cross.mcp.structuredContent.code, "INVALID_ARGUMENTS");
assert.equal(
  (
    await request({
      action: "call",
      tool: "read_image",
      args: {
        docId: "valid-doc",
        blockId: "valid-block",
        url: "https://example.test/secret",
      },
    })
  ).mcp.structuredContent.code,
  "INVALID_ARGUMENTS",
);
const write = {
  action: "call",
  tool: "create_doc",
  args: {
    title: "MCP91 persistent replay test",
    idempotency_key: "persistent-replay-security-v1",
  },
};
const first = (await request(write)).mcp;
assert(!first.isError, JSON.stringify(first));
assert.deepEqual((await request(write)).mcp, first);
assert.equal(
  (await request({ ...write, args: { ...write.args, title: "overwritten" } }))
    .mcp.structuredContent.code,
  "IDEMPOTENCY_KEY_REUSED",
);
const other = (await request(write, "security-client-b")).mcp;
assert(!other.isError);
assert.notEqual(other.structuredContent.docId, first.structuredContent.docId);
fs.writeFileSync(
  root + "/security-report.json",
  JSON.stringify({
    anonymousDenied: true,
    unknownDenied: true,
    crossWorkspaceDenied: true,
    arbitraryImageUrlDenied: true,
    idempotentReplay: true,
    actorIsolation: true,
    docId: first.structuredContent.docId,
    completed: new Date().toISOString(),
  }),
  { mode: 0o600 },
);
console.log(
  "PASS anonymous, tool policy, workspace, image boundary, replay and distinct actors",
);
