import { useState } from "react";

export function useMode() {
  const [mode] = useState("mock");
  fetch("/api/mode");
  return mode;
}
export function setMode(mode) {
  return fetch("/api/mode", { method: "POST", body: JSON.stringify({ mode }) });
}
