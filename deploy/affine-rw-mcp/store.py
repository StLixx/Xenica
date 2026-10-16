"""Private SQLite OAuth state; atomic one-time consumption, hashed bearer tokens."""
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS records (kind TEXT, key TEXT, data TEXT, expires REAL, PRIMARY KEY(kind,key))')

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def put(self, kind, key, value, expires):
        with self.db() as db:
            db.execute('DELETE FROM records WHERE expires < ?', (time.time(),))
            db.execute('INSERT OR REPLACE INTO records VALUES (?,?,?,?)', (kind,digest(key),json.dumps(value),expires))

    def get(self, kind, key):
        with self.db() as db:
            row = db.execute('SELECT data FROM records WHERE kind=? AND key=? AND expires>=?', (kind,digest(key),time.time())).fetchone()
            return json.loads(row[0]) if row else None

    def consume(self, kind, key):
        with self.db() as db:
            row = db.execute('DELETE FROM records WHERE kind=? AND key=? AND expires>=? RETURNING data', (kind,digest(key),time.time())).fetchone()
            return json.loads(row[0]) if row else None

    def delete(self, kind, key):
        with self.db() as db:
            db.execute('DELETE FROM records WHERE kind=? AND key=?', (kind,digest(key)))

    def snapshot(self, target):
        with self.db() as src:
            dst = sqlite3.connect(str(target))
            try:
                src.backup(dst)
            finally:
                dst.close()
