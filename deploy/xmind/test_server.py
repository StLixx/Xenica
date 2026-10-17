"""Isolated standard-library tests; never touch the deployed workspace or login."""
import base64
import copy
import http.client
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest import mock
from concurrent.futures import ThreadPoolExecutor

spec = importlib.util.spec_from_file_location("xmind_server", Path(__file__).with_name("server.py"))
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


def snapshot():
    return {"schema": 1, "native": {"content": [{
        "id": "sheet-1", "class": "sheet", "title": "思维导图",
        "rootTopic": {"id": "root", "class": "topic", "title": "中文主题",
                      "children": {"attached": [{"id": "child", "title": "子主题"}]}}
    }], "metadata": {"creator": {"name": "XMind"}}}, "resources": {}}


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.patch = mock.patch.multiple(host, STATE=Path(cls.temp.name) / "state",
                                       WEB=Path(cls.temp.name) / "web",
                                       ASSETS=Path(cls.temp.name) / "native")
        cls.patch.start()
        host.WEB.mkdir()
        (host.WEB / "index.html").write_text("login")
        (host.WEB / "native.js").write_text("private host bridge")
        host.ASSETS.mkdir()
        (host.ASSETS / "kernel.js").write_text("private kernel")
        host.initialize()
        cls.httpd = host.ThreadingHTTPServer(("127.0.0.1", 0), host.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()
        cls.patch.stop()
        cls.temp.cleanup()

    def setUp(self):
        with host.connect() as db:
            db.execute("DELETE FROM versions")
            db.execute("DELETE FROM maps")
            db.execute("DELETE FROM tickets")
            db.execute("DELETE FROM sessions")
        self.token = host.new_session({"id": "alice", "name": "test"})
        self.other = host.new_session({"id": "bob", "name": "test"})

    def request(self, method, path, data=None, token=True, origin=True, extra=None, raw=None):
        connection = http.client.HTTPConnection(*self.httpd.server_address, timeout=5)
        headers = {}
        if token:
            headers["Cookie"] = host.COOKIE + "=" + (self.token if token is True else token)
        if origin:
            headers["Origin"] = host.PUBLIC
        if data is not None:
            raw = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        headers.update(extra or {})
        connection.request(method, path, body=raw, headers=headers)
        response = connection.getresponse()
        payload = response.read()
        result = (response.status, dict(response.getheaders()), payload)
        connection.close()
        return result

    def create(self):
        status, _, raw = self.request("POST", "/api/maps", {"title": "导图", "snapshot": snapshot()})
        self.assertEqual(status, 201, raw)
        return json.loads(raw)["id"]

    def test_anonymous_cannot_read_maps_or_native_assets(self):
        for path in ["/api/maps", "/api/maps/" + "a" * 36, "/kernel.js", "/native.js"]:
            self.assertEqual(self.request("GET", path, token=False)[0], 401)
        self.assertEqual(self.request("GET", "/", token=False)[0], 200)
        self.assertEqual(self.request("GET", "/native.js")[2], b"private host bridge")

    def test_overload_is_bounded_and_recovers(self):
        # Reserve the worker budget, simulating existing slow uploads without
        # allocating huge bodies or creating many threads during the test.
        for _ in range(self.httpd.max_workers):
            self.assertTrue(self.httpd.workers.acquire(blocking=False))
        try:
            self.assertEqual(self.request("GET", "/healthz", token=False)[0], 503)
        finally:
            for _ in range(self.httpd.max_workers):
                self.httpd.workers.release()
        self.assertEqual(self.request("GET", "/healthz", token=False)[0], 200)

    def test_native_module_burst_above_sixteen_connections(self):
        all_entered = threading.Event()
        release = threading.Event()
        lock = threading.Lock()
        entered = [0]
        class BurstHandler(host.Handler):
            def do_GET(handler):
                if handler.path == "/kernel.js":
                    with lock:
                        entered[0] += 1
                        if entered[0] == 24:
                            all_entered.set()
                    release.wait(3)
                return super().do_GET()
        server = host.ThreadingHTTPServer(("127.0.0.1", 0), BurstHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def fetch(_):
            connection = http.client.HTTPConnection(*server.server_address, timeout=5)
            connection.request("GET", "/kernel.js", headers={"Cookie": host.COOKIE+"="+self.token})
            response = connection.getresponse()
            response.read()
            status = response.status
            connection.close()
            return status
        try:
            with ThreadPoolExecutor(max_workers=24) as workers:
                futures = [workers.submit(fetch, index) for index in range(24)]
                reached = all_entered.wait(2)
                release.set()
                statuses = [future.result() for future in futures]
            self.assertTrue(reached, "Module fan-out was rejected before all 24 handlers could run")
            self.assertEqual(statuses, [200] * 24)
        finally:
            release.set()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_body_budget_does_not_block_private_modules(self):
        for _ in range(self.httpd.max_bodies):
            self.assertTrue(self.httpd.bodies.acquire(blocking=False))
        try:
            self.assertEqual(self.request("GET", "/kernel.js")[0], 200)
            status, _, body = self.request("POST", "/api/maps", {"snapshot":snapshot()})
            self.assertEqual(status, 503)
            self.assertIn("error", json.loads(body))
        finally:
            for _ in range(self.httpd.max_bodies):
                self.httpd.bodies.release()
        self.create()

    def test_invalid_body_releases_its_budget(self):
        for _ in range(self.httpd.max_bodies+1):
            self.assertEqual(self.request("POST", "/api/maps", raw=b"bad-json")[0], 400)
        self.create()

    def test_overload_logs_safe_method_path_and_status(self):
        for _ in range(self.httpd.max_workers):
            self.assertTrue(self.httpd.workers.acquire(blocking=False))
        try:
            with mock.patch("builtins.print") as logged:
                self.assertEqual(self.request("GET", "/kernel.js?token=QUERY_SECRET")[0], 503)
                self.assertEqual(self.request("GET", "/auth/continue/PATH_SECRET")[0], 503)
            lines = [" ".join(str(arg) for arg in call.args) for call in logged.call_args_list]
            self.assertTrue(any("GET /kernel.js 503" in line for line in lines), lines)
            self.assertTrue(any("GET /auth/continue/[redacted] 503" in line for line in lines), lines)
            self.assertNotIn("QUERY_SECRET", " ".join(lines))
            self.assertNotIn("PATH_SECRET", " ".join(lines))
        finally:
            for _ in range(self.httpd.max_workers):
                self.httpd.workers.release()

    def test_session_security_and_expiry(self):
        self.assertEqual(self.request("GET", "/api/session")[0], 200)
        with host.connect() as db:
            row = db.execute("SELECT * FROM sessions WHERE user_id='alice'").fetchone()
            self.assertNotEqual(row["hash"], self.token)
            self.assertEqual(row["hash"], host.digest(self.token))
            db.execute("UPDATE sessions SET expires=0 WHERE user_id='alice'")
        self.assertEqual(self.request("GET", "/api/maps")[0], 401)

    def test_login_only_forwards_test_and_has_private_cookie(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"id":"upstream-test","name":"test"}'
        with mock.patch.object(host.urllib.request, "urlopen", return_value=response) as upstream:
            status, headers, _ = self.request("POST", "/api/login", {"name": "admin", "password": "never-log"})
            self.assertEqual(status, 401)
            upstream.assert_not_called()
            status, headers, _ = self.request("POST", "/api/login", {"name": "test", "password": "never-log"})
            self.assertEqual(status, 200)
            req = upstream.call_args[0][0]
            self.assertEqual(req.full_url, "http://100.100.1.103:8080/api/auth/login")
            self.assertEqual(req.get_header("Host"), "excalidraw.xenica.truebigsand.top")
            for flag in ["Secure", "HttpOnly", "SameSite=Strict", "Path=/"]:
                self.assertIn(flag, headers["Set-Cookie"])
        with host.connect() as db:
            self.assertNotIn("never-log", str(db.execute("SELECT * FROM sessions").fetchall()))

    def test_login_network_failure_is_json_error(self):
        with mock.patch.object(host.urllib.request, "urlopen", side_effect=host.urllib.error.URLError("offline")):
            status, _, body = self.request("POST", "/api/login", {"name": "test", "password": "x"})
            self.assertEqual(status, 502)
            self.assertIn("error", json.loads(body))

    def test_malformed_requests_are_explicit_400(self):
        for raw in [b"[]", b"null", b'{"snapshot":null}', b'{"a":1,"a":2}', b'{"title":NaN}']:
            status, _, body = self.request("POST", "/api/maps", raw=raw)
            self.assertEqual(status, 400, (raw, status))
            self.assertIn("error", json.loads(body))
        status, _, body = self.request("PUT", "/api/maps/" + "a" * 36, raw=b"{}",
                                       extra={"Content-Length": "-1"})
        self.assertEqual(status, 400)
        self.assertIn("error", json.loads(body))

    def test_cross_origin_mutation_rejected(self):
        for method, path in [("POST", "/api/maps"), ("PUT", "/api/maps/" + "a" * 36), ("POST", "/api/logout")]:
            self.assertEqual(self.request(method, path, {"snapshot": snapshot()}, origin=False)[0], 403)
            self.assertEqual(self.request(method, path, {"snapshot": snapshot()}, extra={"Origin": "https://evil.example"})[0], 403)

    def test_reduced_real_native_fixture_survives_http_storage(self):
        data = json.loads((Path(__file__).parent / "fixtures/native-minimal.json").read_text())
        status, _, raw = self.request("POST", "/api/maps", {"title":"原生结构回归","snapshot":data})
        self.assertEqual(status, 201)
        ident = json.loads(raw)["id"]
        status, _, raw = self.request("GET", "/api/maps/"+ident)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["snapshot"], data)
        status, _, raw = self.request("GET", "/api/maps/"+ident+"/versions/1")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["snapshot"]["resources"], data["resources"])

    def test_owner_isolation(self):
        ident = self.create()
        self.assertEqual(json.loads(self.request("GET", "/api/maps", token=self.other)[2]), {"maps": []})
        self.assertEqual(self.request("GET", "/api/maps/" + ident, token=self.other)[0], 404)
        self.assertEqual(self.request("PUT", "/api/maps/" + ident, {"snapshot": snapshot()}, token=self.other, extra={"If-Match": "1"})[0], 404)
        self.assertEqual(self.request("GET", "/api/maps/" + ident + "/versions", token=self.other)[0], 404)

    def test_atomic_if_match_conflict(self):
        ident = self.create()
        def update(_):
            return self.request("PUT", "/api/maps/" + ident, {"snapshot": snapshot()}, extra={"If-Match": "1"})[0]
        with ThreadPoolExecutor(max_workers=2) as workers:
            self.assertEqual(sorted(workers.map(update, range(2))), [200, 409])
        status, headers, body = self.request("GET", "/api/maps/" + ident)
        self.assertEqual(json.loads(body)["revision"], 2)
        with host.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM versions").fetchone()[0], 2)

    def test_missing_if_match_does_not_silently_overwrite(self):
        ident = self.create()
        self.assertEqual(self.request("PUT", "/api/maps/" + ident, {"snapshot": snapshot()})[0], 428)

    def test_restart_history_and_content_survive(self):
        ident = self.create()
        changed = snapshot()
        changed["native"]["content"][0]["rootTopic"]["title"] = "第二版"
        self.assertEqual(self.request("PUT", "/api/maps/" + ident, {"snapshot": changed}, extra={"If-Match": "1"})[0], 200)
        # Close the actual listener and reopen it against the same on-disk state.
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()
        host.initialize()
        cls = type(self)
        cls.httpd = host.ThreadingHTTPServer(("127.0.0.1", 0), host.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        status, _, body = self.request("GET", "/api/maps/" + ident)
        self.assertEqual(json.loads(body)["snapshot"], changed)
        status, _, body = self.request("GET", "/api/maps/" + ident + "/versions")
        self.assertEqual(status, 200)
        self.assertEqual([v["revision"] for v in json.loads(body)["versions"]], [2, 1])
        status, _, body = self.request("GET", "/api/maps/" + ident + "/versions/1")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["snapshot"], snapshot())

    def test_private_asset_traversal_rejected(self):
        self.assertEqual(self.request("GET", "/../state/workspace.sqlite")[0], 404)
        self.assertEqual(self.request("GET", "/%2e%2e/state/workspace.sqlite")[0], 404)
        secret = host.STATE / "private.txt"
        secret.write_text("secret")
        (host.ASSETS / "escape.txt").symlink_to(secret)
        self.assertEqual(self.request("GET", "/escape.txt")[0], 404)
        (host.ASSETS / "escape.txt").unlink()

    def test_continuation_ticket_is_one_use_and_expiring(self):
        ticket = "a" * 32
        with host.connect() as db:
            db.execute("INSERT INTO tickets VALUES (?,?,?)", (host.digest(ticket), host.digest(self.token), host.time.time()+60))
        status, headers, _ = self.request("GET", "/auth/continue/" + ticket, token=False)
        self.assertEqual(status, 303)
        self.assertIn("Max-Age=7200", headers["Set-Cookie"])
        self.assertEqual(self.request("GET", "/auth/continue/" + ticket, token=False)[0], 401)
        with host.connect() as db:
            db.execute("INSERT INTO tickets VALUES (?,?,?)", (host.digest("b"*32), host.digest(self.token), 0))
        self.assertEqual(self.request("GET", "/auth/continue/" + "b"*32, token=False)[0], 401)

    def test_body_limit_before_reading_payload(self):
        status, _, raw = self.request("POST", "/api/maps", raw=b"{}", extra={"Content-Length": str(host.MAX_BODY+1)})
        self.assertEqual(status, 413)
        self.assertIn("error", json.loads(raw))

    def test_upstream_invalid_identity_or_response_is_502(self):
        for raw in [b"[]", b"null", b'{"id":"bad","name":"admin"}', b"bad-json"]:
            response = mock.MagicMock()
            response.__enter__.return_value.read.return_value = raw
            with self.subTest(raw=raw), mock.patch.object(host.urllib.request, "urlopen", return_value=response):
                self.assertEqual(self.request("POST", "/api/login", {"name":"test","password":"x"})[0], 502)

    def test_database_failure_returns_json_503(self):
        with mock.patch.object(host, "connect", side_effect=sqlite3.OperationalError("unavailable")):
            status, _, raw = self.request("GET", "/api/maps")
            self.assertEqual(status, 503)
            self.assertIn("error", json.loads(raw))

    def test_logout_revokes_session(self):
        self.assertEqual(self.request("POST", "/api/logout", {})[0], 200)
        self.assertEqual(self.request("GET", "/api/maps")[0], 401)


class SnapshotTests(unittest.TestCase):
    def test_native_sheets_and_embedded_image_roundtrip(self):
        data = snapshot()
        data["native"]["content"][0]["rootTopic"]["image"] = {"src": "xap:resources/a.png"}
        data["resources"]["resources/a.png"] = base64.b64encode(b"image bytes").decode()
        self.assertEqual(json.loads(host.validate_snapshot(data)), data)

    def test_reduced_real_native_fixture_format_is_supported(self):
        data = json.loads((Path(__file__).parent / "fixtures/native-minimal.json").read_text())
        self.assertEqual(json.loads(host.validate_snapshot(data)), data)
        self.assertEqual(len(data["native"]["content"][0]["relationships"]), 1)
        image = base64.b64decode(data["resources"]["resources/fixture.png"], validate=True)
        self.assertTrue(image.startswith(bytes.fromhex("89504e470d0a1a0a")))

    def test_malformed_and_duplicate_identity(self):
        cases = []
        data = snapshot(); data["native"] = []; cases.append(data)
        data = snapshot(); data["native"]["content"].append(copy.deepcopy(data["native"]["content"][0])); cases.append(data)
        data = snapshot(); data["native"]["content"][0]["rootTopic"]["children"]["attached"][0]["id"] = "root"; cases.append(data)
        data = snapshot(); data["native"]["content"][0]["rootTopic"]["children"] = []; cases.append(data)
        data = snapshot(); data["native"]["content"][0]["rootTopic"]["children"] = {"attached": "bad"}; cases.append(data)
        data = snapshot(); data["native"]["content"][0]["id"] = ""; cases.append(data)
        data = snapshot(); data["native"]["content"][0]["rootTopic"]["title"] = float("nan"); cases.append(data)
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValueError):
                host.validate_snapshot(data)

    def test_native_definition_ids_and_reference_ids(self):
        data = snapshot()
        sheet = data["native"]["content"][0]
        root = sheet["rootTopic"]
        sheet["relationships"] = [{"id":"relation", "end1Id":"root", "end2Id":"child"}]
        sheet["zones"] = [{"id":"zone"}]
        root["children"]["summary"] = [{"id":"summary-topic", "title":"概要"}]
        root["summaries"] = [{"id":"summary", "topicId":"summary-topic", "range":"(0,0)"}]
        root["boundaries"] = [{"id":"boundary", "range":"(0,0)"}]
        self.assertEqual(json.loads(host.validate_snapshot(data)), data)
        root["boundaries"][0]["id"] = "relation"
        with self.assertRaises(ValueError):
            host.validate_snapshot(data)

    def test_resource_individual_and_total_size_limits(self):
        data = snapshot()
        data["resources"] = {"resources/a.png": base64.b64encode(b"12345").decode()}
        with mock.patch.object(host, "MAX_RESOURCE", 4), self.assertRaises(ValueError):
            host.validate_snapshot(data)
        data["resources"]["resources/b.png"] = base64.b64encode(b"12345").decode()
        with mock.patch.object(host, "MAX_RESOURCES", 9), self.assertRaises(ValueError):
            host.validate_snapshot(data)

    def test_resource_path_and_base64(self):
        for path, content in [("resources/../bad.png", "eA=="), ("resources/a.png", "bad!!!"),
                              ("resources//a.png", "eA=="), ("resources/a.png", "")]:
            data = snapshot(); data["resources"] = {path: content}
            with self.subTest(path=path, content=content), self.assertRaises(ValueError):
                host.validate_snapshot(data)

    def test_node_limit_and_deep_trees(self):
        data = snapshot()
        data["native"]["content"][0]["rootTopic"]["children"]["attached"] = [
            {"id": "n" + str(i)} for i in range(host.MAX_TOPICS)]
        with self.assertRaises(ValueError):
            host.validate_snapshot(data)
        data = snapshot()
        node = data["native"]["content"][0]["rootTopic"]
        for i in range(300):
            child = {"id": "deep" + str(i)}
            node["children"] = {"attached": [child]}
            node = child
        with self.assertRaises(ValueError):
            host.validate_snapshot(data)


if __name__ == "__main__":
    unittest.main()
