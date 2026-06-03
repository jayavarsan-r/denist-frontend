'use client';
import Icon from '@/components/icons';

export default function EmptyState({ icon = 'calendar', title, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: 6 }}>
      <div style={{ color: 'var(--text-tertiary)', marginBottom: 6 }}><Icon name={icon} size={46} stroke={1.6} /></div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
      {hint && <div className="t-meta">{hint}</div>}
    </div>
  );
}
