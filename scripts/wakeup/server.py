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


STATES = ('pending', 'sending', 'queued', 'cancelled', 'revoked', 'failed', 'unknown')
BASE = '/v1/wakeups'


def schedule_time(body):
    fields = [f for f in ('at', 'afterSeconds') if f in body]
    if len(fields) != 1:
        raise ApiError(400, 'provide exactly one of at or afterSeconds')
    field = fields[0]
    value = body[field]
    if type(value) is not int or value <= 0:
        raise ApiError(400, 'time must be a positive integer')
    return field, value


def deadline(field, value):
    now = now_ms()
    due = now + value * 1000 if field == 'afterSeconds' else value
    if not now < due <= 253402300799999:
        raise ApiError(400, 'deadline must be a future Unix timestamp in milliseconds')
    return due


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
            columns = {r['name'] for r in self.db.execute('PRAGMA table_info(wakes)')}
            if 'delivered_session' not in columns:
                self.db.execute('ALTER TABLE wakes ADD COLUMN delivered_session TEXT')
            if 'original' not in columns:
                self.db.execute('ALTER TABLE wakes ADD COLUMN original TEXT')
            self.db.execute("CREATE INDEX IF NOT EXISTS by_root ON wakes(root)")
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
        if not all(isinstance(v, str) and v for v in (root, token)):
            raise ApiError(400, 'rootId and token are required')
        if not hmac.compare_digest(token.encode(), self.token(root).encode()):
            raise ApiError(403, 'invalid root credentials')
        if session is not None and (not isinstance(session, str) or not session.startswith(root + ':')
                                    or not session[len(root)+1:]):
            raise ApiError(400, 'sessionId must belong to rootId')
        with self.lock, self.db:
            if path == BASE + '/list':
                limit, cursor = body.get('limit', 50), body.get('cursor', 0)
                state = body.get('status')
                if type(limit) is not int or not 1 <= limit <= 100:
                    raise ApiError(400, 'limit must be 1..100')
                if type(cursor) is not int or not 0 <= cursor < 2**63:
                    raise ApiError(400, 'invalid cursor')
                if state is not None and state not in STATES:
                    raise ApiError(400, 'invalid status')
                rows = self.db.execute("""SELECT rowid,* FROM wakes WHERE root=? AND rowid>?
                    AND (? IS NULL OR state=?) ORDER BY rowid LIMIT ?""",
                    (root, cursor, state, state, limit + 1)).fetchall()
                return 200, dict(items=[self.receipt(r) for r in rows[:limit]],
                                 nextCursor=rows[limit-1]['rowid'] if len(rows) > limit else None)
            if path in (BASE + '/status', BASE + '/update', BASE + '/cancel'):
                if not isinstance(body.get('id'), str):
                    raise ApiError(400, 'id is required')
                wake = body['id']
                row = self.db.execute('SELECT * FROM wakes WHERE id=? AND root=?', (wake, root)).fetchone()
                if not row:
                    raise ApiError(404, 'unknown wakeup')
                if path.endswith('/status') or (path.endswith('/cancel') and row['state'] == 'cancelled'):
                    return 200, self.receipt(row)
                if row['state'] != 'pending':
                    raise ApiError(409, 'only pending wakeups can be changed')
                if path.endswith('/cancel'):
                    self.db.execute("UPDATE wakes SET state='cancelled' WHERE id=?", (wake,))
                else:
                    if not {'prompt', 'sessionId', 'at', 'afterSeconds'}.intersection(body):
                        raise ApiError(400, 'provide a field to update')
                    prompt = body.get('prompt', row['prompt'])
                    if not isinstance(prompt, str) or not prompt.strip():
                        raise ApiError(400, 'prompt is required')
                    due = row['due']
                    if 'at' in body or 'afterSeconds' in body:
                        due = deadline(*schedule_time(body))
                    original = json.dumps([row['session'], row['prompt'], row['spec']])
                    self.db.execute("""UPDATE wakes SET original=coalesce(original,?),prompt=?,session=?,
                        due=?,retry=0 WHERE id=?""", (original, prompt, body.get('sessionId', row['session']), due, wake))
                self.lock.notify()
                return 200, self.receipt(self.db.execute('SELECT * FROM wakes WHERE id=?', (wake,)).fetchone())
            if path != BASE:
                raise ApiError(404, 'unknown endpoint')
            prompt = body.get('prompt')
            if not isinstance(prompt, str) or not prompt.strip():
                raise ApiError(400, 'prompt is required')
            field, value = schedule_time(body)
            if key is not None and not 1 <= len(key) <= 200:
                raise ApiError(400, 'invalid Idempotency-Key')
            spec = json.dumps([field, value])
            previous = self.db.execute('SELECT * FROM wakes WHERE root=? AND key=?', (root, key)).fetchone()
            if previous:
                original = json.loads(previous['original']) if previous['original'] else [previous['session'], previous['prompt'], previous['spec']]
                if original != [session, prompt, spec]:
                    raise ApiError(409, 'Idempotency-Key already used')
                return 200, self.receipt(previous)
            due = deadline(field, value)
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
        return dict(id=row['id'], sessionId=row['session'], prompt=row['prompt'], at=row['due'], status=row['state'], taskId=row['task'],
                    deliveredSessionId=row['delivered_session'])

    def deliver(self, row):
        token = self.token(row['root'])
        if hashlib.sha256(token.encode()).hexdigest() != row['digest']:
            return 'revoked', None, None
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=15)
        try:
            try:
                conn.connect()
            except OSError:
                return 'pending', None, None
            body = dict(rootId=row['root'], token=token, content=row['prompt'])
            if row['session'] is not None:
                body['sessionId'] = row['session']
            conn.request('POST', '/api/external/message', json.dumps(body), {'Content-Type': 'application/json'})
            response = conn.getresponse()
            result = json.load(response)
            if response.status == 200 and result.get('success'):
                task = result['data'][0]
                return 'queued', task['id'], task.get('sessionId')
            return 'failed', None, None
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
            state, task, delivered_session = self.deliver(row)
        except Exception:
            # A lost acknowledgement can follow a successful enqueue.
            state, task, delivered_session = 'unknown', None, None
        with self.lock, self.db:
            self.db.execute('UPDATE wakes SET state=?,task=?,delivered_session=?,retry=? WHERE id=?',
                            (state, task, delivered_session, now_ms() + 5000, row['id']))


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            if self.path not in (BASE, *(BASE + '/' + op for op in ('status', 'list', 'update', 'cancel'))):
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
