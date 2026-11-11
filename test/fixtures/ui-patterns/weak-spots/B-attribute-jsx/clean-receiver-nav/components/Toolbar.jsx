export default function Toolbar({ actions, children }) {
  return (
    <div>
      <nav aria-label="Tools">{actions}</nav>
      {children}
    </div>
  );
}
