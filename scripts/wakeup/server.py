"""Durable loopback scheduler for Clootee's external message inbox."""
import argparse
import hashlib
import hmac
import http.client
import json
import os
import sqlite3
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def now_ms():
    return time.time_ns() // 1_000_000


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Scheduler:
    def __init__(self, data, port):
        self.data = data
        self.port = port
        self.db = sqlite3.connect(data / 'wakeups.sqlite', check_same_thread=False)
        self.lock = threading.Condition()
        self.db.row_factory = sqlite3.Row
        with self.db:
            self.db.execute("""CREATE TABLE IF NOT EXISTS wakes (
                id TEXT PRIMARY KEY, root TEXT, session TEXT, digest TEXT, prompt TEXT,
                due INTEGER, state TEXT, task TEXT, key TEXT, spec TEXT, retry INTEGER DEFAULT 0,
                UNIQUE(root,key))""")
            self.db.execute("CREATE INDEX IF NOT EXISTS pending ON wakes(state,due)")
            self.db.execute("UPDATE wakes SET state='unknown' WHERE state='sending'")

    def token(self, root):
        roots = json.loads((self.data / 'roots.json').read_text(encoding='utf-8'))
        for item in roots:
            if item['id'] == root and item.get('externalApiOpen') is not False:
                return item.get('externalApiToken') or ''
        return ''

    def request(self, path, body, key):
        root, session, token = (body.get(k) for k in ('rootId', 'sessionId', 'token'))
        if not all(isinstance(v, str) and v for v in (root, session, token)):
            raise ApiError(400, 'rootId, sessionId and token are required')
        if not hmac.compare_digest(token.encode(), self.token(root).encode()):
            raise ApiError(403, 'invalid root credentials')
        if not session.startswith(root + ':') or not session[len(root)+1:]:
            raise ApiError(400, 'sessionId must belong to rootId')
        with self.lock, self.db:
            if path == '/v1/wakeups/status':
                if not isinstance(body.get('id'), str):
                    raise ApiError(400, 'id is required')
                row = self.db.execute('SELECT * FROM wakes WHERE id=? AND root=? AND session=?',
                                      (body['id'], root, session)).fetchone()
                if not row:
                    raise ApiError(404, 'unknown wakeup')
                return 200, self.receipt(row)
            prompt = body.get('prompt')
            if not isinstance(prompt, str) or not prompt.strip():
                raise ApiError(400, 'prompt is required')
            fields = [f for f in ('at', 'afterSeconds') if f in body]
            if len(fields) != 1:
                raise ApiError(400, 'provide exactly one of at or afterSeconds')
            field = fields[0]
            value = body[field]
            if type(value) is not int or value <= 0:
                raise ApiError(400, 'time must be a positive integer')
            if key is not None and not 1 <= len(key) <= 200:
                raise ApiError(400, 'invalid Idempotency-Key')
            spec = json.dumps([field, value])
            previous = self.db.execute('SELECT * FROM wakes WHERE root=? AND key=?', (root, key)).fetchone()
            if previous:
                if (previous['session'], previous['prompt'], previous['spec']) != (session, prompt, spec):
                    raise ApiError(409, 'Idempotency-Key already used')
                return 200, self.receipt(previous)
            now = now_ms()
            due = now + value * 1000 if field == 'afterSeconds' else value
            if not now < due <= 253402300799999:
                raise ApiError(400, 'deadline must be a future Unix timestamp in milliseconds')
            wake = uuid.uuid4().hex
            digest = hashlib.sha256(token.encode()).hexdigest()
            with self.db:
                self.db.execute("""INSERT INTO wakes(id,root,session,digest,prompt,due,state,key,spec)
                                VALUES(?,?,?,?,?,?,'pending',?,?)""",
                                (wake, root, session, digest, prompt, due, key, spec))
            self.lock.notify()
            return 201, self.receipt(self.db.execute('SELECT * FROM wakes WHERE id=?', (wake,)).fetchone())

    @staticmethod
    def receipt(row):
        return dict(id=row['id'], sessionId=row['session'], at=row['due'], status=row['state'], taskId=row['task'])

    def deliver(self, row):
        token = self.token(row['root'])
        if hashlib.sha256(token.encode()).hexdigest() != row['digest']:
            return 'revoked', None
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=15)
        try:
            try:
                conn.connect()
            except OSError:
                return 'pending', None
            body = dict(rootId=row['root'], sessionId=row['session'], token=token, content=row['prompt'])
            conn.request('POST', '/api/external/message', json.dumps(body), {'Content-Type': 'application/json'})
            response = conn.getresponse()
            result = json.load(response)
            if response.status == 200 and result.get('success'):
                return 'queued', result['data'][0]['id']
            return 'failed', None
        finally:
            conn.close()

    def next_due(self):
        with self.lock:
            while True:
                row = self.db.execute("""SELECT * FROM wakes WHERE state='pending'
                                      ORDER BY max(due,retry),rowid LIMIT 1""").fetchone()
                delay = max(row['due'], row['retry']) - now_ms() if row else 60000
                if delay > 0:
                    self.lock.wait(min(delay, 60000) / 1000)
                    continue
                with self.db:
                    self.db.execute("UPDATE wakes SET state='sending' WHERE id=?", (row['id'],))
                return row

    def dispatch_next(self):
        row = self.next_due()
        try:
            state, task = self.deliver(row)
        except Exception:
            # A lost acknowledgement can follow a successful enqueue.
            state, task = 'unknown', None
        with self.lock, self.db:
            self.db.execute('UPDATE wakes SET state=?,task=?,retry=? WHERE id=?',
                            (state, task, now_ms() + 5000, row['id']))


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            if self.path not in ('/v1/wakeups', '/v1/wakeups/status'):
                raise ApiError(404, 'unknown endpoint')
            if self.headers.get_content_type() != 'application/json':
                raise ApiError(415, 'application/json required')
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 256 * 1024:
                raise ApiError(400, 'invalid body size')
            self.connection.settimeout(10)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ApiError(400, 'expected a JSON object')
            status, result = self.server.scheduler.request(self.path, body, self.headers.get('Idempotency-Key'))
        except ApiError as error:
            status, result = error.status, {'error': str(error)}
        except (ValueError, RecursionError):
            status, result = 400, {'error': 'invalid request'}
        except Exception:
            status, result = 500, {'error': 'scheduler unavailable'}
        data = json.dumps(result).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=Path(__file__).resolve().parents[2] / 'projects/claude_hub/data')
    parser.add_argument('--port', type=int, default=19873)
    parser.add_argument('--hub-port', type=int, default=8970)
    args = parser.parse_args()
    os.umask(0o077)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.scheduler = Scheduler(args.data, args.hub_port)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    while True:
        server.scheduler.dispatch_next()
