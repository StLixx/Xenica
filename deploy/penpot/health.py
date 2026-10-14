#!/usr/bin/env python3
"""仅在 Tailscale 提供 Penpot 应用与备份健康状态。"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request
import urllib.error


def health():
    alerts = []
    for service in ['frontend', 'backend', 'exporter', 'valkey']:
        try:
            state = json.loads(subprocess.check_output(['docker', 'inspect', 'penpot-penpot-' + service + '-1'], timeout=5))[0]['State']
            if not state['Running'] or state['Restarting'] or state.get('Health', {}).get('Status', 'healthy') != 'healthy':
                alerts.append('container:' + service)
        except Exception:
            alerts.append('container:' + service)
    try:
        with urllib.request.urlopen('http://100.100.1.202:9001/', timeout=5) as response:
            if response.status != 200:
                alerts.append('frontend-http')
    except Exception:
        alerts.append('frontend-http')
    try:
        request = urllib.request.Request('http://100.100.1.202:9001/api/rpc/command/get-all-projects',
                                         data=b'{}', headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(request, timeout=5).close()
        alerts.append('backend-permission')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            alerts.append('backend-http')
    except Exception:
        alerts.append('backend-http')
    try:
        backup = json.loads(Path('/var/lib/penpot-ops/backup.json').read_text())
        if not backup.get('ok') or not backup.get('independent') or time.time() - backup['completed'] > 26 * 3600:
            alerts.append('backup')
    except Exception:
        alerts.append('backup')
    if shutil.disk_usage('/mnt/HDD').free < 5 * 1024 ** 3:
        alerts.append('disk-space')
    return {'ok': not alerts, 'alerts': alerts}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != '/health':
            self.send_error(404)
            return
        report = health()
        self.send_response(200 if report['ok'] else 503)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(report).encode())

    def log_message(self, *_):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('100.100.1.202', 9017), Handler).serve_forever()
