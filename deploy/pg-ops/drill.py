#!/usr/bin/env python3
"""从独立云端密文恢复三集群，并验证命名恢复点之前的状态。"""
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid
from pg_ops import atomic_json, load_config, restore_drill, run, sql, root, verify_identity, STATE

PEER = ["ssh", "-o", "BatchMode=yes", "root@100.100.1.103"]


def remote_python(code):
    return run(PEER + ["python3 -S -"], input=code.encode(), timeout=180)


def prepare_probe(src, remote=False):
    target = "pgops_" + uuid.uuid4().hex
    token = uuid.uuid4().hex
    query = f"""CREATE SCHEMA IF NOT EXISTS pgops_validation;
CREATE TABLE IF NOT EXISTS pgops_validation.marker(id text PRIMARY KEY,value text);
INSERT INTO pgops_validation.marker VALUES('{token}','before');
SELECT pg_create_restore_point('{target}');
UPDATE pgops_validation.marker SET value='after' WHERE id='{token}';
SELECT pg_switch_wal();"""
    if remote:
        code = "import sys;sys.path.insert(0,'/opt/pg-ops/source');from pg_ops import sql;sql(" + repr(src) + "," + repr(query) + ")"
        remote_python(code)
    else:
        verify_identity(src)
        sql(src, query)
    return {"target": target, "token": token, "created": time.time()}


def cloud_restore():
    if subprocess.check_output(["hostname"], text=True).strip() != "infra-server":
        raise RuntimeError("all recovery drills run on Infra")
    cfg = load_config()
    core = json.loads(run(PEER + ["cat /etc/pg-ops/config.json"]))
    local_sources = [s for s in cfg['sources'] if s.get('backup', True)]
    remote_sources = [s for s in core['sources'] if s.get('backup', True)]
    sources = local_sources + remote_sources
    if len({s['name'] for s in sources}) != len(sources):
        raise RuntimeError('backup names must be unique across hosts')
    remote_names = {s['name'] for s in remote_sources}
    probes = {s["name"]: prepare_probe(s, s["name"] in remote_names) for s in sources}
    independent_started = time.time()
    run([sys.executable, "/opt/pg-ops/source/replicate.py"], timeout=2400)
    independently_copied = time.time()
    nonce = uuid.uuid4().hex[:12]
    download = "/var/lib/pg-ops/cloud-download-" + nonce
    selections = []
    for source in sources:
        status = "/var/lib/pg-ops/status/" + source["name"] + "-backup.json"
        content = run(PEER + ["cat " + status]) if source["name"] in remote_names else Path(status).read_text()
        stamp = Path(json.loads(content)["path"]).name
        selections += [" --include='" + source["name"] + "/base/" + stamp + "/**'",
                       " --include='" + source["name"] + "/archive/**'"]
    run(PEER + ["mkdir -m 700 " + download + "; rclone copy drive02:PG-operations-v1 " + download +
                "".join(selections) + " --checksum --transfers 4 --checkers 4 --multi-thread-streams 4"
                " --multi-thread-cutoff 8M --retries 2 --timeout 30s"], timeout=1800)
    local = STATE / ("cloud-drill-" + nonce)
    local.mkdir(mode=0o700)
    run(["rsync", "-a", "--checksum", "root@100.100.1.103:" + download + "/", str(local / "encrypted") + "/"], timeout=600)
    restored = local / "decoded"
    for source in sources:
        private = root({**source, 'data_root': str(restored / source['name'])})
        private.mkdir(parents=True, mode=0o700)
        for cipher in (local / "encrypted" / source["name"]).rglob("*.gpg"):
            destination = private / str(cipher.relative_to(local / "encrypted" / source["name"]))[:-4]
            destination.parent.mkdir(exist_ok=True, parents=True, mode=0o700)
            run(["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-file", cfg["key_file"],
                 "--output", str(destination), "--decrypt", str(cipher)], timeout=180)
    results = []
    for source in sources:
        probe = probes[source["name"]]
        private = root({**source, 'data_root': str(restored / source['name'])})
        base = sorted(p.parent for p in (private / "base").glob("*/complete.json"))[-1]
        test_source = {**source, "data_root": str(private.parent)}
        test_source['image_id'] = source['image']
        for target in [None, probe["target"]]:
            drill, result = restore_drill(test_source, base, target)
            try:
                if target:
                    value = sql(drill, "SELECT value FROM pgops_validation.marker WHERE id='" + probe["token"] + "';")
                    if value != "before":
                        raise RuntimeError("PITR did not restore the value before the simulated mistake")
                    result["pitr_probe"] = "before"
                    result["independent_copy_latency_seconds"] = round(independently_copied - probe["created"], 2)
                results.append(result)
            finally:
                run(["docker", "stop", drill["container"]])
                run(["docker", "rm", drill["container"]])
        cleanup = "DELETE FROM pgops_validation.marker WHERE id='" + probe["token"] + "';"
        if source["name"] not in remote_names:
            sql(source, cleanup)
        else:
            remote_python("import sys;sys.path.insert(0,'/opt/pg-ops/source');from pg_ops import sql;sql(" + repr(source) + "," + repr(cleanup) + ")")
    report = {"schema": 1, "ok": True, "completed": time.time(), "results": results,
              "end_to_end_seconds": round(time.time() - independent_started, 2),
              "independent_source": "drive02:PG-operations-v1"}
    atomic_json(STATE / "cloud-restore-report.json", report)
    print(json.dumps(report))


if __name__ == "__main__":
    cloud_restore()
