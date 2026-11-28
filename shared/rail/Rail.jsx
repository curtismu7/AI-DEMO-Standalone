// Rail: the family's one collapsible sidebar (owner, 2026-11-13). Wraps a lab's sidebar content in
// aside.rail with a collapse toggle pinned to its edge. Collapsed, it becomes a slim handle strip;
// the state persists in localStorage. Content is whatever the lab passes — the chrome is shared, so
// features like hide/show, pinning or width-drag land once here and every lab gets them.
// Shared service: vendor it, never edit a lab's copy.
import { useState } from "react";
import "./rail.css";

// Tri-state: "1" collapsed, "0" expanded, absent = the lab's default. Only a click writes it, so the first visit shows the default and an explicit choice always wins.
const read = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v === "1" ? true : v === "0" ? false : fallback; } catch { return fallback; }
};
const write = (key, v) => {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* storage blocked */ }
};

export default function Rail({ children, storageKey = "rail-collapsed", label = "Sidebar", side = "left", defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(() => read(storageKey, defaultCollapsed));
  const toggle = () => setCollapsed((v) => { write(storageKey, !v); return !v; });
  return (
    <div className={`rail-wrap rail-wrap--${side}${collapsed ? " rail-wrap--collapsed" : ""}`} data-testid="rail">
      <aside className="rail" aria-label={label} aria-hidden={collapsed || undefined}>
        {children}
      </aside>
      <button
        type="button"
        className="rail__toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={undefined}
        title={collapsed ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
        data-testid="rail-toggle"
      >
        {collapsed ? "»" : "«"}
      </button>
    </div>
  );
}
