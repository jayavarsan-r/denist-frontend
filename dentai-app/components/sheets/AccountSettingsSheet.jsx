'use client';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { SheetHeader, Chip } from '@/components/ui';

export default function AccountSettingsSheet({ onClose }) {
  const name     = useAppStore((s) => s.name);
  const role     = useAppStore((s) => s.role);
  const clinic   = useAppStore((s) => s.clinic);
  const switchRole = useAppStore((s) => s.switchRole);
  const signOut  = useAppStore((s) => s.signOut);

  const clinicName = clinic?.clinicName || '';
  const city = clinic?.city || '';
  const joinCode = clinic?.joinCode || '';

  const handleCopyCode = () => {
    if (joinCode && typeof navigator !== 'undefined') {
      navigator.clipboard?.writeText(joinCode).catch(() => {});
    }
  };

  const rows = ['Clinic name', 'Clinic address', 'Working hours', 'Staff accounts', 'Procedures library'];

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={name || 'Account'} onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -6, marginBottom: 16 }}>
        <Chip label={role === 'receptionist' ? 'Receptionist' : 'Doctor'} tone="dark" size="lg" />
        {clinicName && <span className="t-meta">{clinicName}{city ? ' · ' + city : ''}</span>}
      </div>

      {joinCode ? (
        <button onClick={handleCopyCode} className="card" style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '14px 16px', marginBottom: 16, gap: 12, textAlign: 'left' }}>
          <Icon name="share" size={20} color="var(--blue)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 2 }}>Clinic join code</div>
            <div className="tnum" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent)' }}>{joinCode}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Tap to copy · Share with staff</div>
          </div>
        </button>
      ) : null}

      <button onClick={() => { onClose(); switchRole(); }} className="card rowtap" style={{ width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', marginBottom: 16, textAlign: 'left' }}>
        <Icon name="swap" size={20} color="var(--blue)" />
        <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 600 }}>Switch role</div><div className="t-meta">Try the {role === 'receptionist' ? 'doctor' : 'receptionist'} view</div></div>
        <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
      </button>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        {rows.map((r, i) => (
          <button key={r} className="rowtap" style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', padding: '0 16px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
            <span style={{ flex: 1, fontSize: 16 }}>{r}</span><Icon name="chevRight" size={16} color="var(--text-tertiary)" />
          </button>
        ))}
      </div>
      <button onClick={() => { onClose(); signOut(); }} className="card rowtap" style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--red)', fontSize: 16, fontWeight: 500 }}>
        <Icon name="logout" size={18} color="var(--red)" />Sign out
      </button>
    </div>
  );
}
