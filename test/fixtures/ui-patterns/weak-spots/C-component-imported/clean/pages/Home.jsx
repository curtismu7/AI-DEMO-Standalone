import LiveForm, { MockPanel as Mock } from "../components/LiveForm";

export default function Home({ mode = "live" }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      {mode === "mock" ? (
        <>
          <Mock />
        </>
      ) : (
        <>
          <LiveForm onRun={() => {}} />
        </>
      )}
    </main>
  );
}
