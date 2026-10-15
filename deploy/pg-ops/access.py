"""按已登记的业务角色限制可连接数据库，不修改其他角色的认证规则。"""
import argparse
import os
from pathlib import Path
import re
import stat
import time
from pg_ops import load_config, sql, verify_identity, STATE


def restricted_hba(original, role, databases):
    if not re.fullmatch(r'[a-z_][a-z0-9_]*', role) or not databases or any(
            not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]*', d) for d in databases):
        raise ValueError('invalid database access policy')
    begin, end = f'# pgops {role} begin', f'# pgops {role} end'
    original = re.sub(re.escape(begin) + r'\n.*?' + re.escape(end) + r'\n?', '', original, flags=re.S)
    allowed = ','.join(databases)
    rules = [begin, f'local {allowed} {role} scram-sha-256', f'local all {role} reject']
    for address in ['0.0.0.0/0', '::/0']:
        rules += [f'host {allowed} {role} {address} scram-sha-256', f'host all {role} {address} reject']
    return '\n'.join([*rules, end, original])


def apply_policy(src):
    verify_identity(src)
    if sql(src, 'SHOW hba_file;') != '/var/lib/postgresql/18/docker/pg_hba.conf':
        raise RuntimeError('unregistered authentication file layout')
    path = Path(src['data_root']) / '18/docker/pg_hba.conf'
    original = path.read_text()
    updated = original
    policies = src.get('database_roles', {})
    if not policies:
        raise RuntimeError('explicit database role policy required')
    for role, databases in policies.items():
        # 校验标识符后才用于 SQL；不允许把管理员纳入业务限制。
        restricted_hba('', role, databases)
        if sql(src, "SELECT rolsuper FROM pg_roles WHERE rolname='" + role + "';") != 'f':
            raise RuntimeError('only existing non-superuser business roles may be restricted')
        updated = restricted_hba(updated, role, databases)
    if updated == original:
        return
    rollback = STATE / 'access-rollback' / (src['name'] + '-' + str(time.time_ns()) + '.conf')
    rollback.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    rollback.write_text(original)
    rollback.chmod(0o600)
    metadata = path.stat()
    def write(text):
        temporary = path.with_suffix('.pgops-partial')
        temporary.write_text(text)
        temporary.chmod(stat.S_IMODE(metadata.st_mode))
        os.chown(temporary, metadata.st_uid, metadata.st_gid)
        temporary.replace(path)
    try:
        write(updated)
        if sql(src, 'SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;') != '0':
            raise RuntimeError('authentication policy parse failed')
        sql(src, 'SELECT pg_reload_conf();')
    except Exception:
        write(original)
        sql(src, 'SELECT pg_reload_conf();')
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    args = parser.parse_args()
    apply_policy(next(s for s in load_config()['sources'] if s['name'] == args.source))
