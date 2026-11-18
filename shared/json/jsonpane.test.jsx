// JsonPane tests (vitest + Testing Library + jsdom). Run where the file is vendored
// (web/src/components/, next to web/src/safeText.js) — see shared/gateway-trace/gateway-trace.test.jsx.
import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Json, setJsonView, decodedTokensIn, decodeSegment } from "./JsonPane";

// JWT-shaped strings assembled at run time (never a real token in the repo).
const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwtOf = (header, claims, sig = "c2lnbmF0dXJl") => [b64(header), b64(claims), sig].join(".");

afterEach(cleanup);

beforeEach(() => setJsonView("form"));

describe("JsonPane Form view: single-href link objects collapse", () => {
  test("a one-key { href } object shows the parent key with the URL as its value, no nested href row", () => {
    render(<Json value={{ _links: { branding: { href: "https://api.pingone.com/v1/branding" } } }} testId="links" />);
    const row = screen.getByText("branding").closest(".jform__row");
    expect(row).not.toBeNull();
    expect(screen.queryByText("href")).toBeNull();
    const url = row.querySelector(".jform__v--url");
    expect(url).not.toBeNull();
    expect(url).toHaveTextContent("https://api.pingone.com/v1/branding");
  });

  test("a multi-key object and an array of href objects stay nested as before", () => {
    render(
      <Json
        value={{
          _links: {
            multi: { href: "https://api.pingone.com/v1/x", method: "GET" },
            list: [{ href: "https://api.pingone.com/v1/a" }],
          },
        }}
        testId="links2"
      />
    );
    expect(screen.getByText("multi")).toBeInTheDocument();
    expect(screen.getByText("href")).toBeInTheDocument();
    expect(screen.getByText("method")).toBeInTheDocument();
    expect(screen.getByText("list")).toBeInTheDocument();
  });
});

describe("decoded tokens (Rule 24b)", () => {
  test("a PingOne-shaped token in a body: raw in its field, then Header, Payload and Signature under the pane, named by the field", () => {
    const token = jwtOf(
      { alg: "RS256", kid: "mock-key-1", typ: "JWT" },
      { sub: "u-123", client_id: "bank-app", iss: "https://auth.ping-devops.com/as", aud: ["gateway"], scope: "openid transfer", iat: 1769000000, exp: 1769003600, may_act: JSON.stringify({ sub: "agent-1" }) }
    );
    render(<Json label="Token response" value={{ access_token: token, token_type: "Bearer", expires_in: 3600 }} />);
    const box = screen.getByTestId("decoded-tokens");
    const card = within(box).getByTestId("decoded-token");
    expect(card.textContent).toMatch(/access_token/);
    for (const h of ["Header", "Payload", "Signature"]) expect(within(card).getByText(h)).toBeTruthy();
    expect(card.textContent).toMatch(/RS256/);
    expect(card.textContent).toMatch(/u-123/);
    expect(card.textContent).toMatch(/transfer/);
    expect(card.textContent).toMatch(/gateway/);
    expect(card.textContent).toMatch(/agent-1/);
  });

  test("a Bearer authorization header, a nested act chain, and JSON that arrived as text are all decoded", () => {
    const inner = jwtOf({ alg: "ES256", kid: "mock-key-1" }, { sub: "agent-1", client_id: "agent-1", scope: "trips:read" });
    const outer = jwtOf({ alg: "RS256", kid: "k2" }, { sub: "u-123", act: { sub: "agent-1" } });
    render(<Json label="Exchange request" value={{ headers: { authorization: `Bearer ${outer}` }, body: { grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: inner } }} />);
    const names = screen.getAllByTestId("decoded-token").map((e) => e.querySelector(".jdec__name").textContent);
    expect(names).toEqual(["headers.authorization", "body.subject_token"]);
    cleanup();
    render(<Json label="text body" value={JSON.stringify({ access_token: outer })} />);
    expect(screen.getByTestId("decoded-token").textContent).toMatch(/access_token/);
  });

  test("decode={false} skips decoding; the same token is shown once; caps hold (6 tokens, depth 8)", () => {
    const token = jwtOf({ alg: "none" }, { sub: "s" }, "");
    render(<Json label="raw" value={{ access_token: token }} decode={false} />);
    expect(screen.queryByTestId("decoded-tokens")).toBeNull();
    cleanup();
    const found = decodedTokensIn({ a: token, b: { c: token } });
    expect(found).toHaveLength(1);
    expect(decodedTokensIn(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`t${i}`, jwtOf({ alg: "none" }, { sub: `s${i}` })])))).toHaveLength(6);
    expect(decodedTokensIn({ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: token } } } } } } } } } })).toHaveLength(0);
  });

  test("an unsigned token says so; a cut-short or non-JWT is skipped; decoded text is rendered as text, never as markup", () => {
    const token = jwtOf({ alg: "none" }, { sub: "<img src=x onerror=alert(1)>" }, "");
    render(<Json label="unsigned" value={{ access_token: token, short: `${token.slice(0, 40)}...`, note: "eyJ not a token" }} />);
    const card = screen.getByTestId("decoded-token");
    expect(card.textContent).toMatch(/no signature segment/);
    expect(card.querySelector("img, script")).toBeNull();
    expect(card.textContent).toMatch(/<img src=x onerror=alert\(1\)>/);
    expect(screen.getAllByTestId("decoded-token")).toHaveLength(1);
  });

  test("decodeSegment handles base64url with and without padding and returns null for non-objects", () => {
    expect(decodeSegment(b64({ alg: "RS256" }))).toEqual({ alg: "RS256" });
    expect(decodeSegment(btoa(JSON.stringify({ alg: "ES256" })))).toEqual({ alg: "ES256" });
    expect(() => decodeSegment("!!!")).toThrow();
  });
});
