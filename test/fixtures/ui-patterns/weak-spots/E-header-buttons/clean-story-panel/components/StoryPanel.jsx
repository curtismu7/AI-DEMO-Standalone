export default function StoryPanel({ open = true, onToggle }) {
  return (
    <aside className="story" aria-label="Talk track">
      <header className="story__head">
        <h2>Talk track</h2>
        <button type="button" aria-expanded={open} onClick={onToggle}>Hide talk track</button>
      </header>
      <ol>
        <li><button type="button" aria-pressed={true}>Step one</button></li>
        <li><button type="button" aria-pressed={false}>Step two</button></li>
      </ol>
    </aside>
  );
}
