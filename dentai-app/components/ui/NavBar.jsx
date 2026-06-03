'use client';
import Icon from '@/components/icons';

export default function NavBar({ title, onBack, right }) {
  return (
    <div style={{
      flexShrink: 0, paddingTop: 56, paddingBottom: 10, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-light)',
      display: 'flex', alignItems: 'center', padding: '56px 12px 10px',
    }}>
      <button onClick={onBack} style={{ width: 40, height: 32, display: 'flex', alignItems: 'center', color: 'var(--blue)' }}><Icon name="chevLeft" size={26} /></button>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 600 }}>{title}</div>
      <div style={{ width: 40, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
}
