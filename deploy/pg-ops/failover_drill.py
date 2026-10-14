#!/usr/bin/env python3
"""Infra 隔离双节点演练，验证隔离、提升、旧数据保留、重建与回切。"""
import json
import os
from pathlib import Path
import secrets
import time
import uuid
from pg_ops import atomic_json, load_config, run, sql, STATE
from failover import fence, promote, preserve_and_swap


def wait(src, recovery):
    for _ in range(80):
        try:
            if sql(src, "SELECT pg_is_in_recovery();") == recovery:
                return
        except RuntimeError:
            pass
        time.sleep(1)
    raise RuntimeError("drill server did not become ready")


def main():
    image = load_config()["sources"][0]["image_id"]
    nonce = uuid.uuid4().hex[:10]
    network = "pgops-failover-" + nonce
    workspace = STATE / "drills" / network
    workspace.mkdir(parents=True, mode=0o700)
    password = secrets.token_hex(24)
    passfile = workspace / "repl.pgpass"
    passfile.write_text("*:5432:*:postgres:" + password + "\n")
    uid = int(run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "id", image, "-u", "postgres"]))
    os.chown(passfile, uid, uid)
    os.chmod(passfile, 0o600)
    secret = workspace / "init-password"
    secret.write_text(password)
    os.chmod(secret, 0o600)
    first = {"name": network + "-first", "container": network + "-first", "admin": "postgres",
             "data_root": str(workspace / "first")}
    second = {"name": network + "-second", "container": network + "-second", "admin": "postgres",
              "data_root": str(workspace / "second")}
    for src in [first, second]:
        Path(src["data_root"]).mkdir(mode=0o700)
        os.chown(src["data_root"], uid, uid)
    os.chown(secret, uid, uid)
    started = time.time()
    run(["docker", "network", "create", "--internal", network])

    def start(src):
        run(["docker", "run", "-d", "--name", src["container"], "--network", network,
             "--memory", "512m", "--cpus", "1", "-v", src["data_root"] + ":/var/lib/postgresql",
             "-v", str(passfile) + ":/run/repl.pgpass:ro", "-v", str(secret) + ":/run/init-password:ro",
             "-e", "POSTGRES_PASSWORD_FILE=/run/init-password", image])

    def rejoin(old, new, initial=False):
        replacement = Path(old["data_root"]) / "18" / ("docker" if initial else "docker.rejoin-" + uuid.uuid4().hex[:8])
        replacement.parent.mkdir(exist_ok=True)
        os.chown(replacement.parent, uid, uid)
        run(["docker", "run", "--rm", "--network", network, "--user", str(uid),
             "-v", old["data_root"] + ":/var/lib/postgresql", "-v", str(passfile) + ":/run/repl.pgpass:ro",
             "-e", "PGPASSFILE=/run/repl.pgpass", "--entrypoint", "pg_basebackup", image,
             "-h", new["container"], "-U", "postgres", "-D", "/var/lib/postgresql/18/" + replacement.name,
             "-R", "-X", "stream", "--checkpoint=fast"], timeout=120)
        if initial:
            start(old)
        else:
            preserved = preserve_and_swap(old["data_root"], replacement)
            if not (preserved / "PG_VERSION").exists():
                raise RuntimeError("old data was not preserved")
            run(["docker", "start", old["container"]])
        wait(old, "t")

    try:
        start(first)
        wait(first, "f")
        hba = Path(first["data_root"]) / "18/docker/pg_hba.conf"
        with hba.open("a") as f:
            f.write("\nhost replication postgres 172.16.0.0/12 scram-sha-256\n")
        sql(first, "SELECT pg_reload_conf();")
        sql(first, "CREATE TABLE public.drill_probe(id integer PRIMARY KEY,value text); INSERT INTO public.drill_probe VALUES(1,'before');")
        rejoin(second, first, True)
        receipt = fence(first)
        promote(second, receipt, lambda: run(["docker", "inspect", "--format", "{{.State.Running}}", first["container"]]) == "false")
        sql(second, "INSERT INTO public.drill_probe VALUES(2,'after-switch');")
        rejoin(first, second)
        receipt = fence(second)
        promote(first, receipt, lambda: run(["docker", "inspect", "--format", "{{.State.Running}}", second["container"]]) == "false")
        rejoin(second, first)
        sql(first, "INSERT INTO public.drill_probe VALUES(3,'after-return');")
        for _ in range(30):
            if sql(second, "SELECT count(*) FROM public.drill_probe;") == "3":
                break
            time.sleep(1)
        else:
            raise RuntimeError("returned standby did not receive all committed writes")
        report = {"schema": 1, "ok": True, "seconds": round(time.time() - started, 2),
                  "scenarios": ["old-primary-fenced", "all-commits-replayed", "standby-promoted",
                                "old-data-preserved", "standby-rebuilt", "return-to-original-primary", "replication-resumed"]}
        atomic_json(STATE / "failover-drill-report.json", report)
        print(json.dumps(report))
    finally:
        for src in [first, second]:
            try:
                run(["docker", "rm", "-f", src["container"]])
            except RuntimeError:
                pass
        run(["docker", "network", "rm", network])


if __name__ == "__main__":
    main()
