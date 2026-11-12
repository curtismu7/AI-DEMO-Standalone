# top-menu

The standardized right side of the shell bar for every -LAB app, owner-approved
2026-11-11 (mock: `shared/top-menu-mock.html`).

Layout: three right-aligned control rows (brand + nav stay on the top line at the
left). **Sign in stands alone** — absolutely centered on the top line; the app's
`shell-bar` must set `position: relative` for the slot to position against it.

Row 1: 1. `mode` — Mock/Real dropdown, accent-filled so it stands out, wired to `/api/mode`
        2. `vertical` — industry selector, where the lab has verticals
        3. `present` — presenter toggle, where the lab has one
Row 2: 4. `talkTrack` — talk-track/script toggle (kept separate from Present; render
            only where a script exists)
        5. `shelfUrl` — Shelf link back to the launcher (or pass an existing `<ShelfLink/>` as `children`)
        6. `help` — link to the lab's documentation
        7. `version` — About/version button (from the lab's VERSION file)
        8. `onReset` — Reset button
Row 3: 9. `theme` — Light / Dark / Auto dropdown
       10. `fontSize` — S / M / L dropdown + A−/A+ steppers (root font via `--fs`)
Plus:  `showSignIn` + `signedIn` — Sign in (the bar's one primary), shown only when Real
            mode is active and the lab needs auth; shows "Signed in as …" + Sign out when in
       `extra` / `children` — lab-specific controls, same chrome

## Vendor into an app

```sh
mkdir -p web/src/top-menu
cp "$META/shared/top-menu/TopMenu.jsx" "$META/shared/top-menu/top-menu.css" web/src/top-menu/
(cd web/src/top-menu && shasum -a 256 TopMenu.jsx top-menu.css > top-menu.sha256)
```

Import `top-menu.css` once (e.g. in `main.jsx`). Controlled component: theme and
fontSize state live in the app. `applyFontSize(step)` sets the root `--fs`; add
`html { font-size: var(--fs, 16px); }` in the app stylesheet to make it take effect.

Check the vendored copies: `scripts/check-top-menu.sh` in the meta repo.
