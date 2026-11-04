// cimd-doc-server — shared CIMD Client ID Metadata Document publisher for the
// standalone family (rule 20 shared infrastructure). Stands in for the public
// https://client.dev/oauth/metadata.json so labs and PingFederate can resolve
// CIMD clients without depending on a third-party site.
//
//   GET /oauth/metadata.json          — the client.dev-compatible demo client
//   GET /documents/:name.json         — any document from ./documents
//   GET /api/health                   — demo-health/1
//
// CIMD §4: a document's client_id IS its own URL. Documents are validated at
// serve time: client_id must equal the request URL (rebuilt from forwarded
// headers), so a document can never drift behind a proxy or port change.
import http from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 5252);
const HERE = dirname(fileURLToPath(import.meta.url));
const DOCUMENTS = process.env.DOC_DIR || join(HERE, '..', 'documents');
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '127.0.0.1,localhost,local.ping-devops.com').split(',').map((h) => h.trim());

const demoDoc = {
  client_id: 'PLACEHOLDER', // rewritten at serve time: this URL
  client_name: 'CIMD shared demo client',
  client_uri: 'https://github.com/stytchauth/client.dev', // source of the document shape (MIT)
  redirect_uris: [], // rewritten at serve time: this origin + /oauth/callback
  grant_types: ['authorization_code'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
};

function requestOrigin(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host || !ALLOWED_HOSTS.includes(host.split(':')[0])) return null;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const port = host.includes(':') ? '' : proto === 'https' ? ':8443' : `:${PORT}`;
  return `${proto}://${host}${port}`;
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://placeholder');
  const origin = requestOrigin(req);
  if (!origin) return send(res, 403, JSON.stringify({ error: 'forbidden_host' }));

  if (url.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ schema: 'demo-health/1', at: new Date().toISOString(), state: 'ready', demo: { id: 'cimd-doc-server', name: 'CIMD Document Server' } }) + '\n');
  }

  const docUrl = `${origin}${url.pathname}`;
  let doc = null;
  if (url.pathname === '/oauth/metadata.json') {
    doc = { ...demoDoc, client_id: docUrl, redirect_uris: [`${origin}/oauth/callback`] };
  } else {
    const m = url.pathname.match(/^\/documents\/([A-Za-z0-9_-]+\.json)$/);
    if (m) {
      const file = join(DOCUMENTS, m[1]);
      if (existsSync(file)) {
        try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch { return send(res, 500, JSON.stringify({ error: 'invalid_document' })); }
      }
    }
  }
  if (!doc) return send(res, 404, JSON.stringify({ error: 'no_such_document' }));

  // CIMD §4 invariant: client_id IS the URL the document was fetched from.
  if (doc.client_id !== docUrl) doc.client_id = docUrl;
  send(res, 200, JSON.stringify(doc, null, 2) + '\n');
});

// Bind all interfaces so Docker's loopback-only publish works; the Host
// allow-list above is the real guard.
server.listen(PORT, () => console.log(`cimd-doc-server on http://0.0.0.0:${PORT}`));
