import { useMode, setMode } from "../mode";

export default function ModeToggle() {
  const mode = useMode();
  return (
    <div className="mode-toggle" role="group" aria-label="Mode">
      <button type="button" aria-pressed={mode === "mock"} onClick={() => setMode("mock")}>Mock</button>
      <button type="button" aria-pressed={mode === "real"} onClick={() => setMode("real")}>Real</button>
    </div>
  );
}
