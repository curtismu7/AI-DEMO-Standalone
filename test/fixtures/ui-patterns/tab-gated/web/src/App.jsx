import { useState } from "react";
import Card from "./components/Card";
import Identities from "./pages/Identities";
import Verify from "./pages/Verify";
import Issuers from "./pages/Issuers";

// Tabs that draw their own primary action. The card's button is primary only on the other tabs.
const OWN_PRIMARY_TABS = ["identities", "verify"];

export default function App() {
  const [tab, setTab] = useState("identities");
  return (
    <div className="app">
      <header className="shell-bar">
        <span className="shell-bar__title">Tab gated fixture</span>
        <nav>
          <a href="#identities" aria-current={tab === "identities" ? "page" : undefined} onClick={() => setTab("identities")}>Identities</a>
          <a href="#verify" aria-current={tab === "verify" ? "page" : undefined} onClick={() => setTab("verify")}>Verify</a>
          <a href="#issuers" aria-current={tab === "issuers" ? "page" : undefined} onClick={() => setTab("issuers")}>Issuers</a>
        </nav>
      </header>
      <main className="page">
        {OWN_PRIMARY_TABS.includes(tab) ? <Card /> : <Card primaryRetry />}
        {tab === "identities" && <Identities />}
        {tab === "verify" && <Verify />}
        {tab === "issuers" && <Issuers />}
      </main>
    </div>
  );
}
