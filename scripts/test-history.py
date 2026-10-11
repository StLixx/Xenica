import importlib.util
from pathlib import Path
import tempfile
import hashlib
import unittest

spec=importlib.util.spec_from_file_location('history',Path(__file__).resolve().parents[1]/'deploy/deployer/history.py')
history=importlib.util.module_from_spec(spec);spec.loader.exec_module(history)

class HistoryTests(unittest.TestCase):
    def test_snapshot_identity_and_path_are_strict(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);(root/'snapshots').mkdir();(root/'snapshots/v1.sql').write_bytes(b'private archive')
            version={'id':'v1','source':'a'*40,'image':'ghcr.io/stlixx/xenica@sha256:'+'b'*64,'snapshot':'v1.sql','snapshot_sha256':hashlib.sha256(b'private archive').hexdigest()}
            self.assertTrue(history.validate(version,root).is_file())
            for patch in [{'snapshot':'../v1.sql'},{'image':'ghcr.io/stlixx/xenica:latest'},{'snapshot_sha256':'0'*64},{'source':'a'*7}]:
                with self.assertRaises(AssertionError):history.validate({**version,**patch},root)

if __name__=='__main__':unittest.main()
