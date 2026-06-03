'use client';

export default function Segmented({ options, value, onChange, style }) {
  return (
    <div style={{
      display: 'flex', background: '#fff', border: '1px solid var(--border)',
      borderRadius: 9, padding: 2, height: 34, ...style,
    }}>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            flex: 1, borderRadius: 7, fontSize: 13, fontWeight: 600,
            background: active ? 'var(--accent)' : 'transparent',
            color: active ? 'var(--accent-ink)' : 'var(--text-secondary)',
            transition: 'all .15s ease',
          }}>{label}</button>
        );
      })}
    </div>
  );
}
