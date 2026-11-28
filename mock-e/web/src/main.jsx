import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./standalone-ui.css";
import "./layout.css";
import "./app.css";

createRoot(document.getElementById("root")).render(<App />);
