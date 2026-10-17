"""Edge deployment tests use fake APIs; no production changes are made."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location("mineru_edge", Path(__file__).with_name("edge.py"))
edge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)

CONFIG = """server {
    listen 80;
    listen 443 ssl;
    server_name mineru.truebigsand.top;
    client_max_body_size 1m;
    location /api/special {
        client_max_body_size 4m;
        proxy_read_timeout 60s;
    }
    include /www/sites/mineru/proxy/*.conf;
}
"""


class Fake:
    def __init__(self):
        self.template = {"id": 27, "primaryDomain": edge.TEMPLATE_DOMAIN, "type": "proxy", "protocol": "HTTPS",
                         "webSiteSSLId": 8, "webSiteGroupId": 1, "domains": []}
        self.target = None
        self.records = []
        self.config = CONFIG
        self.mutations = []

    def panel(self, path, body=None, method=None):
        if path == "/websites/search":
            items = [self.template] + ([self.target] if self.target else [])
            return {"items": items, "total": len(items)}
        if path == "/websites/27":
            return copy.deepcopy(self.template)
        if path == "/websites/29":
            return copy.deepcopy(self.target)
        if path == "/websites/ssl/8":
            return {"id": 8, "pem": "public certificate"}
        if path == "/websites" and method == "POST":
            self.mutations.append(("website", body))
            self.target = {"id": 29, "primaryDomain": edge.DOMAIN, "type": "proxy", "protocol": "HTTPS",
                           "proxy": edge.UPSTREAM, "webSiteSSLId": 8, "domains": [{"domain": edge.DOMAIN}]}
            return
        if path == "/websites/proxies":
            return [{"proxyPass": edge.UPSTREAM, "content": "proxy_set_header Host $host;\nproxy_http_version 1.1;"}]
        if path == "/websites/29/config/openresty":
            return {"content": self.config}
        if path == "/websites/nginx/update" and method == "POST":
            self.mutations.append(("config", body))
            self.config = body["content"]
            return
        raise AssertionError((path, method))

    def cf(self, path, body=None, method=None):
        if path.startswith("/zones?"):
            return [{"id": "zone"}]
        if method == "POST":
            self.mutations.append(("dns", body))
            self.records = [copy.deepcopy(body)]
            return
        return copy.deepcopy(self.records)


class EdgeTests(unittest.TestCase):
    def setUp(self):
        self.fake = Fake()
        self.cert = mock.patch.object(edge, "certificate_public", return_value={"id": 8, "sans": ["*.truebigsand.top"]})
        self.cert.start()

    def tearDown(self):
        self.cert.stop()

    def test_dry_run_reads_only_and_creates_no_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "private-state"
            result = edge.provision(self.fake.panel, self.fake.cf, state=state)
            self.assertFalse(result["applied"])
            self.assertEqual(result["website_action"], "create")
            self.assertEqual(result["dns_action"], "create")
            self.assertFalse(state.exists())
            self.assertFalse(self.fake.mutations)

    def test_apply_is_idempotent_and_saves_private_original(self):
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "private-state"
            result = edge.provision(self.fake.panel, self.fake.cf, apply=True, state=state)
            self.assertTrue(result["applied"])
            self.assertEqual([kind for kind, _ in self.fake.mutations], ["website", "config", "dns"])
            self.assertEqual((state / "edge-original-29.json").stat().st_mode & 0o777, 0o600)
            self.fake.mutations.clear()
            edge.provision(self.fake.panel, self.fake.cf, apply=True, state=state)
            self.assertFalse(self.fake.mutations)

    def test_existing_foreign_dns_rejected_before_any_mutation(self):
        self.fake.records = [{"type": "A", "name": edge.DOMAIN, "content": "192.0.2.1", "proxied": False}]
        with self.assertRaises(edge.EdgeError):
            edge.provision(self.fake.panel, self.fake.cf, apply=True)
        self.assertFalse(self.fake.mutations)

    def test_existing_foreign_website_and_secondary_domain_are_rejected(self):
        for target in [
            {"id": 29, "primaryDomain": edge.DOMAIN, "type": "proxy", "proxy": "http://elsewhere", "domains": []},
            {"id": 29, "primaryDomain": "other.example", "type": "proxy", "proxy": edge.UPSTREAM,
             "domains": [{"domain": edge.DOMAIN}]},
            {"id": 29, "primaryDomain": "other.example", "alias": "mineru", "domains": []},
        ]:
            self.fake.target = target
            with self.subTest(target=target), self.assertRaises(edge.EdgeError):
                edge.provision(self.fake.panel, self.fake.cf, apply=True)
            self.assertFalse(self.fake.mutations)

    def test_settings_are_idempotent_and_preserve_location_limits(self):
        result = edge.configure(CONFIG)
        self.assertEqual(edge.configure(result), result)
        self.assertIn("client_max_body_size 205m;", result)
        self.assertIn("        client_max_body_size 4m;", result)
        self.assertIn("        proxy_read_timeout 60s;", result)
        self.assertNotIn("client_max_body_size 1m;", result)
        self.assertIn("return 308 https://$host$request_uri;", result)

    def test_ambiguous_or_unbalanced_config_is_rejected(self):
        for content in [CONFIG + CONFIG, CONFIG.removesuffix("}\n"), "no server block", CONFIG.replace("1m;", "1m; other value;")]:
            with self.subTest(content=content), self.assertRaises(edge.EdgeError):
                edge.configure(content)

    def test_template_drift_is_rejected_without_mutation(self):
        self.fake.template["primaryDomain"] = "changed.example"
        with self.assertRaises(edge.EdgeError):
            edge.provision(self.fake.panel, self.fake.cf, apply=True)
        self.assertFalse(self.fake.mutations)


class CertificateTests(unittest.TestCase):
    def test_noncovering_certificate_is_rejected(self):
        failure = mock.Mock(returncode=1, stdout="hostname does not match", stderr="")
        with mock.patch.object(edge.subprocess, "run", return_value=failure):
            with self.assertRaises(edge.EdgeError):
                edge.certificate_public({"id": 8, "pem": "wrong public certificate"})

    def test_missing_certificate_is_rejected(self):
        with self.assertRaises(edge.EdgeError):
            edge.certificate_public({"id": 8})


if __name__ == "__main__":
    unittest.main()
