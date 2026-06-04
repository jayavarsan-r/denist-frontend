'use client';
import Icon from '@/components/icons';

/* bottom nav */
function BottomNav({ tab, onTab, items }) {
  const navItems = items || [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'patients', icon: 'person', label: 'Patients' },
    { id: 'schedule', icon: 'calendar', label: 'Schedule' },
    { id: 'finance', icon: 'chart', label: 'Finance' },
  ];
  return (
    <div style={{ flexShrink: 0, padding: '6px 20px 16px', background: 'var(--bg)' }}>
      <div style={{
        background: '#E8E8ED',
        borderRadius: 99,
        boxShadow: '0 2px 12px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04)',
        display: 'flex',
        padding: '6px 4px',
      }}>
        {navItems.map(it => {
          const active = tab === it.id;
          return (
            <button key={it.id} onClick={() => onTab(it.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              padding: '6px 8px',
              borderRadius: 99,
              background: active ? 'rgba(255,255,255,0.95)' : 'transparent',
              boxShadow: active ? '0 1px 6px rgba(0,0,0,0.10)' : 'none',
              transition: 'background .18s ease, box-shadow .18s ease',
              outline: 'none',
              margin: '0 2px',
            }}>
              <Icon name={it.icon} size={24} stroke={active ? 2.3 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.01em' }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default BottomNav;
