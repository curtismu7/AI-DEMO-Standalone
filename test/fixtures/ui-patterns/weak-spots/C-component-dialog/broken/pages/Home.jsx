import Confirm from "../components/Confirm";

// Two primaries inside the one dialog state.
export default function Home({ open = false }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className="primary">Save</button>
      {open && (
        <div role="dialog" aria-label="Confirm reset">
          <Confirm onYes={() => {}} />
        </div>
      )}
    </main>
  );
}
