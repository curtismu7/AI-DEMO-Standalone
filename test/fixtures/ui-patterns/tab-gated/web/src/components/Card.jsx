export default function Card({ primaryRetry = false }) {
  return (
    <section className="pcard" aria-label="Gateway check">
      <h3>Gateway check</h3>
      {primaryRetry ? (
        <button type="button" className="primary">Run the gateway check</button>
      ) : (
        <button type="button">Run the gateway check</button>
      )}
    </section>
  );
}
