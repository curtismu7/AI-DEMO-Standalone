// Rail: the family's one collapsible sidebar (owner, 2026-11-13). Wraps a lab's sidebar content in
// aside.rail with a collapse toggle pinned to its edge. Collapsed, it becomes a slim handle strip;
// the state persists in localStorage. Content is whatever the lab passes — the chrome is shared, so
// features like hide/show, pinning or width-drag land once here and every lab gets them.
// Shared service: vendor it, never edit a lab's copy.
import { useEffect, useState } from "react";
import "./rail.css";

const read = (key) => {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
};
const write = (key, v) => {
  try { v ? localStorage.setItem(key, "1") : localStorage.removeItem(key); } catch { /* storage blocked */ }
};

export default function Rail({ children, storageKey = "rail-collapsed", label = "Sidebar", side = "left" }) {
  const [collapsed, setCollapsed] = useState(() => read(storageKey));
  useEffect(() => { write(storageKey, collapsed); }, [storageKey, collapsed]);
  return (
    <div className={`rail-wrap rail-wrap--${side}${collapsed ? " rail-wrap--collapsed" : ""}`} data-testid="rail">
      <aside className="rail" aria-label={label} aria-hidden={collapsed || undefined}>
        {children}
      </aside>
      <button
        type="button"
        className="rail__toggle"
        onClick={() => setCollapsed((v) => !v)}
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
