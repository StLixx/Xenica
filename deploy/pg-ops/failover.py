#!/usr/bin/env python3
"""受控主备维护：提升要求可验证的旧主隔离，重建保留旧目录。"""
import argparse
import json
import os
from pathlib import Path
import re
import time
from pg_ops import atomic_json, load_config, run, sql, STATE


def identity(src):
    return sql(src, "SELECT system_identifier FROM pg_control_system();")


def fence(src):
    if sql(src, "SELECT pg_is_in_recovery();") != "f":
        raise RuntimeError("only the current primary can be fenced")
    system = identity(src)
    sql(src, "CHECKPOINT;")
    lsn = sql(src, "SELECT pg_current_wal_flush_lsn();")
    run(["docker", "update", "--restart=no", src["container"]])
    run(["docker", "stop", "--time", "60", src["container"]])
    if run(["docker", "inspect", "--format", "{{.State.Running}}", src["container"]]) != "false":
        raise RuntimeError("old primary was not stopped")
    if src.get("compose_path"):
        path = Path(src["compose_path"])
        previous = path.read_text()
        atomic_json(STATE / "fences" / (src["name"] + "-compose.json"), {"path": str(path), "before": previous})
        path.write_text(re.sub(r"(?m)^(\s*restart:)\s*.*$", r"\1 'no'", previous))
    receipt = {"schema": 1, "system": system, "flush_lsn": lsn, "container": src["container"],
               "fenced": True, "time": time.time()}
    atomic_json(STATE / "fences" / (src["name"] + ".json"), receipt)
    return receipt


def promote(standby, receipt, confirm_fence):
    if not receipt.get("fenced") or time.time() - receipt.get("time", 0) > 300:
        raise RuntimeError("fresh fence receipt required")
    if not confirm_fence():
        raise RuntimeError("old-primary isolation could not be reverified")
    if sql(standby, "SELECT pg_is_in_recovery();") != "t" or identity(standby) != receipt["system"]:
        raise RuntimeError("standby identity mismatch")
    lsn = receipt["flush_lsn"]
    if not re.fullmatch(r"[0-9A-F]+/[0-9A-F]+", lsn):
        raise RuntimeError("invalid flush LSN")
    for _ in range(60):
        if sql(standby, f"SELECT pg_last_wal_replay_lsn()>='{lsn}'::pg_lsn;") == "t":
            break
        time.sleep(1)
    else:
        raise RuntimeError("standby has not replayed all fenced commits")
    if not confirm_fence():
        raise RuntimeError("old primary isolation changed")
    sql(standby, "SELECT pg_promote(wait=>true,wait_seconds=>30);")
    if sql(standby, "SELECT pg_is_in_recovery();") != "f":
        raise RuntimeError("promotion failed")
    atomic_json(STATE / "fences" / "promotion.json", {"ok": True, "system": receipt["system"], "time": time.time()})


def preserve_and_swap(data_root, replacement):
    data_root, replacement = Path(data_root).resolve(), Path(replacement).resolve()
    current = data_root / "18/docker"
    if replacement.parent != data_root / "18" or not replacement.name.startswith("docker.rejoin-"):
        raise RuntimeError("replacement must be an isolated sibling of PGDATA")
    if not (replacement / "PG_VERSION").exists() or not (replacement / "standby.signal").exists():
        raise RuntimeError("replacement is not a complete standby backup")
    if not current.exists() or current.is_symlink():
        raise RuntimeError("unexpected current PGDATA")
    preserved = current.with_name("docker.fenced-" + str(time.time_ns()))
    current.rename(preserved)
    try:
        replacement.rename(current)
    except Exception:
        preserved.rename(current)
        raise
    return preserved


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["fence", "status"])
    p.add_argument("--source", required=True)
    a = p.parse_args()
    src = next(s for s in load_config()["sources"] if s["name"] == a.source)
    if a.action == "fence":
        print(json.dumps(fence(src)))
    else:
        print(json.dumps({"system": identity(src), "recovery": sql(src, "SELECT pg_is_in_recovery();")}))
