#!/usr/bin/env python3
"""仅在 Tailscale 地址公开不含秘密的健康结果，供现有探活器读取。"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import socket
import time
from pg_ops import STATE


class Health(BaseHTTPRequestHandler):
    def do_GET(self):
        report = {"ok": False, "alerts": ["monitor not initialized"]}
        try:
            raw = json.loads((STATE / "monitor.json").read_text())
            report = {"ok": raw["ok"] and time.time() - raw["checked"] < 180, "alerts": raw["alerts"]}
            if time.time() - raw["checked"] >= 180:
                report["alerts"] = report["alerts"] + ["monitor stale"]
        except (OSError, ValueError, KeyError):
            pass
        self.send_response(200 if report["ok"] else 503)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(report).encode())

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    address = "100.100.1.202" if socket.gethostname() == "infra-server" else "100.100.1.103"
    HTTPServer((address, 8097), Health).serve_forever()
