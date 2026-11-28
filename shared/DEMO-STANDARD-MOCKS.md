# Demo-standard mocks — 2026-11-27

Three self-contained HTML mocks defining the standard look and interaction for agent-driven
demos in the -LAB family. Open any of them in a browser — no build step, all data is static
sample data; the behaviour shown is the standard.

They extend `STANDALONE-UI-PATTERNS.md` + `ui-standard-mock.html` (layout/components) and
`ui-standard-proposal-mock.html` (P12 header order, P13 empty state, P14 claim banner) with
the **demo interaction standard**:

- **Agent-driven:** you type a prompt, the run executes hop by hop, the sequence diagram
  updates **live** (new arrow per hop, active arrow/boxes highlighted, pending hops faint).
- **Everything is clickable:** any sequence box, arrow label or movie-reel frame opens the
  step detail — the actual request (method, URL, headers, body) and response, plus the
  policy decision, gateway stages and the governing spec.
- **Honest states:** status is always a word + colour (chip); a human gate holds the run
  (`held` chip, dashed amber arrow) and the verdict (approve/deny) is recorded as a hop.

| Mock | Tier | Demonstrates |
|---|---|---|
| `demo-standard-mock-a.html` | Agent + gateway (Demo tier) | Prompt → gateway → Authorize → narrowed token → API. Live sequence, movie reel, step detail with request/response, decision, stages, spec. |
| `demo-standard-mock-b.html` | Policy decision (Tester tier) | Inspector layout (scenario tree + run + call detail). PERMIT / PERMIT-with-obligation / DENY scenarios; per-hop call detail. |
| `demo-standard-mock-c.html` | Human-in-the-loop | Consent gate: run pauses (`held`), phone mock shows what the human sees, approve/deny continues or ends the run; single-use receipt called out. |

Shared structure across all three (this is the consistency contract):

1. Shell bar with the P12 right-cluster order, simulation banner, numbered story sections.
2. One primary button per state (Send / Approve); everything else secondary.
3. Evidence area: live sequence (lifelines + arrows) → movie reel (frames) → step detail.
4. Detail panes show the actual call: `POST /path`, real headers, real JSON body, status.
5. Verdict section in words at the end ("what the run proved"), never colour alone.

New agent-driven labs should copy one of these mocks as their starting page and swap the
static `HOPS` array for their engine's real hops (`demo-hop/1` fields where possible).
Verification screenshots: `docs/ui-audit-2026-11-27/mock-{a,b,c}-*.png`.
