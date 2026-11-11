function Tree({ node }) {
  return (
    <ul>
      <li>{node.name}{node.kids ? node.kids.map((k) => <Tree key={k.name} node={k} />) : null}</li>
      <button type="button" className="primary">Add</button>
    </ul>
  );
}

export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Tree node={{ name: "root" }} />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
