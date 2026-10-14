#!/usr/bin/env python3
"""为单个应用建立独立拥有者与运行账号。凭据只写私有目录。"""
import argparse
import json
import os
from pathlib import Path
import secrets
from pg_ops import atomic_json, load_config, run, sql, STATE


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def isolate(src, database, app, limit):
    owner = app + "_owner"
    secret_file = Path("/etc/pg-ops/roles.json")
    stored = json.loads(secret_file.read_text()) if secret_file.exists() else {}
    key = src["name"] + "/" + database
    password = stored.get(key, {}).get("password", secrets.token_hex(24))
    stored[key] = {"user": app, "owner": owner, "password": password, "database": database, "limit": limit}
    atomic_json(secret_file, stored)
    statements = f"""
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname={literal(owner)}) THEN CREATE ROLE {ident(owner)} NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname={literal(app)}) THEN CREATE ROLE {ident(app)} LOGIN PASSWORD {literal(password)}; END IF;
END $roles$;
ALTER ROLE {ident(app)} LOGIN PASSWORD {literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT {int(limit)};
GRANT {ident(owner)} TO {ident(app)};
ALTER DATABASE {ident(database)} OWNER TO {ident(owner)};
REVOKE CONNECT ON DATABASE {ident(database)} FROM PUBLIC;
GRANT CONNECT,TEMPORARY ON DATABASE {ident(database)} TO {ident(app)};
"""
    sql(src, statements)
    # 扩展对象保持由管理员管理，避免破坏扩展升级。
    sql(src, f"""
ALTER SCHEMA public OWNER TO {ident(owner)};
GRANT USAGE,CREATE ON SCHEMA public TO {ident(owner)};
DO $objects$ DECLARE item record; BEGIN
 FOR item IN SELECT c.oid,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f')
 AND NOT EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 AND NOT (c.relkind='S' AND EXISTS(SELECT FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i')))
 LOOP EXECUTE format('ALTER %s public.%I OWNER TO %I',
 CASE item.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,item.relname,{literal(owner)}); END LOOP;
END $objects$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO {ident(owner)};
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO {ident(owner)};
""", database)
    passwd = Path(src["data_root"]) / "pgops/runtime.pgpass"
    lines = passwd.read_text().splitlines() if passwd.exists() else []
    entry = "127.0.0.1:5432:" + database + ":" + app + ":" + password
    lines = [line for line in lines if not line.startswith("127.0.0.1:5432:" + database + ":")]
    lines.append(entry)
    passwd.write_text("\n".join(lines) + "\n")
    uid = int(run(["docker", "exec", src["container"], "id", "-u", "postgres"]))
    os.chown(passwd, uid, uid)
    os.chmod(passwd, 0o600)
    probe = "SELECT current_user; BEGIN; CREATE TABLE public.pgops_permission_probe(id integer); ALTER TABLE public.pgops_permission_probe ADD COLUMN value text; DROP TABLE public.pgops_permission_probe; ROLLBACK;"
    output = run(["docker", "exec", "--user", "postgres", "-i", "-e", "PGPASSFILE=/var/lib/postgresql/pgops/runtime.pgpass",
                  src["container"], "psql", "-X", "-A", "-t", "-h", "127.0.0.1", "-U", app,
                  "-d", database, "-v", "ON_ERROR_STOP=1"], input=probe.encode())
    if app not in output:
        raise RuntimeError("runtime authentication probe failed")
    source = {"source": src["name"], "database": database, "runtime_user": app, "owner": owner,
              "connection_limit": limit, "authentication_and_ddl": "passed"}
    atomic_json(STATE / "permissions" / (src["name"] + "-" + app + ".json"), source)
    print(json.dumps(source))
    return stored[key]


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--database", required=True)
    p.add_argument("--app", required=True)
    p.add_argument("--limit", type=int, default=20)
    a = p.parse_args()
    src = next(s for s in load_config()["sources"] if s["name"] == a.source)
    isolate(src, a.database, a.app, a.limit)
