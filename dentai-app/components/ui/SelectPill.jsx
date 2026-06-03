'use client';

export default function SelectPill({ label, active, onClick, accentDark = true }) {
  return (
    <button onClick={onClick} className="tap" style={{
      height: 34, padding: '0 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
      background: active ? (accentDark ? 'var(--accent)' : 'rgba(0,122,255,0.1)') : '#fff',
      color: active ? (accentDark ? 'var(--accent-ink)' : 'var(--blue)') : 'var(--text-secondary)',
      border: active ? 'none' : '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );
}
