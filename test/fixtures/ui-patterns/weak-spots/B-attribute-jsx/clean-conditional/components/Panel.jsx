export default function Panel({ title, actions }) {
  return (
    <section>
      <h2>{title}</h2>
      {actions}
    </section>
  );
}
