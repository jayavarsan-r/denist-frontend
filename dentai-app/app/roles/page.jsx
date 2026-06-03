'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { PrimaryButton } from '@/components/ui';
import { lookupClinic, joinClinic } from '@/lib/services/auth.service';
import { getMe as getAuthMe } from '@/lib/services/auth.service';

function BrandMark({ size = 56 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)',
    }}>
      <Icon name="tooth" size={size * 0.56} color="var(--accent-ink)" stroke={1.7} />
    </div>
  );
}

export default function RolesPage() {
  const router = useRouter();
  const hydrateAuth = useAppStore((s) => s.hydrateAuth);
  const showToast = useAppStore((s) => s.showToast);

  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [joinCode, setJoinCode] = useState('');
  const [joinRole, setJoinRole] = useState('receptionist');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clinicPreview, setClinicPreview] = useState(null);

  const handleLookup = async () => {
    if (joinCode.trim().length < 3) { setError('Enter the clinic join code'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await lookupClinic(joinCode.trim().toUpperCase());
      setClinicPreview(res.clinic || res);
    } catch (e) {
      setError(e?.response?.data?.message || 'Clinic not found. Check the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    setError('');
    try {
      await joinClinic(joinCode.trim().toUpperCase(), joinRole);
      const me = await getAuthMe();
      hydrateAuth({ staff: me.staff, clinic: me.clinic });
      if (joinRole === 'receptionist') {
        router.replace('/reception');
      } else {
        router.replace('/');
      }
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to join clinic.');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'join') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', padding: '0 28px' }}>
        <div style={{ paddingTop: 72, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => { setMode(null); setClinicPreview(null); setError(''); }}
            style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(60,60,67,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="chevLeft" size={20} color="var(--text-secondary)" />
          </button>
        </div>
        <div style={{ marginTop: 22, marginBottom: 36 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 8px' }}>Join a clinic</h1>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>Enter the 6-digit join code from your clinic admin.</p>
        </div>

        <div className="card" style={{ padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Icon name="layers" size={18} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="e.g. MDC-204"
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); setClinicPreview(null); }}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 700, letterSpacing: '0.08em' }}
            autoFocus
          />
        </div>

        {error && <p style={{ fontSize: 13, color: 'var(--red)', margin: '0 0 10px 4px' }}>{error}</p>}

        {!clinicPreview && (
          <PrimaryButton onClick={handleLookup} style={{ marginTop: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Looking up…' : 'Find clinic'}
          </PrimaryButton>
        )}

        {clinicPreview && (
          <>
            <div className="card" style={{ padding: 18, marginBottom: 18 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{clinicPreview.name}</div>
              <div className="t-meta">{clinicPreview.city}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Your role</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ id: 'doctor', label: 'Doctor' }, { id: 'receptionist', label: 'Receptionist' }].map(r => (
                  <button key={r.id} onClick={() => setJoinRole(r.id)} className="tap"
                    style={{ flex: 1, height: 46, borderRadius: 12, fontSize: 15, fontWeight: 600,
                      background: joinRole === r.id ? 'var(--accent)' : 'transparent',
                      color: joinRole === r.id ? 'var(--accent-ink)' : 'var(--text-secondary)',
                      border: joinRole === r.id ? 'none' : '1px solid var(--border)' }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <PrimaryButton onClick={handleJoin} style={{ opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Joining…' : 'Join clinic'}
            </PrimaryButton>
          </>
        )}
      </div>
    );
  }

  // Default: choice screen
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', padding: '0 28px' }}>
      <div style={{ paddingTop: 72, marginBottom: 8 }}>
        <BrandMark size={56} />
      </div>
      <div style={{ marginTop: 22, marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 8px' }}>Set up your clinic</h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>Create a new clinic or join one with an invite code.</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { id: 'create', icon: 'stethoscope', title: 'Create a new clinic', sub: 'I\'m setting up DentWay for my practice' },
          { id: 'join', icon: 'userCheck', title: 'Join existing clinic', sub: 'I have a join code from my clinic admin' },
        ].map((r, i) => (
          <button key={r.id} onClick={() => r.id === 'create' ? router.push('/doctor/setup') : setMode('join')}
            className="card tap" style={{ width: '100%', padding: 20, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', animation: `cascadeIn .4s ease ${i * 0.08}s both` }}>
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
    </div>
  );
}
