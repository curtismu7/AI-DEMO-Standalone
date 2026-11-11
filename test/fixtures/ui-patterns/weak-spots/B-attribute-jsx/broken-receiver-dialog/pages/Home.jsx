import Sheet from "../components/Sheet";

// Two primaries inside the one dialog: the footer prop and the child.
export default function Home({ open = false }) {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className="primary">Save</button>
      {open && (
        <Sheet footer={<button type="button" className="primary">Confirm</button>}>
          <button type="button" className="primary">Keep</button>
        </Sheet>
      )}
    </main>
  );
}
