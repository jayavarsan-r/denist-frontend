'use client';

/* pill toggle for clinical flags */
function PillToggle({ label, active, onClick }) {
  return (
    <button onClick={onClick} className="tap" style={{
      height: 36, padding: '0 14px', borderRadius: 12, fontSize: 14, fontWeight: 500,
      background: active ? 'rgba(255,59,48,0.10)' : '#fff',
      color: active ? 'var(--red)' : 'var(--text-primary)',
      border: active ? '1px solid rgba(255,59,48,0.5)' : '1px solid var(--border)',
    }}>{label}</button>
  );
}

export default PillToggle;
