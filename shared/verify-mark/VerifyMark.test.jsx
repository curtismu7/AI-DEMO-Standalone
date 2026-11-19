// Runs wherever the component is vendored (vitest + Testing Library + jsdom). Not vendored itself.
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VerifyMark, { VerifyBadge } from "./VerifyMark.jsx";

const mark = (status, extra = {}) => ({ status, label: status === "verified" ? "Verified" : "In progress", note: "", updatedAt: "2026-11-14", source: "shipped", ...extra });
afterEach(() => vi.unstubAllGlobals());

describe("VerifyBadge", () => {
  it("renders nothing for no mark and for none", () => {
    const { container, rerender } = render(<VerifyBadge mark={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<VerifyBadge mark={{ status: "none", label: "Not checked" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the label and the note, and says when the mark is only on this machine", () => {
    render(<VerifyBadge mark={mark("verified", { note: "Works", source: "local" })} />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Works")).toBeInTheDocument();
    expect(screen.getByText("Set on this machine")).toBeInTheDocument();
  });

  it("with the note off, the note moves into the tooltip", () => {
    const { container } = render(<VerifyBadge mark={mark("in-progress", { note: "Rechecking" })} note={false} />);
    expect(screen.queryByText("Rechecking")).toBeNull();
    expect(container.firstChild.getAttribute("title")).toContain("Rechecking");
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });
});

describe("VerifyMark (an app's own mark)", () => {
  const shelf = (demos) => vi.fn(async () => ({ ok: true, json: async () => ({ demos }) }));

  it("finds its own entry in /api/shelf and shows the badge without the note", async () => {
    const f = shelf([{ id: "other", verification: mark("in-progress") }, { id: "me", verification: mark("verified", { note: "Ran it" }) }]);
    vi.stubGlobal("fetch", f);
    render(<VerifyMark id="me" />);
    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(screen.queryByText("Ran it")).toBeNull();
    expect(f.mock.calls[0][0]).toBe("/api/shelf");
    expect(f.mock.calls[0][1].credentials).toBe("omit");
  });

  it("sends the same extra request headers as ShelfLink: an object, a function evaluated when the request fires, and a traceparent", async () => {
    const f = shelf([{ id: "me", verification: mark("verified") }]);
    vi.stubGlobal("fetch", f);
    let n = 0;
    const { unmount } = render(<VerifyMark id="me" headers={() => ({ "X-Workspace-Id": `ws-${++n}` })} traceparent={() => "00-abc-def-01"} />);
    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(f.mock.calls[0][1].headers).toEqual({ Accept: "application/json", "X-Workspace-Id": "ws-1", traceparent: "00-abc-def-01" });
    unmount();
    const g = shelf([{ id: "me", verification: mark("verified") }]);
    vi.stubGlobal("fetch", g);
    render(<VerifyMark id="me" headers={{ "X-Workspace-Id": "ws-fixed" }} />);
    await screen.findByText("Verified");
    expect(g.mock.calls[0][1].headers).toEqual({ Accept: "application/json", "X-Workspace-Id": "ws-fixed" });
  });

  it("renders nothing for an app with no mark, an unknown id, an unreachable shelf and a bad reply", async () => {
    for (const f of [shelf([{ id: "me", verification: null }]), shelf([{ id: "x", verification: mark("verified") }]), vi.fn(async () => { throw new Error("down"); }), vi.fn(async () => ({ ok: false, json: async () => ({}) })), vi.fn(async () => ({ ok: true, json: async () => ({}) }))]) {
      vi.stubGlobal("fetch", f);
      const { container, unmount } = render(<VerifyMark id="me" />);
      await waitFor(() => expect(f).toHaveBeenCalled());
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
