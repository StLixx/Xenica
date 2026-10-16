"""Runs inside the pinned gateway image: SDK OAuth and security regressions."""
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

ROOT=tempfile.TemporaryDirectory()
p=Path(ROOT.name)
(p/'config.json').write_text(json.dumps({'public_url':'https://affine.test','upstream_url':'http://affine:3010','workspace_id':'workspace','owner_id':'owner','bridge_url':'http://bridge:8892','bridge_secret':'never-return-bridge-secret'}))
os.environ['AFFINE_MCP_CONFIG']=str(p/'config.json')
os.environ['AFFINE_MCP_STORE']=str(p/'state.sqlite3')
import gateway as g
from starlette.testclient import TestClient
from store import Store


class OAuthTests(unittest.TestCase):
    def setUp(self):
        g.STORE=Store(p/(os.urandom(8).hex()+'.sqlite3'))
        self.client=TestClient(g.app,base_url=g.BASE)
        self.redirect='https://chatgpt.com/connector/oauth/test-callback'
        self.registration={'redirect_uris':[self.redirect],'client_name':'ChatGPT','grant_types':['authorization_code','refresh_token'],'response_types':['code'],'token_endpoint_auth_method':'none','scope':' '.join(g.SCOPES)}
        self.info=self.client.post('/rw-oauth/register',json=self.registration).json()
        self.verifier='test-verifier-abcdefghijklmnopqrstuvwxyz1234567890'
        self.challenge=base64.urlsafe_b64encode(hashlib.sha256(self.verifier.encode()).digest()).decode().rstrip('=')

    def flow(self):
        r=self.client.get('/rw-oauth/authorize',params={'client_id':self.info['client_id'],'redirect_uri':self.redirect,'response_type':'code','code_challenge':self.challenge,'code_challenge_method':'S256','scope':' '.join(g.SCOPES),'resource':g.RESOURCE,'state':'original-state'},follow_redirects=False)
        self.assertEqual(r.status_code,302,r.text)
        location=r.headers['location'];tx=parse_qs(urlparse(location).query)['tx'][0]
        with patch.object(g,'owner_session',AsyncMock(return_value=True)):
            self.assertEqual(self.client.get(location).status_code,200)
            nonce=self.client.cookies.get(g.COOKIE)
            r=self.client.post('/rw-oauth/consent',data={'tx':tx,'csrf':nonce,'decision':'allow'},headers={'origin':g.BASE},follow_redirects=False)
        self.assertEqual(r.status_code,302,r.text)
        qs=parse_qs(urlparse(r.headers['location']).query)
        self.assertEqual(qs['state'],['original-state'])
        return {'grant_type':'authorization_code','code':qs['code'][0],'redirect_uri':self.redirect,'client_id':self.info['client_id'],'code_verifier':self.verifier,'resource':g.RESOURCE}

    def test_pkce_replay_rotation_revocation_audience(self):
        form=self.flow()
        self.assertEqual(self.client.post('/rw-oauth/token',data={**form,'code_verifier':'wrong'}).status_code,400)
        self.assertEqual(self.client.post('/rw-oauth/token',data={**form,'resource':'https://evil.test/mcp'}).status_code,400)
        r=self.client.post('/rw-oauth/token',data=form)
        self.assertEqual(r.status_code,200,r.text)
        tokens=r.json()
        self.assertEqual(self.client.post('/rw-oauth/token',data=form).status_code,400)
        refresh={'grant_type':'refresh_token','refresh_token':tokens['refresh_token'],'client_id':self.info['client_id'],'resource':g.RESOURCE}
        r=self.client.post('/rw-oauth/token',data=refresh)
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(self.client.post('/rw-oauth/token',data=refresh).status_code,400)
        new=r.json()
        self.client.post('/rw-oauth/revoke',data={'token':new['refresh_token'],'client_id':self.info['client_id']})
        self.assertIsNone(asyncio.run(g.PROVIDER.load_access_token(new['access_token'])))
        self.assertIsNone(asyncio.run(g.PROVIDER.load_access_token(tokens['access_token'])))
        raw=Path(g.STORE.path).read_bytes()
        self.assertNotIn(new['access_token'].encode(),raw)
        self.assertNotIn(new['refresh_token'].encode(),raw)

    def test_registration_redirect_and_anonymous_access(self):
        for uri in ['https://evil.test/connector/oauth/a','https://chatgpt.com.evil.test/connector/oauth/a','https://chatgpt.com/connector/oauth/a#token','http://chatgpt.com/connector/oauth/a','https://chatgpt.com/connector/oauth/a?next=evil']:
            self.assertEqual(self.client.post('/rw-oauth/register',json={**self.registration,'redirect_uris':[uri]}).status_code,400)
        r=self.client.post('/rw-mcp',json={'jsonrpc':'2.0','id':1,'method':'tools/list'})
        self.assertEqual(r.status_code,401)
        self.assertIn('resource_metadata=',r.headers['www-authenticate'])
        self.assertEqual(self.client.get('/.well-known/oauth-protected-resource/rw-mcp').json()['resource'],g.RESOURCE)
        metadata=self.client.get('/.well-known/oauth-authorization-server/rw-oauth').json()
        self.assertEqual(metadata['code_challenge_methods_supported'],['S256'])

    def test_consent_requires_owner_origin_and_csrf(self):
        tx='pendingtx'
        g.STORE.put('pending',tx,{'valid':True},__import__('time').time()+100)
        with patch.object(g,'owner_session',AsyncMock(return_value=False)):
            self.assertEqual(self.client.get('/rw-oauth/consent?tx='+tx).status_code,401)
        with patch.object(g,'owner_session',AsyncMock(return_value=True)):
            self.client.get('/rw-oauth/consent?tx='+tx)
            nonce=self.client.cookies.get(g.COOKIE)
            self.assertEqual(self.client.post('/rw-oauth/consent',data={'tx':tx,'csrf':nonce,'decision':'allow'}).status_code,403)
            self.assertEqual(self.client.post('/rw-oauth/consent',data={'tx':tx,'csrf':'wrong','decision':'allow'},headers={'origin':g.BASE}).status_code,403)
        self.assertIsNotNone(g.STORE.get('pending',tx))


    def test_readonly_scope_filters_tools_and_blocks_writes(self):
        grant='g'
        g.STORE.put('grant',grant,{'client_id':self.info['client_id']},__import__('time').time()+100)
        tokens=g.PROVIDER.issue(self.info['client_id'],grant,['affine:read'])
        headers={'authorization':'Bearer '+tokens.access_token}
        r=self.client.post('/rw-mcp',headers=headers,json={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'create_document'}})
        self.assertIn('WRITE_SCOPE_REQUIRED',r.text)
        mocked=AsyncMock(return_value=httpx_response({'tools':[{'name':'read_document'},{'name':'create_document'}]}))
        with patch('httpx.AsyncClient.post',mocked):
            r=self.client.post('/rw-mcp',headers=headers,json={'jsonrpc':'2.0','id':2,'method':'tools/list'})
        self.assertEqual([t['name'] for t in r.json()['result']['tools']],['read_document'])
        self.assertEqual(mocked.call_args.kwargs['headers']['Authorization'],'Bearer never-return-bridge-secret')
        self.assertNotIn(tokens.access_token,r.text)
        self.assertNotIn('never-return-bridge-secret',r.text)

    def test_write_scope_forwards_tool_arguments_with_client_identity(self):
        g.STORE.put('grant','writegrant',{'client_id':self.info['client_id']},__import__('time').time()+100)
        tokens=g.PROVIDER.issue(self.info['client_id'],'writegrant',g.SCOPES)
        mocked=AsyncMock(return_value=httpx_response({'result':{'success':True}}))
        with patch('httpx.AsyncClient.post',mocked):
            r=self.client.post('/rw-mcp',headers={'authorization':'Bearer '+tokens.access_token},json={'jsonrpc':'2.0','id':3,'method':'tools/call','params':{'name':'create_document','arguments':{'title':'Chinese 测试'}}})
        self.assertTrue(__import__('json').loads(r.json()['result']['content'][0]['text'])['success'])
        self.assertEqual(r.json()['result']['structuredContent'],{'success':True})
        self.assertEqual(mocked.call_args.kwargs['json']['actor'],self.info['client_id'])
        self.assertEqual(mocked.call_args.kwargs['json']['args'],{'title':'Chinese 测试'})

    def test_browser_json_consent_and_denial_preserve_csrf_and_state(self):
        for decision in ['allow','deny']:
            r=self.client.get('/rw-oauth/authorize',params={'client_id':self.info['client_id'],'redirect_uri':self.redirect,'response_type':'code','code_challenge':self.challenge,'code_challenge_method':'S256','scope':' '.join(g.SCOPES),'state':'browser-state'},follow_redirects=False)
            location=r.headers['location'];tx=parse_qs(urlparse(location).query)['tx'][0]
            with patch.object(g,'owner_session',AsyncMock(return_value=True)):
                page=self.client.get(location)
                self.assertIn('script-src \'nonce-',page.headers['content-security-policy'])
                self.assertIn("connect-src 'self'",page.headers['content-security-policy'])
                nonce=self.client.cookies.get(g.COOKIE)
                r=self.client.post('/rw-oauth/consent',data={'tx':tx,'csrf':nonce,'decision':decision},headers={'origin':g.BASE,'accept':'application/json'})
            self.assertEqual(r.status_code,200,r.text)
            redirect=urlparse(r.json()['redirect'])
            self.assertEqual(redirect.hostname,'chatgpt.com')
            values=parse_qs(redirect.query)
            self.assertEqual(values['state'],['browser-state'])
            self.assertIn('code' if decision=='allow' else 'error',values)
            self.assertIsNone(g.STORE.get('pending',tx))

    def test_notion_callback_host_and_redirect_validation(self):
        valid='https://www.notion.so/api/v3/aiConnectorOAuthCallback'
        self.assertEqual(self.client.post('/rw-oauth/register',json={**self.registration,'redirect_uris':[valid]}).status_code,201)
        for invalid in ['https://notion.so.evil.test/api/oauth/callback','https://www.notion.so/api/callback?redirect=evil','https://www.notion.so:444/api/callback']:
            self.assertEqual(self.client.post('/rw-oauth/register',json={**self.registration,'redirect_uris':[invalid]}).status_code,400)


def httpx_response(data):
    import httpx
    return httpx.Response(200,json=data,request=httpx.Request('POST','http://bridge/rpc'))

if __name__=='__main__':unittest.main()
