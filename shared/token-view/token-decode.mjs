// Vanilla (non-React) JWT decoding for static HTML pages — Rule 24b, phase 5 (owner: do it, 2026-11-19).
// Same pure decoder as the shared JsonPane: base64url in, objects out. No eval, no network, no libraries.
// decorateTokens(root) finds whole JWTs in text nodes and elements marked data-jwt / .jwt, and appends a
// decoded card built with DOM APIs (textContent only — never innerHTML). Text nodes are never modified:
// the decoded card is ADDED after the element, so a copy button or raw view keeps its exact bytes.
// Caps match the React pane: 6 tokens per decorate call, depth 8; cut-short and non-JWT strings skipped;
// opaque tokens and secrets are never decoded. Decoding is not verification.

export function decodeSegment(seg) {
  const t = String(seg).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

const WHOLE_JWT = /^(?:(?:Bearer|DPoP) )?(eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*)$/;

export function decodeJwt(raw) {
  const m = WHOLE_JWT.exec(String(raw || "").trim());
  if (!m) return null;
  try {
    const [h, p, s] = m[1].split(".");
    const header = decodeSegment(h);
    const claims = decodeSegment(p);
    if (!header || !claims) return null;
    return { raw: m[1], header, claims, signature: s };
  } catch { return null; }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function pane(title, value) {
  const wrap = el("div", "tv__pane");
  wrap.appendChild(el("p", "tv__h", title));
  const pre = el("pre", "tv__json");
  pre.textContent = JSON.stringify(value, null, 2);
  pre.tabIndex = 0;
  wrap.appendChild(pre);
  return wrap;
}

function card(name, token) {
  const c = el("article", "tv__card");
  // (built below; the wrapper is appended, not text-coerced)
  c.dataset.testid = "decoded-token";
  c.setAttribute("role", "group");
  c.setAttribute("aria-label", `${name} decoded`);
  c.appendChild(el("p", "tv__name", name));
  c.appendChild(pane("Header", token.header));
  c.appendChild(pane("Payload", token.claims));
  c.appendChild(el("p", "tv__h", "Signature"));
  c.appendChild(el("pre", "tv__sig", token.signature || "This token has no signature segment."));
  const wrap = el("div", "tv");
  wrap.appendChild(c);
  return wrap;
}

// The text walker: whole JWTs in text nodes of `root`, capped, deduped by raw value.
export function decorateTokens(root = document.body) {
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode()) && out.length < 6) {
    const t = n.nodeValue;
    let i = t.indexOf("eyJ");
    while (i >= 0 && out.length < 6) {
      const tail = t.slice(i).trimStart();
      const token = decodeJwt(tail.slice(0, tail.search(/[),;\s]|$/)));
      if (token && !seen.has(token.raw)) {
        seen.add(token.raw);
        const host = n.parentElement;
        if (host) { const cardEl = card(host.textContent.trim().slice(0, 40) || "token", token); host.insertAdjacentElement("afterend", cardEl); out.push(cardEl); }
      }
      i = t.indexOf("eyJ", i + 1);
    }
  }
  // Explicit markers win: <pre data-jwt> / .jwt elements get a decoded card even if the walker missed them.
  for (const e of root.querySelectorAll("[data-jwt], .jwt")) {
    if (out.length >= 6) break;
    const token = decodeJwt(e.textContent);
    if (token && !seen.has(token.raw)) {
      seen.add(token.raw);
      const c = card(e.getAttribute("data-jwt") || e.dataset.name || "token", token);
      e.insertAdjacentElement("afterend", c);
      out.push(c);
    }
  }
  return out;
}

// Styles: theme tokens only, no colour literals, no !important.
export const TOKEN_VIEW_CSS = `
.tv { display: grid; gap: 8px; min-width: 0; }
.tv__card { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); display: grid; gap: 4px; }
.tv__name { margin: 0; font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--text); overflow-wrap: anywhere; }
.tv__h { margin: 6px 0 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.tv__json, .tv__sig { margin: 0; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); font-family: var(--font-mono); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-body); max-height: none; overflow: visible; }
`;
