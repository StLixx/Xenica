import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import backup
import health
import archive_image
import tarfile
import io
import hashlib
from restore import restore_toc

class ProtectionTests(unittest.TestCase):
    def test_runtime_archive_rejects_a_different_or_corrupt_image(self):
        payload=b'fixed OCI index';image='sha256:'+hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'runtime.tar.gz'
            with tarfile.open(path,'w:gz') as archive:
                for name,data in [('index.json',json.dumps({'manifests':[{'digest':image}]}).encode()),('blobs/sha256/'+image[7:],payload)]:
                    info=tarfile.TarInfo(name);info.size=len(data);archive.addfile(info,io.BytesIO(data))
            archive_image.verify_image_identity(path,image)
            with self.assertRaisesRegex(RuntimeError,'another image'):archive_image.verify_image_identity(path,'sha256:'+'0'*64)

    def test_dump_failure_always_unpauses_application(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);calls=[]
            def run(args,**kwargs):
                calls.append(args)
                if 'pg_dump' in args:raise RuntimeError('injected dump failure')
                return b''
            with patch.object(backup,'ROOT',root/'plain'),patch.object(backup,'ENCRYPTED',root/'encrypted'),patch.object(backup,'source',return_value={'container':'test-db','admin':'test-admin'}),patch.object(backup,'run',side_effect=run):
                with self.assertRaisesRegex(RuntimeError,'injected'):backup.backup()
            self.assertIn(['docker','unpause','affine-server'],calls)
            self.assertEqual(list(root.rglob('complete.json')),[])

    def test_cloud_failure_preserves_prior_complete_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);plain=root/'plain';plain.mkdir();old=plain/'20000101T000000Z';old.mkdir();(old/'complete.json').write_text('{}')
            data=root/'data';(data/'storage').mkdir(parents=True)
            private=root/'private';private.mkdir();stack=root/'stack';stack.mkdir()
            for n in ['compose.yaml','.env']:(stack/n).write_text('test')
            state=root/'state';state.mkdir();(state/'images.json').write_text('{}')
            def run(args,**kwargs):
                if args[0]=='gpg':Path(args[args.index('--output')+1]).write_bytes(b'encrypted')
                return b'dump'
            with patch.multiple(backup,ROOT=plain,ENCRYPTED=root/'encrypted',DATA=data,PRIVATE=private,STACK=stack,STATE=state),patch.object(backup,'source',return_value={'container':'test','admin':'test'}),patch.object(backup,'inventory',return_value={}),patch.object(backup,'document_fingerprints',return_value={}),patch.object(backup,'run',side_effect=run),patch.object(backup,'synchronize',return_value={'completed':__import__('time').time(),'bases':{}}):
                with self.assertRaisesRegex(RuntimeError,'acknowledgment'):backup.backup()
            self.assertTrue((old/'complete.json').exists())

    def test_restore_preserves_application_objects_and_admin_vector_owner(self):
        listing='1; 0 0 EXTENSION - vector \n2; 0 0 COMMENT - EXTENSION vector \n3; 0 0 TABLE public snapshots affine_app\n4; 0 0 TABLE DATA public snapshots affine_app'
        result=restore_toc(listing)
        self.assertNotIn('EXTENSION',result)
        self.assertIn('TABLE public snapshots',result)
        self.assertIn('TABLE DATA public snapshots',result)

    def test_business_database_failure_is_unhealthy_even_if_containers_run(self):
        def run(args,**kwargs):
            if args[0]=='docker' and args[1]=='inspect':return json.dumps([{'State':{'Status':'running'}}]).encode()
            raise RuntimeError('business connection refused')
        with tempfile.TemporaryDirectory() as tmp,patch.object(health,'STATE',Path(tmp)),patch.object(health,'DATA',Path(tmp)),patch.object(health,'run',side_effect=run),patch.object(health,'sql',side_effect=RuntimeError('DB unavailable')),patch.object(health.urllib.request,'urlopen',side_effect=OSError('unavailable')):
            result=health.check()
        self.assertFalse(result['ok'])
        self.assertIn('business database access',result['alerts'])
        self.assertIn('backup unavailable',result['alerts'])

if __name__=='__main__':unittest.main()
