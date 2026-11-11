import Confirm from "../components/Confirm";

// Not in a dialog: the imported primary and the page primary share one view state.
export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className="primary">Save</button>
      <Confirm onYes={() => {}} />
    </main>
  );
}
