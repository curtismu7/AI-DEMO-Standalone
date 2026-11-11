import LiveForm, { MockPanel as Mock } from "../components/LiveForm";

// Both components render together: two primaries, one in each imported file.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Mock />
      <LiveForm onRun={() => {}} />
    </main>
  );
}
