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
    <div style={{
      flexShrink: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px) saturate(180%)',
      borderTop: '1px solid rgba(0,0,0,0.10)', display: 'flex', paddingBottom: 22, paddingTop: 8,
    }}>
      {navItems.map(it => {
        const active = tab === it.id;
        return (
          <button key={it.id} onClick={() => onTab(it.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}>
            <Icon name={it.icon} size={26} stroke={active ? 2.2 : 1.9} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 600 : 500, letterSpacing: '0.01em' }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default BottomNav;
