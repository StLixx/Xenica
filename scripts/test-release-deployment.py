import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'deploy/deployer'))
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'deploy/deployer'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
receipt=load('receipt','deployment-receipt.py');request=load('request','check-release-request.py')

class ReleaseDeploymentTests(unittest.TestCase):
    def test_two_real_backups_and_matching_deployments_required(self):
        with tempfile.TemporaryDirectory() as directory:
            files={project:Path(directory)/project for project,_ in receipt.TARGETS}
            for file in files.values():file.write_text('real snapshot')
            health={'commit':'a'*40,'artifact':'sha256:'+'b'*64,'version':'0.2.5'}
            result=receipt.build_receipt('test',[health,health],files,'sha256:'+'c'*64)
            self.assertEqual(len(result['backups']),2)
            with self.assertRaises(RuntimeError):receipt.build_receipt('test',[health,{**health,'artifact':'sha256:'+'d'*64}],files,'sha256:'+'c'*64)
            files['xenica-sketch'].write_text('')
            with self.assertRaises(RuntimeError):receipt.build_receipt('test',[health,health],files,'sha256:'+'c'*64)

    def test_only_explicit_exact_release_request_allows_deployment(self):
        record={'schema':1,'type':'release','stage':'prepared','source':'a'*40,'artifact':'sha256:'+'b'*64,'merged':'c'*40}
        item={'type':'release','source':record['source'],'path':'proof','sha256':hashlib.sha256(json.dumps(record,separators=(',',':')).encode()).hexdigest()}
        index={'records':[item]};read=lambda _:record
        self.assertTrue(request.approved(index,read,record['source'],record['artifact'],record['merged']))
        self.assertFalse(request.approved(index,read,record['source'],'sha256:'+'d'*64,record['merged']))
        self.assertFalse(request.approved(index,read,record['source'],record['artifact'],'e'*40))
        self.assertFalse(request.approved({'records':[]},read,record['source'],record['artifact'],record['merged']))
        item['sha256']='f'*64
        with self.assertRaises(RuntimeError):request.approved(index,read,record['source'],record['artifact'],record['merged'])

if __name__=='__main__':unittest.main()
