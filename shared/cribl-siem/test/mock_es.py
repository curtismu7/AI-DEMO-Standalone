"""Stand-in for Elasticsearch in test/run-local.sh: answers 200 and appends every request to /data/received.ndjson."""
import http.server, json

class H(http.server.BaseHTTPRequestHandler):
    def _reply(self, body):
        b = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("X-elastic-product", "Elasticsearch")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_GET(self):
        self._reply({"name": "mock", "version": {"number": "9.1.4"}})
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        with open("/data/received.ndjson", "a") as f:
            f.write(json.dumps({"path": self.path, "authorization": self.headers.get("Authorization", ""), "body": body}) + "\n")
        n = len([l for l in body.splitlines() if l.strip()]) // 2
        self._reply({"errors": False, "took": 1, "items": [{"create": {"status": 201}}] * n})
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(("0.0.0.0", 9200), H).serve_forever()
