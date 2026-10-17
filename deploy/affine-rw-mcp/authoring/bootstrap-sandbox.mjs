// Only creates synthetic data in the dedicated loopback 0.27.4 sandbox.
import fs from "node:fs";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const root = process.env.SANDBOX_ROOT || "/mnt/HDD/affine-mcp-91-sandbox";
const source = process.env.UPSTREAM_ROOT;
assert(source, "UPSTREAM_ROOT required");
const account = JSON.parse(fs.readFileSync(root + "/account.json"));
const base = "http://127.0.0.1:3091";
for (let attempt = 0; ; attempt++) {
  try {
    const r = await fetch(base + "/", { signal: AbortSignal.timeout(3000) });
    if (r.ok) break;
  } catch {}
  if (attempt >= 30) throw Error("Sandbox startup timeout");
  await new Promise((r) => setTimeout(r, 2000));
}
const response = await fetch(base + "/api/setup/create-admin-user", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(account),
});
if (!response.ok && response.status !== 403)
  throw Error("Sandbox setup HTTP " + response.status);
const transport = new StdioClientTransport({
  command: "node",
  args: [source + "/dist/index.js"],
  cwd: source,
  env: {
    ...process.env,
    AFFINE_BASE_URL: base,
    AFFINE_EMAIL: account.email,
    AFFINE_PASSWORD: account.password,
    AFFINE_CLIENT_VERSION: "0.27.4",
    AFFINE_WS_CLIENT_VERSION: "0.27.4",
    AFFINE_LOGIN_AT_START: "sync",
    XDG_CONFIG_HOME: root + "/xdg",
  },
  stderr: "pipe",
});
const log = fs.createWriteStream(root + "/bootstrap-upstream.log", {
  flags: "a",
  mode: 0o600,
});
transport.stderr.on("data", (data) => log.write(data));
const client = new Client({
  name: "xenica-91-sandbox-bootstrap",
  version: "1",
});
try {
  await client.connect(transport);
  let config;
  if (fs.existsSync(root + "/adapter.json"))
    config = JSON.parse(fs.readFileSync(root + "/adapter.json"));
  else {
    const result = await client.callTool({
      name: "create_workspace",
      arguments: { name: "Xenica 91 disposable compatibility test" },
    });
    assert(!result.isError, JSON.stringify(result));
    const workspace = result.structuredContent;
    assert(workspace.id);
    const user = await client.callTool({ name: "current_user", arguments: {} });
    const owner = user.structuredContent;
    config = {
      ...account,
      upstream_url: base,
      public_url: base,
      workspace_id: workspace.id,
      owner_id: owner.id,
      bridge_secret: (await import("node:crypto"))
        .randomBytes(32)
        .toString("base64url"),
      state_path: root + "/adapter-state/authoring.sqlite3",
      port: 8893,
      host: "127.0.0.1",
    };
    fs.writeFileSync(root + "/adapter.json", JSON.stringify(config), {
      mode: 0o600,
    });
  }
  console.log(
    JSON.stringify({
      sandbox: true,
      version: "0.27.4",
      workspace: config.workspace_id,
      ownerConfigured: Boolean(config.owner_id),
    }),
  );
} finally {
  await client.close();
  log.end();
}
