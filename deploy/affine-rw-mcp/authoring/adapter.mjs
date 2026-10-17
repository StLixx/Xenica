// Pinned upstream library, bounded /rpc adapter. No public or arbitrary MCP proxy.
import fs from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import * as Y from "yjs";
const POLICY = JSON.parse(
  fs.readFileSync(new URL("./policy.json", import.meta.url)),
);
export const READ = new Set(POLICY.read),
  WRITE = new Set(POLICY.write);
const ALLOWED = new Set([...READ, ...WRITE]);
const KEY = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const ID = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const MAX_BODY = 8 * 1024 * 1024,
  MAX_IMAGE = 4 * 1024 * 1024;
const root = process.env.UPSTREAM_ROOT || "/app/upstream";
const lib = (p) => import(pathToFileURL(root + "/dist/" + p + ".js").href);
export const failure = (code, message = code) => ({
  isError: true,
  content: [{ type: "text", text: code }],
  structuredContent: {
    ok: false,
    error: message,
    code,
    retryable: false,
    recoveryGuidance: message,
  },
});
const stable = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
export class Journal {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS operations (actor TEXT, ikey TEXT, fingerprint TEXT, result TEXT, PRIMARY KEY(actor,ikey))",
    );
  }
  async run(actor, key, name, args, action) {
    const fingerprint = createHash("sha256")
      .update(stable({ name, args }))
      .digest("hex");
    const old = this.db
      .prepare("SELECT * FROM operations WHERE actor=? AND ikey=?")
      .get(actor, key);
    if (old) {
      if (old.fingerprint !== fingerprint)
        return failure("IDEMPOTENCY_KEY_REUSED");
      return old.result
        ? JSON.parse(old.result)
        : failure(
            "WRITE_OUTCOME_UNCERTAIN",
            "Do not repeat this write with a new key. Inspect the document and reconcile first; the intent is persisted.",
          );
    }
    this.db
      .prepare("INSERT INTO operations VALUES (?,?,?,NULL)")
      .run(actor, key, fingerprint);
    // A thrown error or process exit leaves an uncertain intent, never a retry.
    const result = await action();
    this.db
      .prepare("UPDATE operations SET result=? WHERE actor=? AND ikey=?")
      .run(JSON.stringify(result), actor, key);
    return result;
  }
  close() {
    this.db.close();
  }
}
export async function build(config) {
  process.env.AFFINE_CLIENT_VERSION = "0.27.4";
  process.env.AFFINE_WS_CLIENT_VERSION = "0.27.4";
  const [
    { GraphQLClient },
    { AuthSession },
    { coordinateTool },
    { withToolErrors, text, stripSchemaDialect },
    { toolAnnotationsFor },
    { toolOutputSchemaFor },
    ws,
  ] = await Promise.all([
    lib("graphqlClient"),
    lib("authSession"),
    lib("toolCoordination"),
    lib("util/mcp"),
    lib("toolSurface"),
    lib("toolOutputSchemas"),
    lib("ws"),
  ]);
  const auth = new AuthSession({
    baseUrl: config.upstream_url,
    email: config.email,
    password: config.password,
  });
  const gql = new GraphQLClient({
    endpoint: config.upstream_url + "/graphql",
    baseUrl: config.public_url,
    authProvider: () => auth.ready(),
  });
  const identity = async () => {
    const data = await gql.request(
      "query { currentUser { id } workspaces { id } }",
    );
    if (
      data.currentUser?.id !== config.owner_id ||
      !data.workspaces?.some((w) => w.id === config.workspace_id)
    )
      throw Error("UPSTREAM_IDENTITY_MISMATCH");
  };
  const actors = new AsyncLocalStorage();
  const journal = new Journal(config.state_path || "/state/authoring.sqlite3");
  const server = new McpServer({
    name: "Xenica AFFiNE native authoring",
    version: "0.2.0",
  });
  const original = server.registerTool.bind(server);
  let tail = Promise.resolve();
  const serial = (fn) => {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  const schemas = new Map();
  server.registerTool = (name, options, handler) => {
    if (!ALLOWED.has(name)) return;
    const readonly = READ.has(name);
    const coordinated = coordinateTool(
      name,
      options.inputSchema || {},
      handler,
      { gql, endpoint: gql.endpoint, workspaceId: config.workspace_id },
    );
    let schema = { ...coordinated.inputSchema };
    if (schema.workspaceId)
      schema.workspaceId = z
        .literal(config.workspace_id)
        .optional()
        .describe("Fixed authorized workspace; omit this field.");
    if (schema.expectedRevision)
      schema.expectedRevision = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .describe(
          "Required latest read_doc revision; read again after any browser/client change.",
        );
    if (name === "append_block") {
      schema.type = z.enum([
        "paragraph",
        "heading",
        "quote",
        "list",
        "code",
        "divider",
        "callout",
        "latex",
        "table",
        "bookmark",
        "image",
        "attachment",
        "database",
        "data_view",
        "surface_ref",
        "frame",
        "edgeless_text",
        "note",
        "embed_linked_doc",
      ]);
      for (const key of ["html", "design", "iframeUrl"]) delete schema[key];
    }
    if (!readonly)
      schema.idempotency_key = KEY.describe(
        "Unique write intent key. Repeat identical args/key only; an uncertain result must be inspected, never blindly retried.",
      );
    const validation = z.object(schema).strict();
    schemas.set(name, validation);
    const safeHandler = withToolErrors(coordinated.handler, {
      toolName: name,
      authMode: "oauth",
      readOnly: readonly,
    });
    return original(
      name,
      {
        ...options,
        inputSchema: schema,
        outputSchema: toolOutputSchemaFor(name),
        annotations: {
          ...toolAnnotationsFor(name),
          openWorldHint: false,
          idempotentHint: true,
        },
      },
      async (args, extra) =>
        serial(async () => {
          await identity();
          const { idempotency_key, ...input } = validation.parse(args);
          const invoke = async () => {
            const payload = { ...input, workspaceId: config.workspace_id };
            if (name === "upload_blob") {
              const { decodeBlobContent } = await lib("tools/blobStorage");
              payload.filename = createHash("sha256")
                .update(
                  decodeBlobContent(
                    payload.content,
                    payload.encoding,
                    MAX_IMAGE,
                  ),
                )
                .digest("base64url");
            }
            return safeHandler(payload, extra);
          };
          return readonly
            ? invoke()
            : journal.run(
                actors.getStore() || "internal",
                idempotency_key,
                name,
                input,
                invoke,
              );
        }),
    );
  };
  const [
    { registerDocTools },
    { registerOrganizeTools },
    { registerBlobTools },
  ] = await Promise.all([
    lib("tools/docs"),
    lib("tools/organize"),
    lib("tools/blobStorage"),
  ]);
  registerDocTools(server, gql, {
    workspaceId: config.workspace_id,
    toolSurface: { profile: "xenica-authoring", enabledTools: [...ALLOWED] },
  });
  registerOrganizeTools(server, gql, { workspaceId: config.workspace_id });
  registerBlobTools(server, gql, {
    maxDecodedBytes: 4 * 1024 * 1024,
    timeoutMs: 30000,
    maxResponseBytes: 1024 * 1024,
  });
  const assets = async (docId) => {
    const { endpoint, cookie, bearer } = await gql.getConnectionAuth();
    const socket = await ws.connectWorkspaceSocket(
      ws.wsUrlFromGraphQLEndpoint(endpoint),
      cookie,
      bearer,
    );
    const doc = new Y.Doc(),
      workspace = new Y.Doc();
    try {
      await ws.joinWorkspace(socket, config.workspace_id);
      const [snapshot, rootSnapshot] = await Promise.all([
        ws.loadDoc(socket, config.workspace_id, docId),
        ws.loadDoc(socket, config.workspace_id, config.workspace_id),
      ]);
      if (!snapshot.missing || !rootSnapshot.missing)
        throw Error("DOCUMENT_NOT_FOUND");
      Y.applyUpdate(doc, Buffer.from(snapshot.missing, "base64"));
      Y.applyUpdate(workspace, Buffer.from(rootSnapshot.missing, "base64"));
      const pages = workspace.getMap("meta").get("pages");
      if (
        !pages
          ?.toArray()
          .some((page) => page.get("id") === docId && !page.get("inTrash"))
      )
        throw Error("DOCUMENT_NOT_ACCESSIBLE");
      return [...doc.getMap("blocks")]
        .filter(([, b]) =>
          ["affine:image", "affine:attachment"].includes(b.get("sys:flavour")),
        )
        .map(([id, b]) => ({
          blockId: id,
          flavour: b.get("sys:flavour"),
          sourceId: b.get("prop:sourceId"),
          caption: b.get("prop:caption") || "",
          name: b.get("prop:name") || "",
          width: b.get("prop:width"),
          height: b.get("prop:height"),
        }));
    } finally {
      doc.destroy();
      workspace.destroy();
      socket.disconnect();
    }
  };
  const custom = (name, schema, description, handler) => {
    schemas.set(name, z.object(schema).strict());
    original(
      name,
      {
        title:
          name === "read_image"
            ? "Read document image pixels"
            : "Inspect document images and attachments",
        description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args) => {
        await identity();
        return handler(schemas.get(name).parse(args));
      },
    );
  };
  custom(
    "inspect_document_assets",
    { docId: ID },
    "List native image/attachment block IDs in a document. Use read_image with an image blockId to see its pixels.",
    async ({ docId }) => text({ docId, assets: await assets(docId) }),
  );
  custom(
    "read_image",
    { docId: ID, blockId: ID },
    "Return actual PNG/JPEG/GIF/WebP image pixels from an image block in the authorized document. No arbitrary URL/key access. Maximum 4 MiB.",
    async ({ docId, blockId }) => {
      const image = (await assets(docId)).find(
        (b) => b.blockId === blockId && b.flavour === "affine:image",
      );
      if (
        !image ||
        typeof image.sourceId !== "string" ||
        !(
          /^[A-Za-z0-9_.-]{1,256}$/.test(image.sourceId) &&
          ![".", ".."].includes(image.sourceId)
        )
      )
        return failure("IMAGE_BLOCK_NOT_FOUND");
      const { headers } = await gql.getConnectionAuth();
      const url =
        config.upstream_url +
        "/api/workspaces/" +
        encodeURIComponent(config.workspace_id) +
        "/blobs/" +
        encodeURIComponent(image.sourceId);
      const response = await fetch(url, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw Error("IMAGE_FETCH_FAILED");
      const reader = response.body.getReader(),
        chunks = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > MAX_IMAGE) throw Error("IMAGE_TOO_LARGE");
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      const bytes = Buffer.concat(chunks);
      let mimeType;
      if (
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        mimeType = "image/png";
      else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        mimeType = "image/jpeg";
      else if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()))
        mimeType = "image/gif";
      else if (
        bytes.subarray(0, 4).toString() === "RIFF" &&
        bytes.subarray(8, 12).toString() === "WEBP"
      )
        mimeType = "image/webp";
      else return failure("UNSUPPORTED_IMAGE_FORMAT");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ docId, blockId, mimeType, size: length }),
          },
          { type: "image", mimeType, data: bytes.toString("base64") },
        ],
        structuredContent: { docId, blockId, mimeType, size: length },
      };
    },
  );
  stripSchemaDialect(server);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "xenica-native-adapter",
    version: "0.2.0",
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = (await client.listTools()).tools;
  if (tools.length !== ALLOWED.size)
    throw Error("TOOL_POLICY_MISMATCH " + tools.length + "/" + ALLOWED.size);
  return {
    tools,
    identity,
    journal,
    close: async () => {
      await client.close();
      journal.close();
    },
    call: async (name, args, actor) => {
      if (!ALLOWED.has(name)) return failure("UNKNOWN_TOOL");
      if (!args || typeof args !== "object" || Array.isArray(args))
        return failure("INVALID_ARGUMENTS");
      // Validate before dispatch; credentials and workspace values are never caller-selected.
      if (!schemas.get(name).safeParse(args).success)
        return failure("INVALID_ARGUMENTS");
      const result = await actors.run(actor, () =>
        client.callTool({ name, arguments: args }, undefined, {
          timeout: 110000,
        }),
      );
      if (name === "get_capabilities" && result.structuredContent?.server) {
        result.structuredContent.server.effective = {
          profile: "xenica-authoring",
          enabledTools: [...ALLOWED],
        };
        result.structuredContent.images = {
          pixelRead: true,
          maxBytes: MAX_IMAGE,
          nativeMindmapImageNodes: false,
        };
        result.content = [
          { type: "text", text: JSON.stringify(result.structuredContent) },
        ];
      }
      return result;
    },
  };
}
export async function start(config) {
  const app = await build(config);
  const httpServer = http.createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    const send = (status, value) => {
      res.writeHead(status);
      res.end(JSON.stringify(value));
    };
    if (req.url === "/health" && req.method === "GET") {
      try {
        await app.identity();
        return send(200, { ok: true });
      } catch {
        return send(503, { ok: false });
      }
    }
    const a = Buffer.from(req.headers.authorization || ""),
      b = Buffer.from("Bearer " + config.bridge_secret);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return send(401, { error: "unauthorized" });
    if (req.url !== "/rpc" || req.method !== "POST")
      return send(404, { error: "not_found" });
    try {
      let size = 0,
        chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) return send(413, { error: "BODY_TOO_LARGE" });
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString());
      if (data.action === "tools") return send(200, { tools: app.tools });
      if (data.action !== "call") return send(400, { error: "INVALID_ACTION" });
      const result = await app.call(
        data.tool,
        data.args,
        typeof data.actor === "string" ? data.actor.slice(0, 128) : "unknown",
      );
      send(200, { mcp: result });
    } catch {
      send(200, {
        mcp: failure(
          "AUTHORING_OPERATION_FAILED",
          "For a write, inspect the document and persisted intent before continuing. Do not repeat with a new key.",
        ),
      });
    }
  });
  await new Promise((resolve) =>
    httpServer.listen(config.port || 8893, config.host || "0.0.0.0", resolve),
  );
  return { ...app, httpServer };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const config = JSON.parse(
    fs.readFileSync(
      process.env.AFFINE_AUTHORING_CONFIG || "/private/bridge.json",
    ),
  );
  const app = await start(config);
  const shutdown = () =>
    app.httpServer.close(async () => {
      await app.close();
      process.exit(0);
    });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  console.log("Native authoring adapter ready");
}
