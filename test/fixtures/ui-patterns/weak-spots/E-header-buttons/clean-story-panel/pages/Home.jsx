import StoryPanel from "../components/StoryPanel";

export default function Home() {
  return (
    <main className="page-frame">
      <h1>Home</h1>
      <StoryPanel />
      <button type="button" className="primary">Run</button>
    </main>
  );
}
