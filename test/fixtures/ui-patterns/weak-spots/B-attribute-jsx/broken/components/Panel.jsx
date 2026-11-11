export default function Panel({ title, action }) {
  return (
    <section>
      <h2>{title}</h2>
      {action ? action(() => {}) : null}
    </section>
  );
}
