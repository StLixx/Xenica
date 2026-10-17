export async function api(path, options = {}) {
  const response = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "服务返回异常" };
  }
  if (!response.ok) {
    const e = new Error(
      data?.error?.message ||
        data?.error ||
        data?.message ||
        "请求失败（" + response.status + "）",
    );
    e.status = response.status;
    throw e;
  }
  return data;
}
export const post = (path, data) =>
  api(path, { method: "POST", body: JSON.stringify(data) });
export const put = (path, data) =>
  api(path, { method: "PUT", body: JSON.stringify(data) });
export function resource(document, path) {
  if (!path) return "";
  if (path.startsWith("/api/")) return path;
  const clean = path.replace(/^\.?\//, "");
  return (
    "/api/documents/" +
    encodeURIComponent(document) +
    "/assets/" +
    (clean.includes("/") ? clean : "images/" + clean)
      .split("/")
      .map(encodeURIComponent)
      .join("/")
  );
}
export const bytes = (n) =>
  n
    ? n >= 1048576
      ? (n / 1048576).toFixed(1) + "MB"
      : (n / 1024).toFixed(1) + "KB"
    : "—";
export const statusText = (s) =>
  ({
    queued: "排队中",
    pending: "排队中",
    uploading: "上传中",
    running: "正在解析",
    processing: "正在解析",
    extracting: "正在解析",
    downloading: "下载结果",
    done: "解析成功",
    completed: "解析成功",
    succeeded: "解析成功",
    ready: "解析成功",
    failed: "解析失败",
    error: "解析失败",
  })[s] ||
  s ||
  "待解析";
export const isDone = (s) =>
  ["done", "completed", "succeeded", "ready"].includes(s);
