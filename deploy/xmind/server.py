"""Private native-editor host. SQLite transactions preserve every revision."""
from http.server import ThreadingHTTPServer as _ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie, CookieError
from pathlib import Path
import base64
import binascii
import hashlib
import json
import math
import mimetypes
import os
import re
import secrets
import socket
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

STATE = Path(os.environ.get("XMIND_STATE", "/mnt/HDD/xenica-private/xmind"))
WEB = Path(os.environ.get("XMIND_WEB", str(Path(__file__).parent / "web")))
ASSETS = Path(os.environ.get("XMIND_ASSETS", "/var/lib/xmind/native"))
PUBLIC = os.environ.get("XMIND_PUBLIC_URL", "https://xmind.truebigsand.top")
MAX_BODY = 32 * 1024 * 1024
MAX_TOPICS = 20000
MAX_DEPTH = 256
MAX_RESOURCE = 12 * 1024 * 1024
MAX_RESOURCES = 24 * 1024 * 1024
COOKIE = "__Host-xmind"
MAP_PATH = r"/api/maps/([a-f0-9-]{36})"
CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"


class ThreadingHTTPServer(_ThreadingHTTPServer):
    """Allow module fan-out while bounding large JSON allocations separately."""
    max_workers = 64
    max_bodies = 2
    request_queue_size = 128
    daemon_threads = True

    def __init__(self, *args, **kwargs):
        self.workers = threading.BoundedSemaphore(self.max_workers)
        self.bodies = threading.BoundedSemaphore(self.max_bodies)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.workers.acquire(blocking=False):
            try:
                request.settimeout(0.1)
                try:
                    # Peek at only the request line for overload diagnostics. Never
                    # read/print headers or a JSON body in this pre-handler path.
                    first = request.recv(4096, socket.MSG_PEEK).split(b"\r\n", 1)[0]
                    parts = first.decode("ascii", "replace").split()
                    method = parts[0] if parts and re.fullmatch(r"[A-Z]{1,16}", parts[0]) else "UNKNOWN"
                    path = safe_log_target(parts[1]) if len(parts) > 1 else "[unavailable]"
                except (OSError, ValueError):
                    method, path = "UNKNOWN", "[unavailable]"
                print(method, path, 503, flush=True)
                request.settimeout(1)
                payload = json.dumps({"error": "请求较多，请稍后重试"}).encode()
                headers = ("HTTP/1.0 503 Service Unavailable\r\nContent-Type: application/json; charset=utf-8\r\n"
                           f"Content-Length: {len(payload)}\r\nRetry-After: 1\r\nConnection: close\r\n\r\n").encode()
                request.sendall(headers + payload)
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.workers.release()
            raise

    def process_request_thread(self, *args):
        try:
            super().process_request_thread(*args)
        finally:
            self.workers.release()


def safe_log_target(target):
    try:
        path = urllib.parse.urlsplit(target).path
    except ValueError:
        return "[invalid]"
    if path.startswith("/auth/continue/"):
        return "/auth/continue/[redacted]"
    return "".join(char if 32 <= ord(char) < 127 else "?" for char in path)[:300]


class RequestError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class Database(sqlite3.Connection):
    # sqlite3's ordinary context manager commits but does not close its handle.
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


def connect():
    db = sqlite3.connect(STATE / "workspace.sqlite", timeout=20, factory=Database)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def initialize():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(STATE, 0o700)
    with connect() as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS tickets (hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS maps (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, updated REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS versions (map_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, created REAL NOT NULL, PRIMARY KEY(map_id,revision), FOREIGN KEY(map_id) REFERENCES maps(id));
        CREATE INDEX IF NOT EXISTS maps_owner_updated ON maps(owner,updated);
        """)
        db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))
        db.execute("DELETE FROM tickets WHERE expires<=?", (time.time(),))
    os.chmod(STATE / "workspace.sqlite", 0o600)


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(user, duration=86400 * 14):
    if (not isinstance(user, dict) or not isinstance(user.get("id"), str)
            or not 0 < len(user["id"]) <= 256 or user.get("name") != "test"):
        raise ValueError("登录身份无效")
    token = secrets.token_urlsafe(32)
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))
        db.execute("DELETE FROM tickets WHERE expires<=?", (time.time(),))
        db.execute("INSERT INTO sessions VALUES (?,?,?,?)",
                   (digest(token), user["id"], user["name"], time.time() + duration))
    return token


def _identity(value, seen):
    if (not isinstance(value, str) or not 0 < len(value) <= 256
            or any(ord(c) < 32 for c in value) or value in seen):
        raise ValueError("文档身份无效或重复")
    seen.add(value)


def validate_snapshot(data):
    """Preserve native metadata/theme/extensions; validate container and topic graph."""
    if not isinstance(data, dict) or type(data.get("schema")) is not int or data["schema"] != 1:
        raise ValueError("文档格式不支持")
    native = data.get("native")
    if not isinstance(native, dict):
        raise ValueError("原生文档无效")
    sheets = native.get("content")
    if not isinstance(sheets, list) or not 1 <= len(sheets) <= 100:
        raise ValueError("画布内容无效")
    resources = data.get("resources", {})
    if not isinstance(resources, dict) or len(resources) > 2000:
        raise ValueError("附件数量过多")
    total = 0
    for path, content in resources.items():
        # XMind resource names may contain Unicode. Preserve safe relative paths.
        if (not isinstance(path, str) or len(path) > 512 or not path.startswith("resources/")
                or any(part in ("", ".", "..") for part in path.split("/"))
                or any(ord(c) < 32 or c in "\\:#?%" for c in path)):
            raise ValueError("附件路径无效")
        if not isinstance(content, str) or not content or len(content) > (MAX_RESOURCE + 2) // 3 * 4:
            raise ValueError("附件内容为空或过大")
        try:
            decoded = base64.b64decode(content, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("附件编码无效") from exc
        if not decoded or len(decoded) > MAX_RESOURCE:
            raise ValueError("附件内容为空或过大")
        total += len(decoded)
        if total > MAX_RESOURCES:
            raise ValueError("附件总量过大")
    seen = set()
    def definitions(container, names):
        # Only real native model definitions have global IDs. Metadata, themes,
        # and e.g. summaries[].topicId are reusable IDs/references, not definitions.
        for name in names:
            entries = container.get(name, [])
            if not isinstance(entries, list):
                raise ValueError("文档关系格式无效")
            for entry in entries:
                if not isinstance(entry, dict):
                    raise ValueError("文档关系格式无效")
                _identity(entry.get("id"), seen)
    topics = 0
    for sheet in sheets:
        if not isinstance(sheet, dict):
            raise ValueError("画布格式无效")
        _identity(sheet.get("id"), seen)
        definitions(sheet, ("relationships", "zones"))
        stack = [sheet.get("rootTopic")]
        while stack:
            topic = stack.pop()
            if not isinstance(topic, dict):
                raise ValueError("节点格式无效")
            _identity(topic.get("id"), seen)
            definitions(topic, ("boundaries", "summaries"))
            topics += 1
            if topics > MAX_TOPICS:
                raise ValueError("节点数量过多")
            children = topic.get("children", {})
            if not isinstance(children, dict):
                raise ValueError("子节点格式无效")
            for group in children.values():
                if not isinstance(group, list):
                    raise ValueError("子节点格式无效")
                stack.extend(group)
    # Bound all JSON nesting, including unknown native extension fields. This is
    # iterative to avoid Python recursion failures on adversarial topic chains.
    stack = [(data, 0)]
    values = 0
    while stack:
        value, depth = stack.pop()
        values += 1
        if depth > MAX_DEPTH or values > 500000:
            raise ValueError("文档结构过深或过大")
        if isinstance(value, dict):
            if not all(isinstance(key, str) for key in value):
                raise ValueError("文档字段无效")
            stack.extend((child, depth + 1) for child in value.values())
        elif isinstance(value, list):
            stack.extend((child, depth + 1) for child in value)
        elif isinstance(value, float) and not math.isfinite(value):
            raise ValueError("文档数值无效")
    try:
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        if len(encoded.encode("utf-8")) > MAX_BODY:
            raise ValueError("文档大小超出限制")
        return encoded
    except (TypeError, RecursionError, UnicodeError) as exc:
        raise ValueError("文档格式无效") from exc


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("文档字段重复")
        result[key] = value
    return result


def _constant(_value):
    raise ValueError("文档数值无效")


def guarded(method):
    def dispatch(self):
        try:
            return method(self)
        except RequestError as exc:
            return self.respond(exc.status, {"error": str(exc)},
                                headers={"Retry-After": "1"} if exc.status == 503 else None)
        except (ValueError, TypeError, KeyError, RecursionError, UnicodeError, binascii.Error):
            return self.respond(400, {"error": "内容格式有误或超出限制"})
        except (socket.timeout, TimeoutError):
            return self.respond(408, {"error": "请求超时，请稍后重试"})
        except (sqlite3.Error, OSError):
            return self.respond(503, {"error": "存储暂不可用，请稍后重试"})
        finally:
            # Keep the slot through parsing, native validation and SQLite write;
            # releasing after rfile.read would leave decoded JSON unbounded.
            if getattr(self, "_body_slot", False):
                self._body_slot = False
                self.server.bodies.release()
    return dispatch


class Handler(BaseHTTPRequestHandler):
    server_version = "XmindHost"

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, fmt, *args):
        # Payloads, cookies and continuation tickets never enter access logs.
        if self.path.startswith("/auth/"):
            return
        print(self.command, safe_log_target(self.path), args[1] if len(args) > 1 else "", flush=True)

    def respond(self, status, data=None, headers=None, raw=None, content_type="application/json; charset=utf-8"):
        payload = raw if raw is not None else (b"" if data is None else json.dumps(data, ensure_ascii=False).encode())
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store" if self.path.startswith(("/api/", "/auth/")) else "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", CSP)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def user(self):
        try:
            cookies = SimpleCookie(self.headers.get("Cookie", ""))
            token = cookies[COOKIE].value
            if len(token) > 256:
                return None
        except (KeyError, ValueError, CookieError):
            return None
        with connect() as db:
            record = db.execute("SELECT * FROM sessions WHERE hash=? AND expires>?",
                                (digest(token), time.time())).fetchone()
        return dict(record) if record else None

    def body(self):
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or self.headers.get("Transfer-Encoding"):
            raise RequestError("请求长度无效")
        try:
            length = int(lengths[0])
        except ValueError as exc:
            raise RequestError("请求长度无效") from exc
        if length <= 0:
            raise RequestError("内容大小无效")
        if length > MAX_BODY:
            raise RequestError("内容大小超出限制", 413)
        if not getattr(self, "_body_slot", False):
            if not self.server.bodies.acquire(blocking=False):
                raise RequestError("正在保存其他内容，请稍后重试", 503)
            self._body_slot = True
        raw = self.rfile.read(length)
        if len(raw) != length:
            raise RequestError("请求内容不完整")
        data = json.loads(raw, object_pairs_hook=_object, parse_constant=_constant)
        if not isinstance(data, dict):
            raise RequestError("请求内容必须是对象")
        return data

    def mutation_allowed(self):
        return self.headers.get("Origin") == PUBLIC

    def do_HEAD(self):
        self.do_GET()

    @guarded
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/healthz":
            with connect() as db:
                db.execute("SELECT 1").fetchone()
            return self.respond(200, {"ok": True})
        if path.startswith("/auth/continue/"):
            token = path.removeprefix("/auth/continue/")
            if not 20 <= len(token) <= 256:
                return self.respond(401, {"error": "登录链接已失效"})
            with connect() as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("DELETE FROM tickets WHERE hash=? AND expires>? RETURNING session_hash",
                                 (digest(token), time.time())).fetchone()
                valid = row and db.execute("SELECT * FROM sessions WHERE hash=? AND expires>?",
                                           (row["session_hash"], time.time())).fetchone()
                if not valid:
                    return self.respond(401, {"error": "登录链接已失效"})
                user = {"id": valid["user_id"], "name": valid["name"]}
            token = new_session(user, 7200)
            return self.respond(303, headers={"Location": "/", "Set-Cookie": self.session_cookie(token, 7200)})
        user = self.user()
        if path == "/api/session":
            return self.respond(200, {"user": {"id": user["user_id"], "name": user["name"]} if user else None})
        if path.startswith("/api/"):
            if not user:
                return self.respond(401, {"error": "请先登录"})
            with connect() as db:
                if path == "/api/maps":
                    rows = db.execute("SELECT id,title,revision,updated FROM maps WHERE owner=? ORDER BY updated DESC",
                                      (user["user_id"],)).fetchall()
                    return self.respond(200, {"maps": [dict(row) for row in rows]})
                match = re.fullmatch(MAP_PATH + r"(?:(/versions)(?:/([1-9][0-9]{0,9}))?)?", path)
                if match:
                    row = db.execute("SELECT * FROM maps WHERE id=? AND owner=?",
                                     (match[1], user["user_id"])).fetchone()
                    if not row:
                        return self.respond(404, {"error": "找不到这张导图"})
                    if match[2] and not match[3]:
                        versions = db.execute("SELECT revision,created FROM versions WHERE map_id=? ORDER BY revision DESC",
                                              (match[1],)).fetchall()
                        return self.respond(200, {"versions": [dict(v) for v in versions]})
                    if match[3]:
                        version = db.execute("SELECT revision,snapshot,created FROM versions WHERE map_id=? AND revision=?",
                                             (match[1], int(match[3]))).fetchone()
                        if not version:
                            return self.respond(404, {"error": "找不到这个版本"})
                        return self.respond(200, {"id": match[1], "revision": version["revision"],
                                                 "created": version["created"], "snapshot": json.loads(version["snapshot"])})
                    return self.respond(200, {"id": row["id"], "title": row["title"], "revision": row["revision"],
                                             "snapshot": json.loads(row["snapshot"])},
                                        headers={"ETag": str(row["revision"])})
            return self.respond(404, {"error": "找不到这个操作"})
        if path in ("/", "/app.js", "/app.css"):
            dest = WEB / ("index.html" if path == "/" else path[1:])
        elif not user:
            return self.respond(401, {"error": "请先登录"})
        elif path == "/native.js":
            dest = WEB / "native.js"
        else:
            if ".." in path.split("/") or not re.fullmatch(r"/[A-Za-z0-9_@./-]+", path):
                return self.respond(404, {"error": "资源路径无效"})
            dest = (ASSETS / path[1:]).resolve()
            if not dest.is_relative_to(ASSETS.resolve()):
                return self.respond(404, {"error": "资源路径无效"})
        if not dest.is_file():
            return self.respond(404, {"error": "资源不可用"})
        mime = mimetypes.guess_type(dest.name)[0] or "application/octet-stream"
        return self.respond(200, raw=dest.read_bytes(), content_type=mime)

    @staticmethod
    def session_cookie(token, duration):
        return f"{COOKIE}={token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age={duration}"

    def login(self, data):
        name = data.get("name", "")
        password = data.get("password", "")
        if name != "test" or not isinstance(password, str) or not 1 <= len(password) <= 4096:
            return self.respond(401, {"error": "用户名或密码不对"})
        req = urllib.request.Request("http://100.100.1.103:8080/api/auth/login",
                                     data=json.dumps({"name": name, "password": password}).encode(),
                                     headers={"Content-Type": "application/json",
                                              "Host": "excalidraw.xenica.truebigsand.top"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                upstream = json.loads(response.read(65537))
            if (not isinstance(upstream, dict) or upstream.get("name") != "test"
                    or not isinstance(upstream.get("id"), str) or not 0 < len(upstream["id"]) <= 256):
                return self.respond(502, {"error": "登录验证暂不可用"})
        except urllib.error.HTTPError as exc:
            status = exc.code if exc.code in (401, 429) else 502
            return self.respond(status, {"error": "尝试次数较多，请稍后重试" if status == 429 else "登录失败，请检查账号和密码"})
        except (urllib.error.URLError, OSError, ValueError, UnicodeError):
            return self.respond(502, {"error": "登录验证暂不可用，请稍后重试"})
        token = new_session(upstream)
        return self.respond(200, {"user": {"id": upstream["id"], "name": upstream["name"]}},
                            headers={"Set-Cookie": self.session_cookie(token, 1209600)})

    @staticmethod
    def title(data):
        title = data.get("title", "未命名")
        if not isinstance(title, str) or len(title) > 200:
            raise ValueError("导图名称无效或过长")
        return title

    @guarded
    def do_POST(self):
        if not self.mutation_allowed():
            return self.respond(403, {"error": "请求来源无效"})
        path = self.path.split("?", 1)[0]
        if path == "/api/login":
            return self.login(self.body())
        user = self.user()
        if not user:
            return self.respond(401, {"error": "请先登录"})
        data = self.body()
        if path == "/api/logout":
            with connect() as db:
                db.execute("DELETE FROM sessions WHERE hash=?", (user["hash"],))
                db.execute("DELETE FROM tickets WHERE session_hash=?", (user["hash"],))
            return self.respond(200, {"ok": True}, headers={"Set-Cookie": self.session_cookie("", 0)})
        if path == "/api/maps":
            title = self.title(data)
            snapshot = validate_snapshot(data.get("snapshot"))
            ident = str(uuid.uuid4())
            with connect() as db:
                db.execute("INSERT INTO maps VALUES (?,?,?,?,?,?)",
                           (ident, user["user_id"], title, 1, snapshot, time.time()))
                db.execute("INSERT INTO versions VALUES (?,?,?,?)", (ident, 1, snapshot, time.time()))
            return self.respond(201, {"id": ident, "title": title, "revision": 1})
        return self.respond(404, {"error": "找不到这个操作"})

    @guarded
    def do_PUT(self):
        if not self.mutation_allowed():
            return self.respond(403, {"error": "请求来源无效"})
        user = self.user()
        if not user:
            return self.respond(401, {"error": "请先登录"})
        match = re.fullmatch(MAP_PATH, self.path.split("?", 1)[0])
        if not match:
            return self.respond(404, {"error": "找不到这个操作"})
        data = self.body()
        expected = self.headers.get("If-Match")
        if expected is None:
            return self.respond(428, {"error": "缺少版本信息，请先刷新导图"})
        if not re.fullmatch(r'(?:"[1-9][0-9]{0,9}"|[1-9][0-9]{0,9})', expected):
            raise RequestError("版本信息无效")
        expected = int(expected.strip('"'))
        snapshot = validate_snapshot(data.get("snapshot"))
        title = self.title(data)
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision FROM maps WHERE id=? AND owner=?",
                             (match[1], user["user_id"])).fetchone()
            if not row:
                return self.respond(404, {"error": "找不到这张导图"})
            if row["revision"] != expected:
                return self.respond(409, {"error": "这张导图已在另一处更新，请先导出当前内容，再刷新读取最新版本",
                                          "revision": row["revision"]})
            revision = expected + 1
            db.execute("UPDATE maps SET title=?,revision=?,snapshot=?,updated=? WHERE id=?",
                       (title, revision, snapshot, time.time(), match[1]))
            db.execute("INSERT INTO versions VALUES (?,?,?,?)", (match[1], revision, snapshot, time.time()))
        return self.respond(200, {"revision": revision})


if __name__ == "__main__":
    os.umask(0o077)
    initialize()
    ThreadingHTTPServer((os.environ.get("XMIND_BIND", "100.100.1.202"),
                         int(os.environ.get("XMIND_PORT", "3055"))), Handler).serve_forever()
