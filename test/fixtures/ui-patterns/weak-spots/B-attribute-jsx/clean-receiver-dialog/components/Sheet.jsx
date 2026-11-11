export default function Sheet({ footer, children }) {
  return (
    <div role="dialog" aria-label="Sheet">
      {children}
      <div>{footer}</div>
    </div>
  );
}
