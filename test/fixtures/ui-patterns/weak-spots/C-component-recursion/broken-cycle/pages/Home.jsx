// Ping and Pong render each other and nothing else renders them; the checker still reaches them (Ping's primary counts).
function Ping() {
  return (
    <div>
      <button type="button" className="primary">Ping</button>
      <Pong />
    </div>
  );
}
function Pong() {
  return <Ping />;
}

export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <button type="button" className="primary">Run</button>
    </main>
  );
}
