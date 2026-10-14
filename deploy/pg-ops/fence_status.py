#!/usr/bin/env python3
"""受限 SSH 密钥唯一可调用的旧主隔离状态，不接受远端命令。"""
import json
from pg_ops import run, STATE

try:
    receipt = json.loads((STATE / "fences/shared.json").read_text())
    running = run(["docker", "inspect", "--format", "{{.State.Running}}", "njupt-pg"])
    restart = run(["docker", "inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", "njupt-pg"])
    print(json.dumps({"fenced": receipt.get("fenced") and running == "false" and restart == "no",
                      "system": receipt.get("system"), "time": receipt.get("time")}))
except Exception:
    print(json.dumps({"fenced": False}))
