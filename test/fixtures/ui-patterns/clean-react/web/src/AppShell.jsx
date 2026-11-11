import ModeBanner from "./components/ModeBanner";
import ModeToggle from "./components/ModeToggle";

export default function AppShell({ children }) {
  return (
    <div className="app">
      <header className="shell-bar">
        <span className="shell-bar__title">React fixture lab</span>
        <ModeToggle />
      </header>
      <ModeBanner />
      <div id="main">{children}</div>
    </div>
  );
}
