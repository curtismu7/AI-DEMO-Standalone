export default function Trace({ rows }) {
  return (
    <section>
      <h2>Trace</h2>
      {rows.length ? (
        <>
          <h3>Rows</h3>
        </>
      ) : (
        <>
          <h3>No rows</h3>
          <h4>Why</h4>
        </>
      )}
    </section>
  );
}
