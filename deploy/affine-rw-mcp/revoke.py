"""Revoke all grants for an exact registered client name, without printing secrets."""
import argparse
import json
import sqlite3
p=argparse.ArgumentParser();p.add_argument('--client-name',required=True);p.add_argument('--apply',action='store_true');args=p.parse_args()
with sqlite3.connect('/mnt/HDD/affine-rw-mcp/gateway/oauth.sqlite3',timeout=10) as db:
    ids={d['client_id'] for (raw,) in db.execute("SELECT data FROM records WHERE kind='client'") if (d:=json.loads(raw)).get('client_name')==args.client_name}
    rows=[key for key,raw in db.execute("SELECT key,data FROM records WHERE kind='grant'") if json.loads(raw).get('client_id') in ids]
    if args.apply:db.executemany("DELETE FROM records WHERE kind='grant' AND key=?",[(key,) for key in rows])
    print(json.dumps({'clients':len(ids),'grants':len(rows),'revoked':args.apply}))
