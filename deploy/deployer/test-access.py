#!/usr/bin/env python3
"""为私有部署签发短期测试会话；不接收、打印或重设账户密码。"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def run(*args, data=None):
    result = subprocess.run(args, input=data, capture_output=True)
    if result.returncode:
        raise RuntimeError('测试授权准备失败：' + args[0])
    return result.stdout


def main():
    parent = sys.argv[1]
    if parent not in ('xenica-pr-55-app-1', 'xenica-sketch-app-1'):
        raise RuntimeError('不能向正式应用写入测试会话')
    root = Path(__file__).resolve().parents[2]
    titles = []
    for file in sorted((root / 'web/e2e').glob('*.spec.ts')):
        titles += re.findall(r"test\('([^']+)'", file.read_text())
    if not titles or len(titles) != len(set(titles)):
        raise RuntimeError('测试场景身份不唯一')
    # 借助 Store 在临时测试库新增同一 test 身份，不改变正式库或已有密码。
    if parent == 'xenica-pr-55-app-1':
        record = run('docker', 'exec', 'xenica-db-1', 'psql', '-U', 'xenica', '-d', 'xenica', '-tAc', "SELECT json_build_object('name',name,'hash',password_hash) FROM users WHERE name='test'").strip()
        if not record:
            raise RuntimeError('正式站没有原有 test 身份')
        run('docker', 'exec', '-i', parent, '/app/xenica', 'account-import', data=record)
    tokens = run('docker', 'exec', '-i', parent, '/app/xenica', 'test-sessions', data=json.dumps(titles).encode())
    json.loads(tokens)
    folder = Path('/var/lib/xenica-workspace/test-access')
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination = folder / (parent + '.json')
    destination.write_bytes(tokens)
    destination.chmod(0o600)
    print('短期测试授权已保存至私有目录；未读取账户密码')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('测试授权准备失败，未输出私密身份', file=sys.stderr)
        sys.exit(1)
