'use client';
import { getInitials } from '@/lib/data/utils';

function Avatar({ name, size = 44, dot = false, ring = false, fontSize }) {
  const fs = fontSize || Math.round(size * 0.36);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
        color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: fs, boxShadow: ring ? '0 0 0 2px #fff, var(--elevation-1)' : 'none',
      }}>{getInitials(name)}</div>
      {dot && <div style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 0 2px #fff' }} />}
    </div>
  );
}

export default Avatar;
