#!/usr/bin/env python3
"""受限 SSH 密钥唯一可调用的旧主隔离状态，不接受远端命令。"""
import json
from pg_ops import run, STATE, load_config

try:
    sources = load_config()['sources']
    candidates = [STATE / 'fences' / (s['name'] + '.json') for s in sources]
    candidates = [p for p in candidates if p.exists()]
    receipt = json.loads(max(candidates, key=lambda p: p.stat().st_mtime).read_text())
    source = next(s for s in sources if s['container'] == receipt['container'] and s.get('system_id') == receipt['system'])
    running = run(["docker", "inspect", "--format", "{{.State.Running}}", source['container']])
    restart = run(["docker", "inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", source['container']])
    print(json.dumps({"fenced": receipt.get("fenced") and running == "false" and restart == "no",
                      "system": receipt.get("system"), "time": receipt.get("time")}))
except Exception:
    print(json.dumps({"fenced": False}))
