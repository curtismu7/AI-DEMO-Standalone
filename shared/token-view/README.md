# token-view: vanilla JWT decoding for static HTML pages (Rule 24b, phase 5)

For pages with no React (Learning Hub HTML, SE guides, mock pages). Same pure decoder as the shared
JsonPane; same caps (6 tokens, no secrets, no refresh tokens); decode only, never verification.

## Use

```html
<script type="module">
  import { decorateTokens, TOKEN_VIEW_CSS } from "../shared/token-view/token-decode.mjs";
  const style = document.createElement("style");
  style.textContent = TOKEN_VIEW_CSS;
  document.head.appendChild(style);
  decorateTokens(document.body);
</script>
```

- `decorateTokens(root)` walks text nodes for whole JWTs (`eyJ…`), plus any `<pre data-jwt>` / `.jwt`
  element, and inserts a decoded card after each: Header, Payload, Signature, `textContent` only.
- `decodeJwt(raw)` → `{ raw, header, claims, signature }` or null; `decodeSegment(seg)` for one part.
- The original text is never modified — the card is added after the element, so copies keep exact bytes.
- Pins: copy this folder byte-for-byte with `token-decode.sha256` (regenerate after any change).

Found during the sweep: no current family page needs this (all token display is React); the helper
exists so a future static page cannot become a new raw-token screen.
