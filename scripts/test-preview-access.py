import base64
import ctypes
import ctypes.util
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'deploy/deployer'))
from sealed_secret import seal
spec=importlib.util.spec_from_file_location('access',ROOT/'deploy/deployer/test-access.py')
access=importlib.util.module_from_spec(spec);spec.loader.exec_module(access)

class PreviewAccessTests(unittest.TestCase):
    def test_only_private_preview_and_canonical_can_receive_test_authorization(self):
        self.assertEqual(access.preview_number('xenica-pr-60-app-1'),60)
        self.assertIsNone(access.preview_number('xenica-sketch-app-1'))
        for parent in ['xenica-app-1','other-app-1','xenica-pr-0-app-1','../xenica-pr-60-app-1']:
            with self.assertRaises(RuntimeError):access.preview_number(parent)

    def test_fork_changed_source_and_public_demo_deployment_are_rejected_before_account_import(self):
        import json
        pr={'head':{'sha':'a'*40,'repo':{'full_name':'StLixx/Xenica'}}}
        def run(*args,**kwargs):
            if args[1]=='inspect':return json.dumps([{'Image':'immutable','Config':{'Env':['XENICA_ALLOWED_ACCOUNT=test']}}]).encode()
            return json.dumps([{'Config':{'Labels':{'org.opencontainers.image.revision':'a'*40}}}]).encode()
        with patch.object(access,'run',side_effect=run):
            self.assertEqual(access.preview_source('xenica-pr-60-app-1',pr),'a'*40)
            with self.assertRaises(RuntimeError):access.preview_source('xenica-pr-60-app-1',{'head':{**pr['head'],'sha':'b'*40}})
            with self.assertRaises(RuntimeError):access.preview_source('xenica-pr-60-app-1',{'head':{**pr['head'],'repo':{'full_name':'attacker/Xenica'}}})
        with patch.object(access,'run',return_value=b'[{"Image":"immutable","Config":{"Env":[]}}]'):
            with self.assertRaises(RuntimeError):access.preview_source('xenica-pr-60-app-1',pr)

    def test_encrypted_authorization_can_only_be_opened_with_matching_secret_key(self):
        library=ctypes.util.find_library('sodium')
        if not library:raise RuntimeError('libsodium missing on verified test host')
        sodium=ctypes.CDLL(library);sodium.sodium_init()
        sodium.crypto_box_seal_open.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ulonglong,ctypes.c_void_p,ctypes.c_void_p]
        public=ctypes.create_string_buffer(32);private=ctypes.create_string_buffer(32)
        self.assertEqual(sodium.crypto_box_keypair(public,private),0)
        value=b'test-only-short-lived-session'
        ciphertext=base64.b64decode(seal(value,base64.b64encode(public.raw)))
        self.assertNotIn(value,ciphertext)
        output=ctypes.create_string_buffer(len(value))
        self.assertEqual(sodium.crypto_box_seal_open(output,ciphertext,len(ciphertext),public,private),0)
        self.assertEqual(output.raw,value)
        other_public=ctypes.create_string_buffer(32);other_private=ctypes.create_string_buffer(32)
        sodium.crypto_box_keypair(other_public,other_private)
        self.assertNotEqual(sodium.crypto_box_seal_open(output,ciphertext,len(ciphertext),other_public,other_private),0)
        with self.assertRaises(RuntimeError):seal(value,base64.b64encode(b'invalid'))

if __name__=='__main__':unittest.main()
