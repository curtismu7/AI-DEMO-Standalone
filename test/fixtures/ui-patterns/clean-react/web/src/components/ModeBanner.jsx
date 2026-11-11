import { useMode } from "../mode";

export default function ModeBanner() {
  const mode = useMode();
  return <p className="banner" role="note" data-state={mode}>{mode === "real" ? "Real: calls go to your tenant." : "Simulated: nothing leaves this machine."}</p>;
}
