'use client';

/* dark primary button */
function PrimaryButton({ children, onClick, style, full = true, height = 52 }) {
  return (
    <button onClick={onClick} className="btn-dark" style={{ width: full ? '100%' : 'auto', height, padding: full ? 0 : '0 22px', ...style }}>{children}</button>
  );
}

export default PrimaryButton;
