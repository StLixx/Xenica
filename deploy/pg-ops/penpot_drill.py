#!/usr/bin/env python3
"""官方 Penpot 后端在隔离 PG18、非超级用户下的真实 RPC 持久化探针。"""
import http.cookiejar
import json
import os
import re
from pathlib import Path
import secrets
import socket
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pg_ops import atomic_json, load_config, run, sql, STATE
from permissions import isolate


def main():
    started = time.time()
    nonce = uuid.uuid4().hex[:10]
    prefix = "pgops-penpot-" + nonce
    workspace = STATE / "drills" / prefix
    workspace.mkdir(parents=True, mode=0o700)
    network = prefix
    db, redis, backend = [prefix + "-" + x for x in ["db", "redis", "backend"]]
    pg_image = load_config()["sources"][0]["image_id"]
    backend_image = "penpotapp/backend@sha256:2df1b3440d2a82cc3571db211b4ffdfa2b89ccc910759e8d5e9387fb62971b5c"
    secret = workspace / "init-password"
    secret.write_text(secrets.token_hex(24))
    uid = int(run(["docker", "run", "--rm", "--network", "none", "--entrypoint", "id", pg_image, "-u", "postgres"]))
    os.chown(secret, uid, uid)
    os.chmod(secret, 0o600)
    data = workspace / "postgres"
    data.mkdir(mode=0o700)
    os.chown(data, uid, uid)
    (data / "pgops").mkdir(mode=0o700)
    os.chown(data / "pgops", uid, uid)
    assets = workspace / "assets"
    assets.mkdir(mode=0o777)
    os.chmod(assets, 0o777)
    source = {"name": "penpot-drill", "container": db, "admin": "postgres", "data_root": str(data)}
    run(["docker", "network", "create", "--internal", network])
    try:
        run(["docker", "run", "-d", "--name", db, "--network", network, "--network-alias", "db",
             "--memory", "512m", "--cpus", "1", "-v", str(data) + ":/var/lib/postgresql",
             "-v", str(secret) + ":/run/init-password:ro", "-e", "POSTGRES_PASSWORD_FILE=/run/init-password", pg_image])
        for _ in range(60):
            try:
                sql(source, "SELECT 1;")
                break
            except RuntimeError:
                time.sleep(1)
        else:
            raise RuntimeError("isolated PostgreSQL failed to start")
        sql(source, "CREATE DATABASE penpot;")
        role = isolate(source, "penpot", "penpot_app", 12)
        run(["docker", "run", "-d", "--name", redis, "--network", network, "--network-alias", "redis",
             "--memory", "128m", "--cpus", "1", "valkey/valkey:9", "valkey-server", "--maxmemory", "64mb"])
        env = {"PENPOT_DATABASE_URI": "postgresql://db/penpot", "PENPOT_DATABASE_USERNAME": role["user"],
               "PENPOT_DATABASE_PASSWORD": role["password"], "PENPOT_DATABASE_MIN_POOL_SIZE": "2",
               "PENPOT_DATABASE_MAX_POOL_SIZE": "10", "PENPOT_REDIS_URI": "redis://redis/0",
               "PENPOT_PUBLIC_URI": "http://127.0.0.1:18160", "PENPOT_SECRET_KEY": secrets.token_urlsafe(64),
               "PENPOT_FLAGS": "enable-registration enable-login-with-password disable-email-verification disable-secure-session-cookies enable-air-gapped-conf",
               "PENPOT_OBJECTS_STORAGE_BACKEND": "fs", "PENPOT_OBJECTS_STORAGE_FS_DIRECTORY": "/opt/data/assets",
               "PENPOT_TELEMETRY_ENABLED": "false", "JAVA_OPTS": "-Xms256m -Xmx768m -XX:ActiveProcessorCount=2",
               "JAVA_TOOL_OPTIONS": "-Xmx768m -XX:ActiveProcessorCount=2"}
        envfile = workspace / "backend.env"
        envfile.write_text("\n".join(k + "=" + v for k, v in env.items()) + "\n")
        os.chmod(envfile, 0o600)
        run(["docker", "run", "-d", "--name", backend, "--network", network, "--memory", "2g", "--cpus", "2",
             "--env-file", str(envfile), "-v", str(assets) + ":/opt/data/assets", backend_image])
        address = json.loads(run(["docker", "inspect", backend]))[0]["NetworkSettings"]["Networks"][network]["IPAddress"]
        endpoint = "http://" + address + ":6060"
        jar = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

        def rpc(name, payload):
            request = urllib.request.Request(endpoint + "/api/rpc/command/" + name,
                                             data=json.dumps(payload).encode(),
                                             headers={"Content-Type": "application/json", "Accept": "application/json"})
            try:
                with client.open(request, timeout=30) as response:
                    value = json.load(response)
                    def normalize(item):
                        if isinstance(item, dict):
                            return {re.sub(r"(?<!^)(?=[A-Z])", "-", k).lower().replace("_", "-"): normalize(v) for k, v in item.items()}
                        if isinstance(item, list):
                            return [normalize(v) for v in item]
                        return item
                    return normalize(value)
            except urllib.error.HTTPError as error:
                body = error.read()
                (workspace / "rpc-error.json").write_bytes(body)
                raise RuntimeError("Penpot RPC " + name + " failed with HTTP " + str(error.code))

        for _ in range(120):
            try:
                with socket.create_connection((address, 6060), timeout=2):
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            with (workspace / "backend.log").open("wb") as log:
                run(["docker", "logs", backend], output=log)
            raise RuntimeError("Penpot backend did not become ready")
        email = "pgops-" + nonce + "@example.invalid"
        password = "Aa9!" + secrets.token_urlsafe(24)
        prepared = rpc("prepare-register-profile", {"fullname": "PG18 compatibility", "email": email, "password": password})
        rpc("register-profile", {"token": prepared["token"]})
        rpc("login-with-password", {"email": email, "password": password})
        projects = rpc("get-all-projects", {})
        project = projects[0]
        teams = rpc("get-teams", {})
        team = next(t for t in teams if t["id"] == project["team-id"])
        file = rpc("create-file", {"project-id": project["id"], "name": "PG18 before restart", "features": team.get("features", [])})
        rpc("rename-file", {"id": file["id"], "name": "PG18 persistent record"})
        read = rpc("get-file", {"id": file["id"], "features": team.get("features", [])})
        if read["name"] != "PG18 persistent record":
            raise RuntimeError("Penpot save/read mismatch")
        run(["docker", "restart", db])
        for _ in range(60):
            try:
                sql(source, "SELECT 1;")
                break
            except RuntimeError:
                time.sleep(1)
        run(["docker", "restart", backend])
        for _ in range(100):
            try:
                read = rpc("get-file", {"id": file["id"], "features": team.get("features", [])})
                if read["name"] == "PG18 persistent record":
                    break
            except Exception:
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Penpot restart persistence failed")
        report = {"schema": 1, "ok": True, "backend": backend_image, "postgres": "18.6", "runtime_user": role["user"],
                  "superuser": False, "pool_min": 2, "pool_max": 10, "seconds": round(time.time() - started, 2),
                  "scenarios": ["schema-migration", "registration-login", "create-file", "save-read", "restart-persistence"]}
        atomic_json(STATE / "penpot-drill-report.json", report)
        print(json.dumps(report))
    finally:
        with (workspace / "backend.log").open("wb") as log:
            subprocess.run(["docker", "logs", backend], stdout=log, stderr=subprocess.STDOUT)
        os.chmod(workspace / "backend.log", 0o600)
        for name in [backend, redis, db]:
            try:
                run(["docker", "rm", "-f", name])
            except RuntimeError:
                pass
        run(["docker", "network", "rm", network])


if __name__ == "__main__":
    main()
