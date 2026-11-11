import { createRoot } from "react-dom/client";
import AppShell from "./AppShell";
import Home from "./pages/Home";
import Other from "./pages/Other";
import "./standalone-ui.css";
import "./app.css";

const ROUTES = {
  "home": Home,
  "other": Other,
};

const Page = ROUTES[window.location.hash.slice(1)] || Home;

createRoot(document.getElementById("root")).render(
  <AppShell><Page /></AppShell>,
);
