// Mock-only static server. Loopback bind, Host check, same-origin writes, /api/health.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 7843);
const HOST = process.env.BIND_HOST || '127.0.0.1';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (host !== 'localhost' && host !== '127.0.0.1') { send(res, 403, JSON.stringify({ error: 'bad host' })); return; }
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/api/health') { send(res, 200, JSON.stringify({ schema: 'demo-health/1', app: 'ap-platform-agents-lab', mode: 'mock' })); return; }
  if (req.method === 'GET' && url.pathname === '/api/info') { send(res, 200, JSON.stringify({ mode: 'mock', liveAvailable: false, reason: 'This app is a mock. It has no tenant, no credentials and no outbound calls.' })); return; }
  if (req.method !== 'GET') { send(res, 405, JSON.stringify({ error: 'GET only' })); return; }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(ROOT, 'public', p));
  if (!file.startsWith(path.join(ROOT, 'public'))) { send(res, 403, JSON.stringify({ error: 'forbidden' })); return; }
  fs.readFile(file, (err, data) => {
    if (err) { send(res, 404, JSON.stringify({ error: 'not found' })); return; }
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(PORT, HOST, () => console.log(`AI Platform Agents Mock LAB on http://${HOST}:${PORT} (mock)`));
