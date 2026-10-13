import copy
import importlib.util
from pathlib import Path
import unittest
import json
import os
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('workspace', Path(__file__).resolve().parents[1] / 'deploy/deployer/bootstrap-workspace.py')
workspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)


class WorkspaceTests(unittest.TestCase):
    def test_failed_upgrade_keeps_previous_configuration_and_runtime(self):
        old='ghcr.io/stlixx/xenica@sha256:'+'a'*64
        new='ghcr.io/stlixx/xenica@sha256:'+'b'*64
        # 没有当前容器时避免测试脚本访问真实持久备份目录。
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);config=root/'workspace.env';config.write_text('XENICA_IMAGE='+old+'\n')
            docker=root/'docker';docker.write_text('''#!/usr/bin/env python3
import os,sys,json
args=sys.argv[1:]
with open(os.environ['CALLS'],'a') as f:f.write(json.dumps({'args':args,'image':os.getenv('XENICA_IMAGE')})+'\\n')
if args[0]=='inspect':sys.exit(1)
if args[0]=='compose' and 'up' in args:sys.exit(1)
''');docker.chmod(0o755)
            env={**os.environ,'PATH':str(root)+':'+os.environ['PATH'],'XENICA_WORKSPACE_CONFIG':str(config),'XENICA_WORKSPACE_TARGET':new,'CALLS':str(root/'calls')}
            result=subprocess.run(['bash',str(Path(__file__).resolve().parents[1]/'deploy/deployer/workspace.sh')],env=env,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(config.read_text(),'XENICA_IMAGE='+old+'\n')
            calls=[json.loads(line) for line in (root/'calls').read_text().splitlines()]
            self.assertTrue(any('up' in c['args'] and c['image']==new for c in calls))
            self.assertTrue(any('stop' in c['args'] for c in calls))

    def test_migration_only_relocates_derived_current_page(self):
        address = 'https://pr-55.xenica.truebigsand.top/?view=graph'
        page = {'customData': {'xenicaEmbed': {'kind': 'page', 'url': address}}, 'link': address}
        original = {'node': {'body': {'scene': {'elements': [page, {'text': address}, {'customData': {'xenicaEmbed': {'kind': 'web', 'url': address}}}]}}}, 'history': [{'scene': {'elements': [copy.deepcopy(page)]}}], 'files': [{'bytes': [1, 2, 3]}]}
        retained = copy.deepcopy(original)
        migrated = workspace.relocate(original, 'pr-55.xenica.truebigsand.top')
        changed = migrated['node']['body']['scene']['elements'][0]
        self.assertEqual(changed['link'], 'https://excalidraw.xenica.truebigsand.top/?view=graph&experience=1')
        self.assertEqual(changed['customData']['xenicaEmbed']['url'], changed['link'])
        self.assertEqual(migrated['history'], retained['history'])
        self.assertEqual(migrated['files'], retained['files'])
        self.assertEqual(migrated['node']['body']['scene']['elements'][1:], retained['node']['body']['scene']['elements'][1:])
        self.assertEqual(workspace.relocate(copy.deepcopy(migrated), 'pr-55.xenica.truebigsand.top'), migrated)


if __name__ == '__main__':
    unittest.main()
