# shelf-link-server: where this lab's shelf card lives

`shelfInfo(env)` → `{ shelfUrl }` (null = no shelf, hide the button). Prefers `SHELF_URL`; defaults to the family
lab-proxy shelf root. Vendor to `server/src/shelfLink.js` beside the existing web `ShelfLink.jsx`.
