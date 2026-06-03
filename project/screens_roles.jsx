/* DentAI — role selection (after onboarding) */

function RoleSelect({ onPick }) {
  const roles = [
    { id: 'doctor', icon: 'stethoscope', title: 'Doctor', sub: 'Consult patients, record diagnoses, plan treatment', name: 'Dr. Arjun Mehta' },
    { id: 'receptionist', icon: 'userCheck', title: 'Receptionist', sub: 'Check in patients, manage the queue, handle checkout', name: 'Lakshmi Iyer' },
  ];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', padding: '0 28px' }}>
      <div style={{ paddingTop: 72, marginBottom: 8 }}>
        <BrandMark size={56} />
      </div>
      <div style={{ marginTop: 22, marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 8px' }}>Who's using DentAI?</h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>Pick your role. You can switch any time from your account.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {roles.map((r, i) => (
          <button key={r.id} onClick={() => onPick(r.id)} className="card tap" style={{ width: '100%', padding: 20, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', animation: `cascadeIn .4s ease ${i * 0.08}s both` }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={r.icon} size={28} stroke={1.9} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{r.title}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: 2 }}>{r.sub}</div>
            </div>
            <Icon name="chevRight" size={20} color="var(--text-tertiary)" />
          </button>
        ))}
      </div>
      <div style={{ marginTop: 'auto', paddingBottom: 36, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: 'var(--text-tertiary)' }}>
        <Icon name="layers" size={15} />
        <span style={{ fontSize: 13 }}>{DATA.CLINIC.name} · {DATA.CLINIC.city}</span>
      </div>
    </div>
  );
}

Object.assign(window, { RoleSelect });
