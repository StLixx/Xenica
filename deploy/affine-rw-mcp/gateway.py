"""OAuth 2.1/PKCE adapter for the isolated AFFiNE read/write bridge.

SDK validates protocol, client authentication, redirects and PKCE. This provider
binds user consent to the existing AFFiNE owner session and persists grants.
It never forwards a client's bearer token to AFFiNE or accepts a workspace URL.
"""
import asyncio
import html
import json
import os
from pathlib import Path
import re
import secrets
import time
from urllib.parse import urlparse

import httpx
from mcp.server.auth.provider import (
    AccessToken, AuthorizationCode, AuthorizationParams, AuthorizeError,
    RefreshToken, RegistrationError, TokenError, construct_redirect_uri,
)
from mcp.server.auth.middleware.client_auth import ClientAuthenticator, AuthenticationError
from mcp.server.auth.routes import build_metadata, create_auth_routes, create_protected_resource_routes
from mcp.server.auth.settings import ClientRegistrationOptions, RevocationOptions
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyHttpUrl
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from starlette.routing import Mount, Route
from store import Store, digest

CONFIG = json.loads(Path(os.environ.get('AFFINE_MCP_CONFIG', '/private/gateway.json')).read_text())
BASE = CONFIG['public_url'].rstrip('/')
RESOURCE = BASE + '/rw-mcp'
ISSUER = BASE + '/rw-oauth'
SCOPES = ['affine:read', 'affine:write']
AUTHORING_POLICY = json.loads((Path(__file__).parent/'authoring'/'policy.json').read_text())
READ_TOOLS = {'list_documents', 'doc_search', 'read_document'} | set(AUTHORING_POLICY['read'])
AUTHORING_TOOLS = set(AUTHORING_POLICY['read'] + AUTHORING_POLICY['write'])
LEGACY_TOOLS = {'list_documents', 'doc_search', 'read_document', 'create_document', 'update_document', 'update_document_meta'}
UPSTREAM = CONFIG['upstream_url'].rstrip('/')
WORKSPACE = CONFIG['workspace_id']
OWNER = CONFIG['owner_id']
STORE = Store(os.environ.get('AFFINE_MCP_STORE', '/state/oauth.sqlite3'))
WORKSPACE_LOCK = asyncio.Lock()
COOKIE = '__Host-affine-rw-consent'
REGISTRATION = ClientRegistrationOptions(enabled=True, valid_scopes=SCOPES, default_scopes=SCOPES)
REVOCATION = RevocationOptions(enabled=True)


def allowed_redirect(uri):
    p = urlparse(str(uri))
    if p.scheme != 'https' or p.port not in (None, 443) or p.username or p.password or p.query or p.fragment:
        return False
    if p.hostname == 'chatgpt.com':
        return bool(re.fullmatch(r'/connector(?:/oauth)?/[^/]+/oauth/callback|/connector/oauth/[^/]+|/aip/[A-Za-z0-9_-]+/oauth/callback', p.path))
    if p.hostname in ('www.notion.so', 'www.notion.com', 'app.notion.com', 'notion.so', 'notion.com'):
        return p.path.startswith('/api/') or '/oauth/' in p.path
    return str(uri) in CONFIG.get('extra_redirect_uris', [])


class Provider:
    async def get_client(self, client_id):
        data = STORE.get('client',client_id)
        return OAuthClientInformationFull.model_validate(data) if data else None

    async def register_client(self, client_info):
        with STORE.db() as db:
            if db.execute("SELECT count(*) FROM records WHERE kind='client'").fetchone()[0]>=128:
                raise RegistrationError('invalid_client_metadata','Client registration capacity reached; contact operator')
        if not client_info.redirect_uris or not all(allowed_redirect(u) for u in client_info.redirect_uris):
            raise RegistrationError('invalid_redirect_uri','Only approved ChatGPT and Notion callback URLs are allowed')
        if client_info.token_endpoint_auth_method not in ('none','client_secret_post','client_secret_basic'):
            raise RegistrationError('invalid_client_metadata','Unsupported client authentication')
        STORE.put('client',client_info.client_id,client_info.model_dump(mode='json'),time.time()+10*365*86400)

    async def authorize(self, client, params):
        if params.resource not in (None,RESOURCE) or (not params.scopes or not set(params.scopes).issubset(SCOPES)) or ('affine:write' in params.scopes and 'affine:read' not in params.scopes):
            raise AuthorizeError('invalid_scope','Only this AFFiNE workspace read/write scopes are available')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',params.code_challenge):
            raise AuthorizeError('invalid_request','A valid S256 PKCE challenge is required')
        tx = secrets.token_urlsafe(32)
        STORE.put('pending',tx,{'client_id':client.client_id,'params':params.model_dump(mode='json')},time.time()+300)
        return ISSUER + '/consent?tx=' + tx

    async def load_authorization_code(self, client, authorization_code):
        data = STORE.get('code',authorization_code)
        if not data or data['client_id'] != client.client_id:return None
        return AuthorizationCode.model_validate({**data,'code':authorization_code})

    async def exchange_authorization_code(self, client, authorization_code):
        data = STORE.consume('code',authorization_code.code)
        if not data or data['client_id'] != client.client_id:
            raise TokenError('invalid_grant','Code already used or expired')
        grant = secrets.token_urlsafe(32)
        STORE.put('grant',grant,{'client_id':client.client_id},time.time()+30*86400)
        return self.issue(client.client_id,grant,authorization_code.scopes)

    def issue(self, client_id, grant, scopes):
        access,refresh = secrets.token_urlsafe(32),secrets.token_urlsafe(48)
        expiry = int(time.time())+3600
        data = {'client_id':client_id,'scopes':scopes,'resource':RESOURCE,'subject':OWNER,'grant':grant}
        STORE.put('access',access,{**data,'expires_at':expiry},expiry)
        STORE.put('refresh',refresh,{**data,'expires_at':int(time.time())+30*86400},time.time()+30*86400)
        return OAuthToken(access_token=access,token_type='Bearer',expires_in=3600,refresh_token=refresh,scope=' '.join(scopes))

    async def load_refresh_token(self, client, refresh_token):
        data = STORE.get('refresh',refresh_token)
        if not data or data['client_id'] != client.client_id or not STORE.get('grant',data['grant']):return None
        return RefreshToken.model_validate({**data,'token':refresh_token})

    async def exchange_refresh_token(self, client, refresh_token, scopes):
        data = STORE.consume('refresh',refresh_token.token)
        if not data or data['client_id'] != client.client_id or not STORE.get('grant',data['grant']):
            raise TokenError('invalid_grant','Refresh token already used, expired or revoked')
        return self.issue(client.client_id,data['grant'],scopes)

    async def load_access_token(self, token):
        data = STORE.get('access',token)
        if not data or data['resource'] != RESOURCE or (not data['scopes'] or not set(data['scopes']).issubset(SCOPES)) or not STORE.get('grant',data['grant']):return None
        return AccessToken.model_validate({**data,'token':token})

    async def revoke_token(self, token):
        kind = 'refresh' if isinstance(token,RefreshToken) else 'access'
        data = STORE.get(kind,token.token)
        if data:STORE.delete('grant',data['grant'])


PROVIDER = Provider()


async def owner_session(request):
    cookie = request.headers.get('cookie','')
    if not cookie:return False
    async with httpx.AsyncClient(timeout=10,trust_env=False) as client:
        r = await client.post(UPSTREAM+'/graphql',headers={'cookie':cookie},json={'query':'query { currentUser { id } workspaces { id } }'})
        data = r.json().get('data') or {}
    return (data.get('currentUser') or {}).get('id') == OWNER and any(w['id']==WORKSPACE for w in data.get('workspaces') or [])


def page(body,status=200):
    return HTMLResponse('<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>AFFiNE · MCP 授权</title><body style="font:18px system-ui;max-width:640px;margin:12vh auto;padding:24px"><h1>AFFiNE 文档连接</h1>'+body+'</body></html>',status_code=status)


async def consent(request):
    form = await request.form() if request.method=='POST' else request.query_params
    tx = form.get('tx','')
    pending = STORE.get('pending',tx)
    if not pending:return page('<p>授权请求已失效，请回到发起连接的应用重新连接。</p>',400)
    if not await owner_session(request):
        return page('<p>请先在此浏览器登录 AFFiNE 管理员账号，然后回到本页刷新。</p><p><a href="/" target="_blank" rel="noopener">打开 AFFiNE 登录</a></p>',401)
    if request.method=='GET':
        nonce = secrets.token_urlsafe(32)
        pending['consent_nonce'] = digest(nonce)
        STORE.put('pending',tx,pending,time.time()+300)
        requested = ', '.join(pending['params']['scopes']) if 'params' in pending else ''
        response = page('<p>申请权限：'+html.escape(requested)+'</p><p>允许此应用按申请的权限搜索、阅读文档及图片、新建和编辑原生块、数据库、导图、白板与资料整理。仅限本工作区，连接有效期最长 30 天，可随时撤销。</p><p>不开放永久删除、公开发布、账号管理、跨工作区或模型调用权限。简单 Markdown 正文替换仍保护复杂内容。</p><form method="post"><input type="hidden" name="tx" value="'+html.escape(tx)+'"><input type="hidden" name="csrf" value="'+nonce+'"><button name="decision" value="allow">允许文档连接</button> <button name="decision" value="deny">取消</button></form>')
        script_nonce=secrets.token_urlsafe(24)
        script="""<script nonce="%s">document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const data=new FormData(form);data.set('decision',event.submitter.value);const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{const response=await fetch('/rw-oauth/consent',{method:'POST',body:data,headers:{Accept:'application/json'},credentials:'same-origin'});const result=await response.json();if(!response.ok||!result.redirect)throw Error('授权提交失败，请返回连接应用重新连接');location.assign(result.redirect);}catch(error){const message=document.createElement('p');message.textContent=error.message;form.append(message);buttons.forEach(b=>b.disabled=false);}});</script>""" % script_nonce
        response.body+=script.encode()
        response.headers['content-length']=str(len(response.body))
        response.headers['Content-Security-Policy']="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-"+script_nonce+"'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
        response.set_cookie(COOKIE,nonce,max_age=300,secure=True,httponly=True,samesite='lax',path='/')
        return response
    nonce = request.cookies.get(COOKIE,'')
    if (request.headers.get('origin')!=BASE or not nonce or not secrets.compare_digest(nonce,form.get('csrf',''))
            or not secrets.compare_digest(digest(nonce),pending.get('consent_nonce',''))):
        return page('<p>授权校验失败，请重新连接。</p>',403)
    pending = STORE.consume('pending',tx)
    if not pending:return page('<p>请求已经使用。</p>',400)
    params = AuthorizationParams.model_validate(pending['params'])
    if form.get('decision')!='allow':
        redirect=construct_redirect_uri(str(params.redirect_uri),error='access_denied',state=params.state)
        if request.headers.get('accept')=='application/json':return JSONResponse({'redirect':redirect})
        return RedirectResponse(redirect,302)
    code = secrets.token_urlsafe(32)
    data = AuthorizationCode(code='',client_id=pending['client_id'],scopes=params.scopes,expires_at=time.time()+90,
        code_challenge=params.code_challenge,redirect_uri=params.redirect_uri,
        redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,resource=RESOURCE,subject=OWNER)
    STORE.put('code',code,data.model_dump(mode='json'),data.expires_at)
    redirect=construct_redirect_uri(str(params.redirect_uri),code=code,state=params.state)
    if request.headers.get('accept')=='application/json':return JSONResponse({'redirect':redirect})
    return RedirectResponse(redirect,302)


async def revoke(request):
    try:
        client=await ClientAuthenticator(PROVIDER).authenticate_request(request)
    except AuthenticationError:
        return JSONResponse({'error':'unauthorized_client'},401)
    form=await request.form()
    raw=form.get('token')
    if not isinstance(raw,str):return JSONResponse({'error':'invalid_request'},400)
    token=await PROVIDER.load_access_token(raw) or await PROVIDER.load_refresh_token(client,raw)
    if token and token.client_id==client.client_id:await PROVIDER.revoke_token(token)
    return Response(status_code=200)


async def metadata(request):
    m = build_metadata(AnyHttpUrl(ISSUER),None,REGISTRATION,REVOCATION).model_dump(mode='json',exclude_none=True)
    m['token_endpoint_auth_methods_supported']=['none','client_secret_post','client_secret_basic']
    return JSONResponse(m)


async def mcp(request):
    challenge = 'Bearer resource_metadata="' + BASE + '/.well-known/oauth-protected-resource/rw-mcp", scope="affine:read affine:write"'
    authorization = request.headers.get('authorization','')
    token = await PROVIDER.load_access_token(authorization[7:]) if authorization.startswith('Bearer ') else None
    if not token:
        return JSONResponse({'error':'unauthorized'},401,headers={'WWW-Authenticate':challenge})
    if request.method != 'POST':
        return Response(status_code=405, headers={'Allow':'POST'})
    try:
        body=await request.json()
    except (ValueError,UnicodeError):
        return JSONResponse({'error':'Invalid JSON'},400)
    if not isinstance(body,dict) or body.get('jsonrpc')!='2.0':
        return JSONResponse({'error':'Invalid JSON-RPC'},400)
    ident=body.get('id')
    if ident is not None and (isinstance(ident,bool) or not isinstance(ident,(int,str))):
        return JSONResponse({'error':'Invalid request id'},400)
    method=body.get('method')
    def rpc(result):
        return JSONResponse({'jsonrpc':'2.0','id':ident,'result':result})
    def error(code,message):
        return JSONResponse({'jsonrpc':'2.0','id':ident,'error':{'code':code,'message':message}})
    if method=='initialize':
        return rpc({'protocolVersion':(body.get('params',{}).get('protocolVersion') if isinstance(body.get('params'),dict) and body['params'].get('protocolVersion') in ('2024-11-05','2025-03-26','2025-06-18','2025-11-25') else '2025-06-18'),'capabilities':{'tools':{}},'serverInfo':{'name':'AFFiNE Read Write','version':'0.2.0' if CONFIG.get('authoring_url') else '0.1.0'},'instructions':'Native tools: read_doc before content writes and use expectedRevision; legacy tools use read_document/expected_revision. Use a unique idempotency_key per write, identical args/key for replay. Uncertain writes must be inspected; never repeat with a new key. inspect_document_assets then read_image returns actual image pixels. Only advertised tools are enabled; no permanent deletion, publication, account administration, or cross-workspace access. Native mindmap nodes are text shapes; images are separate document blocks.'})
    if method in ('notifications/initialized','notifications/cancelled'):
        return Response(status_code=202)
    if method=='ping':
        return rpc({})
    if method not in ('tools/list','tools/call'):
        return error(-32601,'Method not found')
    params=body.get('params') or {}
    if not isinstance(params,dict):
        return error(-32602,'Invalid params')
    tool=params.get('name')
    if method=='tools/call':
        if ident is None:
            return error(-32600,'Tool calls require a request id')
        if not isinstance(tool,str):
            return error(-32602,'Tool name required')
        if tool not in LEGACY_TOOLS and (tool not in AUTHORING_TOOLS or not CONFIG.get('authoring_url')):
            return error(-32602,'Unknown or disabled tool')
        if tool not in READ_TOOLS and 'affine:write' not in token.scopes:
            return rpc({'isError':True,'content':[{'type':'text','text':'WRITE_SCOPE_REQUIRED'}]})
        if 'affine:read' not in token.scopes:
            return rpc({'isError':True,'content':[{'type':'text','text':'READ_SCOPE_REQUIRED'}]})
    action={'action':'tools'} if method=='tools/list' else {'action':'call','tool':tool,'args':params.get('arguments',{}),'actor':token.client_id}
    try:
        async with httpx.AsyncClient(timeout=120,trust_env=False) as client:
            target=CONFIG['authoring_url'] if method=='tools/call' and tool in AUTHORING_TOOLS else CONFIG['bridge_url']
            async with WORKSPACE_LOCK:
                response=await client.post(target+'/rpc',headers={'Authorization':'Bearer '+CONFIG['bridge_secret']},json=action)
            if method=='tools/list' and CONFIG.get('authoring_url'):
                native=await client.post(CONFIG['authoring_url']+'/rpc',headers={'Authorization':'Bearer '+CONFIG['bridge_secret']},json={'action':'tools'})
                native.raise_for_status()
        response.raise_for_status()
        data=response.json()
        if method=='tools/list':
            definitions=data['tools']
            if CONFIG.get('authoring_url'):
                definitions += native.json()['tools']
            tools=[]
            for item in definitions:
                if item['name'] not in LEGACY_TOOLS | AUTHORING_TOOLS:
                    continue
                if item['name'] not in READ_TOOLS and 'affine:write' not in token.scopes:
                    continue
                scope=['affine:read'] if item['name'] in READ_TOOLS else SCOPES
                tools.append({**item,'securitySchemes':[{'type':'oauth2','scopes':scope}]})
            return rpc({'tools':tools})
        if 'mcp' in data:
            return rpc(data['mcp'])
        if 'error' in data:
            return rpc({'isError':True,'content':[{'type':'text','text':data['error']}]})
        return rpc({'content':[{'type':'text','text':json.dumps(data['result'],ensure_ascii=False)}],'structuredContent':data['result']})
    except (httpx.HTTPError,ValueError,KeyError):
        return rpc({'isError':True,'content':[{'type':'text','text':'AFFINE_BRIDGE_UNAVAILABLE'}]})


class Protection(BaseHTTPMiddleware):
    async def dispatch(self,request,call_next):
        if request.headers.get('origin') and request.headers['origin'] not in (BASE,'https://chatgpt.com','https://www.notion.so','https://www.notion.com','https://app.notion.com'):
            return Response(status_code=403)
        try:
            length=int(request.headers.get('content-length','0') or 0)
        except ValueError:
            return Response(status_code=400)
        limit=8*1024*1024 if request.url.path=='/rw-mcp' else 150000
        if length<0 or length>limit:return Response(status_code=413)
        size=0
        chunks=[]
        async for chunk in request.stream():
            size+=len(chunk)
            if size>limit:return Response(status_code=413)
            chunks.append(chunk)
        request._body=b''.join(chunks)
        if request.url.path.endswith('/token'):
            await request.body()
            form=await request.form()
            if form.get('resource') not in (None,RESOURCE):return JSONResponse({'error':'invalid_target'},400)
        response=await call_next(request)
        content_security=response.headers.get('Content-Security-Policy')
        response.headers.update({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"})
        if content_security:response.headers['Content-Security-Policy']=content_security
        return response


routes=create_protected_resource_routes(AnyHttpUrl(RESOURCE),[AnyHttpUrl(ISSUER)],scopes_supported=SCOPES,resource_name='AFFiNE read and write documents')
auth_routes=create_auth_routes(PROVIDER,AnyHttpUrl(ISSUER),client_registration_options=REGISTRATION,revocation_options=REVOCATION)
auth_routes=[r for r in auth_routes if r.path not in ('/.well-known/oauth-authorization-server','/revoke')]
routes += [Route('/.well-known/oauth-authorization-server/rw-oauth',metadata),Route('/rw-oauth/.well-known/oauth-authorization-server',metadata),Route('/rw-oauth/consent',consent,methods=['GET','POST']),Route('/rw-oauth/revoke',revoke,methods=['POST']),Route('/rw-mcp',mcp,methods=['POST','GET','DELETE']),Route('/health',lambda request:JSONResponse({'ok':True})),Mount('/rw-oauth',routes=auth_routes)]
app=Starlette(routes=routes)
app.add_middleware(Protection)
