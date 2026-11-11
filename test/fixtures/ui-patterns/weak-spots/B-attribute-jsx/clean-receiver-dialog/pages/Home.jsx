import Sheet from "../components/Sheet";

// Sheet renders `footer` inside its dialog: the Confirm primary is the dialog's own state, not a second page primary.
export default function Home({ open = false }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className="primary">Save</button>
      {open && (
        <Sheet footer={<button type="button" className="primary">Confirm</button>}>
          <p>Sure?</p>
        </Sheet>
      )}
    </main>
  );
}
