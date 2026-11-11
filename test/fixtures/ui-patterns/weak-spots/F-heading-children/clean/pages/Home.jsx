import Section from "../components/Section";

export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <Section title="Overview">
        <h3>Details</h3>
      </Section>
      <Section title="More" />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
