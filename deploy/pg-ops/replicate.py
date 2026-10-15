#!/usr/bin/env python3
"""Infra 发起跨机备份复制；不需要 core 持有新的 SSH 登录凭据。"""
import json
import os
import fcntl
from pathlib import Path
import subprocess
import sys
import time
from pg_ops import atomic_json, load_config, run as operation, STATE

PEER = "root@100.100.1.103"
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ControlMaster=auto',
       '-o', 'ControlPersist=120', '-o', f'ControlPath=/run/pgops-{os.getpid()}.sock']
REMOTE = SSH + [PEER]


def run(args, **kwargs):
    # 本模块只做幂等复制；复用连接并重试短暂的 SSH 断连，不重试主备切换。
    if args[0] == 'rsync':
        args = [args[0], '-e', ' '.join(SSH)] + args[1:]
    for attempt in range(3):
        try:
            return operation(args, **kwargs)
        except RuntimeError:
            if attempt == 2:
                raise
            time.sleep(2)


def synchronize():
    cfg = load_config()
    if subprocess.check_output(["hostname"], text=True).strip() != "infra-server":
        raise RuntimeError("replication coordinator must run on Infra")
    run([sys.executable, "/opt/pg-ops/source/pg_ops.py", "encrypt"], timeout=600)
    run(REMOTE + ["python3 -S /opt/pg-ops/source/pg_ops.py encrypt"], timeout=600)
    root = Path(cfg["encrypted_root"])
    peer_cfg = json.loads(run(REMOTE + ["cat /etc/pg-ops/config.json"]))
    for source in [s["name"] for s in peer_cfg["sources"] if s.get("backup", True)]:
        destination = root / source
        destination.mkdir(exist_ok=True, parents=True, mode=0o700)
        run(["rsync", "-a", "--checksum", "--delete-delay", "--exclude=*.partial", "--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=",
             PEER + ":/var/lib/pg-ops/encrypted/" + source + "/", str(destination) + "/"], timeout=600)
    for source in [s["name"] for s in cfg["sources"] if s.get("backup", True)]:
        run(["rsync", "-a", "--checksum", "--delete-delay", "--exclude=*.partial", "--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=",
             str(root / source) + "/", PEER + ":/var/lib/pg-ops/encrypted/" + source + "/"], timeout=600)
    run(REMOTE + ["python3 -S /opt/pg-ops/source/pg_ops.py cloud"], timeout=1800)
    # 只在远端成功完成云端同步后确认 RPO 所依赖的复制回执。
    receipt = json.loads(run(REMOTE + ["cat /var/lib/pg-ops/cloud.json"]))
    atomic_json(STATE / "cloud.json", receipt)
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
