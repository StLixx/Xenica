#!/usr/bin/env python3
"""Infra 发起跨机备份复制；不需要 core 持有新的 SSH 登录凭据。"""
import json
import fcntl
from pathlib import Path
import subprocess
import sys
import time
from pg_ops import atomic_json, load_config, run, STATE

PEER = "root@100.100.1.103"
REMOTE = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", PEER]


def synchronize():
    cfg = load_config()
    if subprocess.check_output(["hostname"], text=True).strip() != "infra-server":
        raise RuntimeError("replication coordinator must run on Infra")
    run([sys.executable, "/opt/pg-ops/source/pg_ops.py", "encrypt"], timeout=600)
    run(REMOTE + ["python3 -S /opt/pg-ops/source/pg_ops.py encrypt"], timeout=600)
    root = Path(cfg["encrypted_root"])
    for source in ["xenica", "xenica-sketch"]:
        destination = root / source
        destination.mkdir(exist_ok=True, parents=True, mode=0o700)
        run(["rsync", "-a", "--checksum", "--delete-delay", "--exclude=*.partial", "--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=",
             PEER + ":/var/lib/pg-ops/encrypted/" + source + "/", str(destination) + "/"], timeout=600)
    run(["rsync", "-a", "--checksum", "--delete-delay", "--exclude=*.partial", "--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=",
         str(root / "shared") + "/", PEER + ":/var/lib/pg-ops/encrypted/shared/"], timeout=600)
    run(REMOTE + ["python3 -S /opt/pg-ops/source/pg_ops.py cloud"], timeout=1800)
    # 只在远端成功完成云端同步后确认 RPO 所依赖的复制回执。
    atomic_json(STATE / "cloud.json", {"ok": True, "completed": time.time()})
    atomic_json(STATE / "replication.json", {"ok": True, "completed": time.time()})


if __name__ == "__main__":
    try:
        STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (STATE / "replicate.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            synchronize()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        raise SystemExit(1)
