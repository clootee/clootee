import concurrent.futures
import json
import os
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from server import Handler, ApiError, Scheduler, now_ms


class WakeupTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name)
        self.roots = self.path / 'roots.json'
        self.roots.write_text(json.dumps([dict(id='r', externalApiToken='example')]))
        self.body = dict(rootId='r', sessionId='r:s', token='example', prompt='wake up')
        self.scheduler = Scheduler(self.path, 1)
        self.addCleanup(lambda: self.scheduler.db.close())

    def test_concurrent_create_and_restart(self):
        def post(_):
            return self.scheduler.request('/v1/wakeups', dict(self.body, afterSeconds=30), 'same')
        with concurrent.futures.ThreadPoolExecutor(8) as pool:
            results = list(pool.map(post, range(12)))
        self.assertEqual(sum(code == 201 for code, _ in results), 1)
        self.assertEqual(len({r['id'] for _, r in results}), 1)
        self.scheduler.db.close()
        self.scheduler = Scheduler(self.path, 1)
        self.assertEqual(post(None)[1], results[0][1])
        with self.assertRaises(ApiError) as error:
            self.scheduler.request('/v1/wakeups', dict(self.body, afterSeconds=31), 'same')
        self.assertEqual(error.exception.status, 409)
        row = self.scheduler.db.execute('SELECT * FROM wakes').fetchone()
        self.roots.write_text('[]')
        self.assertEqual(self.scheduler.deliver(row), ('revoked', None, None))

    def test_manage_across_sessions(self):
        def request(operation, **fields):
            return self.scheduler.request('/v1/wakeups/' + operation,
                                          dict(rootId='r', token='example', **fields), None)[1]
        create = dict(self.body, afterSeconds=300)
        _, first = self.scheduler.request('/v1/wakeups', create, 'first')
        _, second = self.scheduler.request('/v1/wakeups', create, 'second')
        page = request('list', limit=1)
        self.assertEqual(page['items'], [first])
        self.assertEqual(request('list', cursor=page['nextCursor'])['items'], [second])
        wake = first['id']
        self.assertEqual(request('update', id=wake, afterSeconds=60)['sessionId'], 'r:s')
        self.assertEqual(request('update', id=wake, sessionId='r:other')['sessionId'], 'r:other')
        updated = request('update', id=wake, sessionId=None, prompt='check release', at=now_ms()+90000)
        self.assertIsNone(updated['sessionId'])
        self.assertEqual(self.scheduler.request('/v1/wakeups', create, 'first')[1], updated)
        self.assertEqual(request('cancel', id=wake)['status'], 'cancelled')
        self.assertEqual(request('cancel', id=wake)['status'], 'cancelled')
        self.assertEqual(request('list', status='pending')['items'], [second])
        with self.assertRaises(ApiError) as error:
            request('update', id=wake, prompt='too late')
        self.assertEqual(error.exception.status, 409)
        self.roots.write_text(json.dumps([dict(id='other', externalApiToken='other-token')]))
        for op in ('status', 'update', 'cancel'):
            with self.assertRaises(ApiError) as error:
                self.scheduler.request('/v1/wakeups/'+op, dict(rootId='other', token='other-token', id=wake), None)
            self.assertEqual(error.exception.status, 404)

    def test_mcp_http_roundtrip(self):
        with HTTPServer(('127.0.0.1', 0), Handler) as http:
            http.scheduler = self.scheduler
            worker = threading.Thread(target=http.serve_forever)
            worker.start()
            try:
                with subprocess.Popen(['node', str(Path(__file__).with_name('mcp.cjs'))],
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                      env=dict(os.environ, CLOOTEE_ROOT_ID='r', CLOOTEE_EXTERNAL_TOKEN='example',
                                               CLOOTEE_WAKEUP_PORT=str(http.server_port))) as child:
                    try:
                        def rpc(method, **params):
                            child.stdin.write(json.dumps(dict(jsonrpc='2.0', id=1, method=method, params=params))+'\n')
                            child.stdin.flush()
                            return json.loads(child.stdout.readline())['result']
                        self.assertIn('tools', rpc('initialize')['capabilities'])
                        self.assertEqual(len(rpc('tools/list')['tools']), 5)
                        def call(op, **args):
                            result = rpc('tools/call', name='wakeup_'+op, arguments=args)
                            self.assertFalse(result['isError'], result)
                            return json.loads(result['content'][0]['text'])
                        receipt = call('create', prompt='check', afterSeconds=20, idempotencyKey='mcp')
                        self.assertIsNone(receipt['sessionId'])
                        self.assertEqual(call('list')['items'], [receipt])
                        self.assertEqual(call('update', id=receipt['id'], sessionId='r:s')['sessionId'], 'r:s')
                        self.assertEqual(call('cancel', id=receipt['id'])['status'], 'cancelled')
                        self.assertEqual(call('status', id=receipt['id'])['status'], 'cancelled')
                    finally:
                        child.stdin.close()
            finally:
                http.shutdown()
                worker.join()

    def test_absolute_delivery(self):
        self.check_delivery('r:s')
        self.check_delivery(None)

    def check_delivery(self, session):
        received = []
        class Inbox(BaseHTTPRequestHandler):
            def do_POST(self):
                size = int(self.headers['Content-Length'])
                received.append((now_ms(), self.path, json.loads(self.rfile.read(size))))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"success":true,"data":[{"id":"task1","sessionId":"r:actual"}]}')

        with HTTPServer(('127.0.0.1', 0), Inbox) as inbox:
            self.scheduler.port = inbox.server_port
            inbox.timeout = 3
            worker = threading.Thread(target=inbox.handle_request)
            worker.start()
            due = now_ms() + 200
            _, receipt = self.scheduler.request('/v1/wakeups', dict(self.body, at=due, sessionId=session), None)
            self.scheduler.dispatch_next()
            worker.join(3)
            self.assertEqual(len(received), 1)
            actual, path, body = received[0]
            self.assertGreaterEqual(actual, due)
            self.assertEqual(path, '/api/external/message')
            self.assertEqual(body['content'], 'wake up')
            if session:
                self.assertEqual(body['sessionId'], session)
            else:
                self.assertNotIn('sessionId', body)
            _, state = self.scheduler.request('/v1/wakeups/status', dict(self.body, id=receipt['id']), None)
            self.assertEqual(state['deliveredSessionId'], 'r:actual')
            self.assertEqual((state['status'], state['taskId']), ('queued', 'task1'))


if __name__ == '__main__':
    unittest.main()
