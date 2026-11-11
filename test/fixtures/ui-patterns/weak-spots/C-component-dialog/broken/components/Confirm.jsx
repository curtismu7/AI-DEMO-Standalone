export default function Confirm({ onYes }) {
  return (
    <div>
      <button type="button" className="primary" onClick={onYes}>Yes, reset</button>
      <button type="button" className="primary">Keep</button>
    </div>
  );
}
