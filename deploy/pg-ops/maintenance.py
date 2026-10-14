#!/usr/bin/env python3
"""手动切换后的角色登记、应用重连与保留旧数据的备库重建。"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import time
import uuid
from pg_ops import CONFIG, STATE, atomic_json, load_config, run, sql
from failover import preserve_and_swap

HOSTS = {"100.100.1.202", "100.100.1.103"}


def set_role(src, cfg):
    recovery = sql(src, "SELECT pg_is_in_recovery();") == "t"
    src["name"] = "shared-standby" if recovery else "shared"
    src["backup"] = not recovery
    src["require_standby"] = not recovery
    if not recovery:
        uid = int(run(["docker", "exec", src["container"], "id", "-u", "postgres"]))
        for child in ["pgops", "pgops/base", "pgops/archive"]:
            p = Path(src["data_root"]) / child
            p.mkdir(exist_ok=True, mode=0o700)
            os.chown(p, uid, uid)
        hook = Path(src["data_root"]) / "pgops/archive.sh"
        shutil.copyfile("/opt/pg-ops/source/archive.sh", hook)
        os.chown(hook, uid, uid)
        os.chmod(hook, 0o700)
        for statement in ["ALTER SYSTEM SET archive_mode='on';", "ALTER SYSTEM SET archive_timeout='60s';",
                          "ALTER SYSTEM SET archive_command='/var/lib/postgresql/pgops/archive.sh \"%p\" \"%f\"';",
                          "ALTER SYSTEM SET shared_preload_libraries='pg_stat_statements';",
                          "ALTER SYSTEM SET max_slot_wal_keep_size='2GB';"]:
            sql(src, statement)
        run(["docker", "update", "--memory", "2g", "--memory-swap", "2g", "--cpus", "4", "--restart=unless-stopped", src["container"]])
        run(["docker", "restart", src["container"]])
        for _ in range(60):
            try:
                if sql(src, "SELECT pg_is_in_recovery();") == "f":
                    break
            except RuntimeError:
                pass
            time.sleep(1)
        else:
            raise RuntimeError("primary did not become ready after operational configuration")
    else:
        run(["docker", "update", "--memory", "1g", "--memory-swap", "1g", "--cpus", "2", "--restart=unless-stopped", src["container"]])
    compose = Path("/opt/stacks/njupt-pg/compose.yaml")
    text = compose.read_text()
    text = re.sub(r"(?m)^(\s*restart:)\s*.*$", r"\1 unless-stopped", text)
    text = re.sub(r"(?m)^(\s*mem_limit:)\s*.*$", lambda m: m.group(1) + (" 1g" if recovery else " 2g"), text)
    text = re.sub(r"(?m)^(\s*cpus:)\s*.*$", lambda m: m.group(1) + (" 2" if recovery else " 4"), text)
    compose.write_text(text)
    atomic_json(CONFIG, cfg)
    print(json.dumps({"registered": src["name"], "recovery": recovery}))


def switch_apps(host):
    if host not in HOSTS or run(["hostname"]) != "infra-server":
        raise RuntimeError("application routing is maintained on Infra with an approved database host")
    target = "127.0.0.1" if host == "100.100.1.202" else host
    for path in ["/etc/pg-ops/runtime-njupt_notice.env", "/etc/pg-ops/runtime-njupt_console.env",
                 "/opt/njupt-notice/app/.env", "/opt/njupt-console/.env"]:
        p = Path(path)
        text = re.sub(r"(?m)^PGHOST=.*$", "PGHOST=" + target, p.read_text())
        p.write_text(text)
        os.chmod(p, 0o600)
    run(["systemctl", "restart", "njupt-console", "njupt-notice-dashboard", "njupt-notice-notifier"])
    penpot = Path('/opt/penpot-ops/routing.py')
    if penpot.exists() and Path('/etc/penpot-ops/backend.env').exists():
        run(['python3', '-S', str(penpot), host])
    print(json.dumps({"applications_database_host": host}))


def rejoin(src, host):
    if host not in HOSTS:
        raise RuntimeError("unapproved new-primary host")
    if run(["docker", "inspect", "--format", "{{.State.Running}}", src["container"]]) != "false":
        raise RuntimeError("old server must be fenced and stopped before rejoin")
    receipt_file = STATE / "fences" / (src["name"] + ".json")
    receipt = json.loads(receipt_file.read_text())
    if not receipt.get("fenced"):
        raise RuntimeError("fencing receipt required")
    values = dict(line.split("=", 1) for line in Path("/opt/stacks/njupt-pg/repl.env").read_text().splitlines() if "=" in line)
    image = run(["docker", "inspect", "--format", "{{.Image}}", src["container"]])
    uid = int(run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "id", image, "-u", "postgres"]))
    private = Path(src["data_root"]) / "pgops"
    private.mkdir(exist_ok=True, mode=0o700)
    os.chown(private, uid, uid)
    passwd = private / "rejoin.pgpass"
    passwd.write_text(host + ":5433:*:repl:" + values["PGPASSWORD"] + "\n")
    os.chown(passwd, uid, uid)
    os.chmod(passwd, 0o600)
    replacement = Path(src["data_root"]) / "18" / ("docker.rejoin-" + uuid.uuid4().hex[:12])
    slot = "pgops_" + run(["hostname"]).replace("-", "_") + "_" + uuid.uuid4().hex[:8]
    run(["docker", "run", "--rm", "--network", "host", "--user", str(uid), "--memory", "512m", "--cpus", "1",
         "-v", src["data_root"] + ":/var/lib/postgresql", "-e", "PGPASSFILE=/var/lib/postgresql/pgops/rejoin.pgpass",
         "--entrypoint", "pg_basebackup", image, "-h", host, "-p", "5433", "-U", "repl",
         "-D", "/var/lib/postgresql/18/" + replacement.name, "-R", "-X", "stream", "--checkpoint=fast",
         "--create-slot", "--slot", slot], timeout=1800)
    control = run(["docker", "run", "--rm", "--network", "none", "-v", str(replacement) + ":/replacement:ro",
                   "--entrypoint", "pg_controldata", image, "/replacement"])
    system = re.search(r"Database system identifier:\s+(\d+)", control).group(1)
    if system != receipt["system"]:
        raise RuntimeError("new-primary system identity differs; old data remains untouched")
    preserved = preserve_and_swap(src["data_root"], replacement)
    run(["docker", "start", src["container"]])
    for _ in range(60):
        try:
            if sql(src, "SELECT pg_is_in_recovery();") == "t":
                break
        except RuntimeError:
            pass
        time.sleep(1)
    else:
        raise RuntimeError("rebuilt standby did not become ready; preserved data is available")
    print(json.dumps({"rejoined": True, "preserved": str(preserved), "slot": slot}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["set-role", "switch-apps", "rejoin"])
    p.add_argument("--host")
    a = p.parse_args()
    cfg = load_config()
    source = next(s for s in cfg["sources"] if s["container"] == "njupt-pg")
    if a.action == "set-role":
        set_role(source, cfg)
    elif a.action == "switch-apps":
        switch_apps(a.host)
    else:
        rejoin(source, a.host)
