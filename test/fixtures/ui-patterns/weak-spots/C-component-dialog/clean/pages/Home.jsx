import Confirm from "../components/Confirm";

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
