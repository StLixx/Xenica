#!/usr/bin/env python3
"""首次建立固定画板；私有原件、密码和会话不进入仓库或日志。"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

HOST = 'excalidraw.xenica.truebigsand.top'
ROOT = Path(__file__).resolve().parents[2]
PRIVATE = Path('/var/lib/xenica-workspace')


def run(*args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        # Docker 的异常文本可能包含数据库凭据。
        raise RuntimeError('固定画板初始化失败：' + args[0])
    return result.stdout


def relocate(archive, previous):
    """只修改当前场景的派生嵌入地址；原文、文件及历史快照不可改写。"""
    for element in archive['node']['body']['scene']['elements']:
        embed = element.get('customData', {}).get('xenicaEmbed', {})
        if embed.get('kind') != 'page':
            continue
        value = embed.get('url', '')
        parsed = urlsplit(value)
        if parsed.scheme != 'https' or parsed.netloc != previous:
            continue
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        if parsed.path in ('', '/'):
            query['experience'] = '1'
        destination = urlunsplit(('https', HOST, parsed.path, urlencode(query), parsed.fragment))
        embed['url'] = destination
        if element.get('link') == value:
            element['link'] = destination
    return archive


def main():
    if len(sys.argv) != 3:
        raise RuntimeError('需要不可变镜像与原件画板 ID')
    image, board = sys.argv[1:]
    if not re.fullmatch(r'ghcr.io/stlixx/xenica@sha256:[a-f0-9]{64}', image):
        raise RuntimeError('镜像必须是不可变摘要')
    if not re.fullmatch(r'[a-f0-9-]{36}', board):
        raise RuntimeError('画板 ID 无效')
    PRIVATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    config = PRIVATE / 'workspace.env'
    marker = PRIVATE / 'initialized.json'
    if marker.exists():
        raise RuntimeError('已有持久画板，必须使用更新流程，不能重新初始化')
    # 不完整初始化也不自动覆盖：先恢复保存的原件与数据库，避免重试重复导入。
    if config.exists():
        raise RuntimeError('存在未完成初始化，需先核对恢复记录')
    credential = secrets.token_hex(24)
    config.write_text(f'POSTGRES_PASSWORD={credential}\nXENICA_IMAGE={image}\nXENICA_HOST={HOST}\nXENICA_NAME=sketch\nXENICA_PRIORITY=1000\nXENICA_ALLOWED_ACCOUNT=test\nXENICA_SEED=\n')
    config.chmod(0o600)
    formal = run('docker', 'exec', 'xenica-db-1', 'pg_dump', '--no-owner', '--no-acl', '-U', 'xenica', 'xenica')
    backup = PRIVATE / 'initial-formal.sql'
    backup.write_bytes(formal)
    backup.chmod(0o600)
    raw = run('docker', 'exec', 'xenica-pr-55-app-1', '/app/xenica', 'archive-export', board)
    original = PRIVATE / 'initial-board.json'
    original.write_bytes(raw)
    original.chmod(0o600)
    archive = relocate(json.loads(raw), 'pr-55.xenica.truebigsand.top')
    assert archive['node']['body'].get('purpose') == 'development'
    transformed = json.dumps(archive, ensure_ascii=False).encode()
    prepared = PRIVATE / 'prepared-board.json'
    prepared.write_bytes(transformed)
    prepared.chmod(0o600)
    compose = ('docker', 'compose', '-f', str(ROOT / 'deploy/compose.yaml'), '-p', 'xenica-sketch', '--env-file', str(config))
    run('docker', 'pull', '-q', image)
    run(*compose, 'up', '-d', '--wait', '--wait-timeout', '120', 'db')
    count = run('docker', 'exec', 'xenica-sketch-db-1', 'psql', '-U', 'xenica', '-d', 'xenica', '-tAc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'").strip()
    if count != b'0':
        raise RuntimeError('目标数据库并非空库，停止初始化')
    run('docker', 'exec', '-i', 'xenica-sketch-db-1', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'xenica', '-d', 'xenica', data=formal)
    database = f'postgres://xenica:{credential}@db:5432/xenica'
    cli = ('docker', 'run', '--rm', '-i', '--network', 'xenica-sketch_default', '-e', 'DATABASE_URL=' + database, image)
    run(*cli, 'migrate')
    created = run(*cli, 'archive-import', data=transformed).decode().strip()
    marker.write_text(json.dumps({'board': created, 'image': image, 'original_sha256': hashlib.sha256(raw).hexdigest(), 'prepared_sha256': hashlib.sha256(transformed).hexdigest(), 'database_sha256': hashlib.sha256(formal).hexdigest()}))
    marker.chmod(0o600)
    run('bash', str(ROOT / 'deploy/deployer/workspace.sh'))
    print('固定画板初始化完成，原件和恢复记录保存在私有持久目录')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else '初始化失败，保留私有恢复材料', file=sys.stderr)
        sys.exit(1)
