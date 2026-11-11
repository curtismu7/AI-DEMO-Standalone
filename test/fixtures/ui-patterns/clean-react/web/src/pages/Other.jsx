import Gate from "../components/Gate";

export default function Other() {
  return (
    <Gate>
      <main className="page-frame">
        <h1>Other</h1>
        <ul>{["x", "y"].map((n) => <li key={n}>{n}</li>)}</ul>
        <button type="button" className="primary">Go</button>
      </main>
    </Gate>
  );
}
