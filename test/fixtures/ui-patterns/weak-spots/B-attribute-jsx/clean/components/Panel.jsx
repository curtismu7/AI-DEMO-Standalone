export default function Panel({ title, action, render, actions }) {
  return (
    <section>
      <h2>{title}</h2>
      {action ? action(() => {}) : null}
      {render ? render() : null}
      {actions}
    </section>
  );
}
