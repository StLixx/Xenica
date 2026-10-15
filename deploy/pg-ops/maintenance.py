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
from pg_ops import CONFIG, STATE, atomic_json, load_config, run, sql, root, in_container, verify_identity
from failover import preserve_and_swap

HOSTS = {"100.100.1.202", "100.100.1.103"}


def primary_port(src):
    port = src.get("primary_port")
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise RuntimeError("explicit primary port required")
    return port


def set_role(src, cfg):
    verify_identity(src)
    if not src.get('primary_name') or not src.get('standby_name'):
        raise RuntimeError('explicit topology names required')
    recovery = sql(src, "SELECT pg_is_in_recovery();") == "t"
    src["name"] = src['standby_name'] if recovery else src['primary_name']
    src["backup"] = not recovery
    src["require_standby"] = not recovery
    if not recovery:
        uid = int(run(["docker", "exec", src["container"], "id", "-u", "postgres"]))
        for child in ["", "base", "archive"]:
            p = root(src) / child
            p.mkdir(exist_ok=True, mode=0o700)
            os.chown(p, uid, uid)
        hook = root(src) / "archive.sh"
        shutil.copyfile("/opt/pg-ops/source/archive.sh", hook)
        os.chown(hook, uid, uid)
        os.chmod(hook, 0o700)
        for statement in ["ALTER SYSTEM SET archive_mode='on';", "ALTER SYSTEM SET archive_timeout='60s';",
                          "ALTER SYSTEM SET archive_command='" + in_container('archive.sh', src) + " \"%p\" \"%f\"';"]:
            sql(src, statement)
        run(["docker", "update", "--restart=unless-stopped", src["container"]])
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
    compose = Path(src['compose_path'])
    text = compose.read_text()
    text = re.sub(r"(?m)^(\s*restart:)\s*.*$", r"\1 unless-stopped", text)
    compose.write_text(text)
    atomic_json(CONFIG, cfg)
    print(json.dumps({"registered": src["name"], "recovery": recovery}))


def switch_apps(host, src=None):
    if host not in HOSTS or run(["hostname"]) != "infra-server":
        raise RuntimeError("application routing is maintained on Infra with an approved database host")
    if not src or not src.get('app_env_paths') or not src.get('system_id'):
        raise RuntimeError('explicit application topology required')
    port = primary_port(src)
    if host == '100.100.1.202':
        verify_identity(src)
        if sql(src, 'SELECT pg_is_in_recovery();') != 'f':
            raise RuntimeError('application target is not primary')
    else:
        code = "import sys;sys.path.insert(0,'/opt/pg-ops/source');from pg_ops import load_config,verify_identity,sql;s=next(s for s in load_config()['sources'] if s.get('system_id')==" + repr(src['system_id']) + ");verify_identity(s);assert sql(s,'SELECT pg_is_in_recovery();')=='f'"
        run(['ssh', '-o', 'BatchMode=yes', 'root@' + host, 'python3 -S -'], input=code.encode())
    target = "127.0.0.1" if host == "100.100.1.202" else host
    prepared = []
    for path in src['app_env_paths']:
        p = Path(path)
        text = re.sub(r"(?m)^PGHOST=.*$", "PGHOST=" + target, p.read_text())
        text = re.sub(r"(?m)^PGPORT=.*$", "PGPORT=" + str(port), text)
        if not re.search(r'(?m)^PGHOST=', text) or not re.search(r'(?m)^PGPORT=', text):
            raise RuntimeError('application endpoint fields missing')
        prepared.append((p, text))
    for p, text in prepared:
        rollback = p.with_suffix(p.suffix + '.before-pgops')
        shutil.copyfile(p, rollback)
        os.chmod(rollback, 0o600)
        p.write_text(text)
        os.chmod(p, 0o600)
    run(["systemctl", "restart", "njupt-console", "njupt-notice-dashboard", "njupt-notice-notifier"])
    print(json.dumps({"applications_database_host": host}))


def rejoin(src, host):
    if host not in HOSTS:
        raise RuntimeError("unapproved new-primary host")
    if run(["docker", "inspect", "--format", "{{.State.Running}}", src["container"]]) != "false":
        raise RuntimeError("old server must be fenced and stopped before rejoin")
    port = primary_port(src)
    receipt_file = STATE / "fences" / (src["name"] + ".json")
    receipt = json.loads(receipt_file.read_text())
    if not receipt.get("fenced"):
        raise RuntimeError("fencing receipt required")
    if src.get('system_id') and receipt.get('system') != src['system_id']:
        raise RuntimeError('fencing receipt cluster identity mismatch')
    values = dict(line.split("=", 1) for line in Path(src.get('replication_env', '/opt/stacks/njupt-pg/repl.env')).read_text().splitlines() if "=" in line)
    image = run(["docker", "inspect", "--format", "{{.Image}}", src["container"]])
    uid = int(run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "id", image, "-u", "postgres"]))
    private = root(src)
    private.mkdir(exist_ok=True, mode=0o700)
    os.chown(private, uid, uid)
    passwd = private / "rejoin.pgpass"
    passwd.write_text(host + ":" + str(port) + ":*:repl:" + values[src.get('replication_password_key', 'PGPASSWORD')] + "\n")
    os.chown(passwd, uid, uid)
    os.chmod(passwd, 0o600)
    replacement = Path(src["data_root"]) / "18" / ("docker.rejoin-" + uuid.uuid4().hex[:12])
    slot = "pgops_" + run(["hostname"]).replace("-", "_") + "_" + uuid.uuid4().hex[:8]
    run(["docker", "run", "--rm", "--network", "host", "--user", str(uid), "--memory", "512m", "--cpus", "1",
         "-v", src["data_root"] + ":/var/lib/postgresql", "-e", "PGPASSFILE=" + in_container('rejoin.pgpass', src),
         "--entrypoint", "pg_basebackup", image, "-h", host, "-p", str(port), "-U", "repl",
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
    p.add_argument("--source", required=True)
    a = p.parse_args()
    cfg = load_config()
    source = next(s for s in cfg["sources"] if s["name"] == a.source)
    if a.action == "set-role":
        set_role(source, cfg)
    elif a.action == "switch-apps":
        switch_apps(a.host, source)
    else:
        rejoin(source, a.host)
