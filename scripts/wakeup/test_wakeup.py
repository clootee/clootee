import concurrent.futures
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from server import ApiError, Scheduler, now_ms


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
        self.assertEqual(self.scheduler.deliver(row), ('revoked', None))

    def test_absolute_delivery(self):
        received = []
        class Inbox(BaseHTTPRequestHandler):
            def do_POST(self):
                size = int(self.headers['Content-Length'])
                received.append((now_ms(), self.path, json.loads(self.rfile.read(size))))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"success":true,"data":[{"id":"task1"}]}')

        with HTTPServer(('127.0.0.1', 0), Inbox) as inbox:
            self.scheduler.port = inbox.server_port
            inbox.timeout = 3
            worker = threading.Thread(target=inbox.handle_request)
            worker.start()
            due = now_ms() + 200
            _, receipt = self.scheduler.request('/v1/wakeups', dict(self.body, at=due), None)
            self.scheduler.dispatch_next()
            worker.join(3)
            self.assertEqual(len(received), 1)
            actual, path, body = received[0]
            self.assertGreaterEqual(actual, due)
            self.assertEqual(path, '/api/external/message')
            self.assertEqual((body['content'], body['sessionId']), ('wake up', 'r:s'))
            _, state = self.scheduler.request('/v1/wakeups/status', dict(self.body, id=receipt['id']), None)
            self.assertEqual((state['status'], state['taskId']), ('queued', 'task1'))


if __name__ == '__main__':
    unittest.main()
