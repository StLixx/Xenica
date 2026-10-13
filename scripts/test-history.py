import importlib.util
from pathlib import Path
import tempfile
import hashlib
import unittest
import os
import shutil
import subprocess
import json
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('history',Path(__file__).resolve().parents[1]/'deploy/deployer/history.py')
history=importlib.util.module_from_spec(spec);spec.loader.exec_module(history)
identity_spec=importlib.util.spec_from_file_location('archive_identity',Path(__file__).resolve().parents[1]/'deploy/deployer/archive_identity.py')
identity=importlib.util.module_from_spec(identity_spec);identity_spec.loader.exec_module(identity)

class HistoryTests(unittest.TestCase):
    def test_auto_parents_only_discovers_xenica_apps(self):
        with patch.object(history,'run',return_value='xenica-app-1\nxenica-sketch-app-1\nxenica-pr-61-app-1\nxenica-pr-61-db-1\nother-app-1\nxenica-history-id-gateway\n'):
            self.assertEqual(history.parents('auto'),['xenica-app-1','xenica-pr-61-app-1','xenica-sketch-app-1'])
        self.assertEqual(history.parents('xenica-sketch-app-1'),['xenica-sketch-app-1'])
    def test_policy_rotation_uses_valid_store_stop_transition(self):
        runtime={'id':'00000000-0000-4000-8000-000000000001','generation':1,'state':'running'}
        with patch.object(history,'state') as state,patch.object(history.subprocess,'run'):
            history.stop('parent',runtime)
        self.assertEqual([call.args[2] for call in state.call_args_list],['stopping','stopped'])

    def test_shared_capacity_waits_without_evicting_other_workspace(self):
        runtime={'id':'00000000-0000-4000-8000-000000000001','artifact':'old@sha256:fixed','snapshot':'checksum'}
        version={'image':runtime['artifact'],'snapshot_sha256':'checksum'}
        calls=[]
        def run(*args,**kwargs):
            calls.append(args)
            if args[:2]==('docker','inspect'):return '[{"Config":{"Image":"parent@sha256:fixed","Env":[]},"NetworkSettings":{"Networks":{"parent_default":{}}}}]'
            if args[:3]==('docker','ps','-a'):return 'other-a-gateway\nother-b-gateway'
            raise AssertionError('容量忙时不能创建或删除其他工作区实例')
        with patch.object(history,'validate',return_value=Path('/private/snapshot.sql')),patch.object(history,'run',side_effect=run),patch.object(history.subprocess,'run') as mutate:
            history.start('parent',runtime,version)
            mutate.assert_not_called()
        self.assertEqual(len(calls),2)

    def test_parent_policy_update_stops_stale_gateway(self):
        runtime={'id':'00000000-0000-4000-8000-000000000001','generation':1,'state':'running'}
        with tempfile.TemporaryDirectory() as folder:
            catalog=Path(folder)/'catalog.json';catalog.write_text('{"versions":[]}')
            def run(*args,**kwargs):
                if args[-1]=='runtime-queue':return json.dumps([runtime])
                if args==('docker','inspect','parent'):return '[{"Config":{"Image":"new@sha256:fixed"}}]'
                if args[:2]==('docker','inspect'):return '[{"Config":{"Image":"old@sha256:fixed"}}]'
                raise AssertionError('旧策略网关不能进入健康放行')
            with patch.object(history,'CATALOG',catalog),patch.object(history,'run',side_effect=run),patch.object(history,'stop') as stop:
                history.reconcile('parent')
                stop.assert_called_once_with('parent',runtime)

    def test_archiver_retains_same_source_different_builds(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);bin_dir=root/'bin';bin_dir.mkdir();deployer=root/'deployer';deployer.mkdir()
            source=Path(__file__).resolve().parents[1]/'deploy/deployer'
            for name in ('archive-version.py','archive_identity.py'):shutil.copyfile(source/name,deployer/name)
            (deployer/'journal.py').write_text('def publish_archive(*args): pass\n')
            docker=bin_dir/'docker'
            docker.write_text('''#!/usr/bin/env python3
import json,os,sys
a=sys.argv[1:];digest=os.environ['TEST_DIGEST']
if a[0]=='inspect':print(json.dumps([{'Config':{'Image':'image@'+digest,'Env':['XENICA_ARTIFACT='+digest]}}]))
elif a[:2]==['image','inspect']:print(json.dumps([{'Config':{'Labels':{'org.opencontainers.image.revision':'a'*40}}}]))
elif a[0]=='run':print(json.dumps({'commit':'a'*40,'version':'0.2.5'}))
elif a[0]=='exec':print('compatible snapshot')
else:raise SystemExit(1)
''');docker.chmod(0o755)
            env={**os.environ,'PATH':str(bin_dir)+':'+os.environ['PATH'],'XENICA_HISTORY_ROOT':str(root/'archive')}
            for digest in ('b'*64,'c'*64,'c'*64):
                result=subprocess.run(['python3',str(deployer/'archive-version.py'),'xenica-pr-55'],env={**env,'TEST_DIGEST':'sha256:'+digest},capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
            catalog=json.loads((root/'archive/catalog/catalog.json').read_text())['versions']
            self.assertEqual(len(catalog),2)
            self.assertEqual(len({v['snapshot'] for v in catalog}),2)
            for version in catalog:self.assertTrue((root/'archive/snapshots'/version['snapshot']).is_file())

    def test_rebuilt_preview_has_separate_immutable_archive(self):
        source='a'*40
        first=identity.archive_id('v0.2.5','xenica-pr-55',source,'sha256:'+'b'*64)
        again=identity.archive_id('v0.2.5','xenica-pr-55',source,'sha256:'+'b'*64)
        rebuilt=identity.archive_id('v0.2.5','xenica-pr-55',source,'sha256:'+'c'*64)
        self.assertEqual(first,again)
        self.assertNotEqual(first,rebuilt)
        self.assertEqual(identity.archive_id('v0.2.5','xenica',source,'sha256:'+'b'*64),'v0.2.5')

    def test_gateway_starts_only_after_parent_and_edge_networks(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);snapshot=root/'snapshot.sql';snapshot.write_bytes(b'archive')
            runtime={'id':'00000000-0000-4000-8000-000000000001','generation':1,'artifact':'historical@sha256:fixed','snapshot':'checksum'}
            version={'image':runtime['artifact'],'source':'a'*40,'snapshot_sha256':'checksum'}
            calls=[]
            def run(*args,**kwargs):
                calls.append(args)
                if args[:2]==('docker','inspect'):return '[{"Config":{"Image":"parent@sha256:fixed","Env":["DATABASE_URL=private"]},"NetworkSettings":{"Networks":{"parent_default":{}}}}]'
                if args[:3]==('docker','image','inspect'):return 'a'*40
                return ''
            with patch.object(history,'ROOT',root),patch.object(history,'validate',return_value=snapshot),patch.object(history,'run',side_effect=run),patch.object(history.subprocess,'run') as command:
                command.return_value.returncode=0
                history.start('parent',runtime,version)
            gateway=history.names(runtime)+'-gateway'
            start=calls.index(('docker','start',gateway))
            for network in ('parent_default','xenica-edge'):
                self.assertLess(calls.index(('docker','network','connect',network,gateway)),start)
            self.assertFalse(any(c[:3]==('docker','run','-d') and gateway in c for c in calls))
            self.assertTrue(any(c.args[0][0]=='curl' and c.args[0][-1].endswith('/__health') for c in command.call_args_list))

    def test_snapshot_identity_and_path_are_strict(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'snapshots').mkdir();(root/'snapshots/v1.sql').write_bytes(b'private archive')
            version={'id':'v1','source':'a'*40,'image':'ghcr.io/stlixx/xenica@sha256:'+'b'*64,'snapshot':'v1.sql','snapshot_sha256':hashlib.sha256(b'private archive').hexdigest()}
            self.assertTrue(history.validate(version,root).is_file())
            for patch in [{'snapshot':'../v1.sql'},{'image':'ghcr.io/stlixx/xenica:latest'},{'snapshot_sha256':'0'*64},{'source':'a'*7}]:
                with self.assertRaises(AssertionError):history.validate({**version,**patch},root)

if __name__=='__main__':unittest.main()
