import importlib.util
from pathlib import Path
import tempfile
import hashlib
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('history',Path(__file__).resolve().parents[1]/'deploy/deployer/history.py')
history=importlib.util.module_from_spec(spec);spec.loader.exec_module(history)

class HistoryTests(unittest.TestCase):
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

    def test_snapshot_identity_and_path_are_strict(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'snapshots').mkdir();(root/'snapshots/v1.sql').write_bytes(b'private archive')
            version={'id':'v1','source':'a'*40,'image':'ghcr.io/stlixx/xenica@sha256:'+'b'*64,'snapshot':'v1.sql','snapshot_sha256':hashlib.sha256(b'private archive').hexdigest()}
            self.assertTrue(history.validate(version,root).is_file())
            for patch in [{'snapshot':'../v1.sql'},{'image':'ghcr.io/stlixx/xenica:latest'},{'snapshot_sha256':'0'*64},{'source':'a'*7}]:
                with self.assertRaises(AssertionError):history.validate({**version,**patch},root)

if __name__=='__main__':unittest.main()
