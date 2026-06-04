'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { PrimaryButton } from '@/components/ui';
import { sendOtp, verifyOtp, getMe, lookupClinic, joinClinic } from '@/lib/services/auth.service';
import { getToken } from '@/lib/api/client';

function BrandMark({ size = 72 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)',
    }}>
      <Icon name="tooth" size={size * 0.56} color="var(--accent-ink)" stroke={1.7} />
    </div>
  );
}

function OtpInput({ value, onChange, length = 6 }) {
  const inputRef = React.useRef(null);
  // Build a fixed-length array of chars — padEnd('') is broken, use Array.from instead
  const digits = Array.from({ length }, (_, i) => value[i] || '');
  const focused = value.length < length ? value.length : length - 1;

  return (
    <div
      style={{ position: 'relative', display: 'flex', gap: 10, justifyContent: 'center', cursor: 'text' }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Hidden real input captures keyboard */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        maxLength={length}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        style={{
          position: 'absolute', opacity: 0, width: 1, height: 1,
          top: 0, left: '50%', zIndex: 1, pointerEvents: 'none',
        }}
        autoFocus
      />
      {digits.map((d, i) => {
        const isActive = i === value.length && value.length < length;
        return (
          <div
            key={i}
            style={{
              width: 46, height: 58, borderRadius: 14,
              background: '#fff',
              border: isActive ? '2px solid #1C1C1E' : d ? '1.5px solid rgba(60,60,67,0.3)' : '1.5px solid rgba(60,60,67,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 700, color: '#1C1C1E',
              boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
              transition: 'border-color .15s ease',
              userSelect: 'none',
            }}
          >
            {d || (isActive
              ? <span style={{ width: 2, height: 28, background: '#1C1C1E', borderRadius: 1, animation: 'blink 1s ease-in-out infinite' }} />
              : null
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAppStore((s) => s.setAuth);
  const [phase, setPhase] = useState('phone'); // phone | otp | loading
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [selectedRole, setSelectedRole] = useState('doctor');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [clinicPreview, setClinicPreview] = useState(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const phoneRef = React.useRef(null);

  // Redirect: token → home, first visit → onboarding
  useEffect(() => {
    if (getToken()) { router.replace('/'); return; }
    if (typeof window !== 'undefined' && !localStorage.getItem('dentai_onboarded')) {
      router.replace('/onboarding');
    }
  }, []);

  const handleSendOtp = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) { setError('Enter a valid 10-digit mobile number'); return; }
    setSending(true);
    setError('');
    try {
      await sendOtp(cleaned);
      setPhase('otp');
    } catch (e) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to send OTP. Try again.');
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) { setError('Enter the 6-digit code'); return; }
    setVerifying(true);
    setError('');
    try {
      const res = await verifyOtp(phone.replace(/\D/g, ''), otp);
      // res: { token, dentist, staff, clinic }
      const meData = res.staff || {};
      const clinicData = res.clinic || {};
      setAuth({
        token: res.token,
        staffId: meData.id,
        role: meData.role || null,
        clinicId: clinicData.id || null,
        name: meData.name || res.dentist?.name || '',
        clinicName: clinicData.name || '',
        clinicCity: clinicData.city || '',
        joinCode: clinicData.join_code || '',
      });
      // Navigate based on whether clinic is set up
      if (!clinicData.id) {
        setPhase('role_select');
      } else if (meData.role === 'receptionist') {
        router.replace('/reception');
      } else {
        router.replace('/');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Invalid OTP. Try again.');
      setOtp('');
    } finally {
      setVerifying(false);
    }
  };

  const handlePhoneKey = (e) => {
    if (e.key === 'Enter') handleSendOtp();
  };
  const handleLookupClinic = async () => {
    if (joinCode.trim().length < 3) { setJoinError('Enter the clinic join code'); return; }
    setJoinLoading(true);
    setJoinError('');
    try {
      const res = await lookupClinic(joinCode.trim().toUpperCase());
      setClinicPreview(res.clinic || res);
    } catch (e) {
      setJoinError(e?.response?.data?.message || 'Clinic not found — check the code');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleJoinClinic = async () => {
    if (!clinicPreview) { setJoinError('Look up the clinic first'); return; }
    if (!joinName.trim()) { setJoinError('Enter your name'); return; }
    setJoinLoading(true);
    setJoinError('');
    try {
      const res = await joinClinic(joinCode.trim().toUpperCase(), selectedRole, joinName.trim());
      setAuth({
        token: res.token,
        staffId: res.staff?.id,
        role: res.staff?.role || selectedRole,
        clinicId: res.clinic?.id || null,
        name: res.staff?.name || joinName,
        clinicName: res.clinic?.name || '',
        clinicCity: res.clinic?.city || '',
        joinCode: res.clinic?.join_code || '',
      });
      router.replace(selectedRole === 'receptionist' ? '/reception' : '/');
    } catch (e) {
      setJoinError(e?.response?.data?.message || 'Failed to join. Try again.');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleOtpChange = (val) => {
    setOtp(val);
    setError('');
    if (val.length === 6) {
      // auto-submit when 6 digits entered
      setTimeout(() => {
        setOtp(val);
      }, 50);
    }
  };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', padding: '0 28px',
    }}>
      {/* Header */}
      <div style={{ paddingTop: 72, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
        {phase === 'otp' && (
          <button onClick={() => { setPhase('phone'); setOtp(''); setError(''); }}
            style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(60,60,67,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="chevLeft" size={20} color="var(--text-secondary)" />
          </button>
        )}
        {phase === 'phone' && <BrandMark size={56} />}
      </div>

      <div style={{ marginTop: 22, marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 8px', lineHeight: 1.15 }}>
          {phase === 'phone' ? 'Welcome to DentWay' : 'Verify your number'}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
          {phase === 'phone'
            ? 'Enter your mobile number to sign in or create an account.'
            : `We sent a 6-digit code to +91 ${phone.replace(/\D/g, '').slice(-10)}`}
        </p>
      </div>

      {phase === 'phone' && (
        <div>
          <div className="card" style={{
            padding: '0 16px', height: 58, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>+91</span>
            <div style={{ width: 1, height: 22, background: 'var(--border)', flexShrink: 0 }} />
            <input
              ref={phoneRef}
              type="tel"
              inputMode="numeric"
              placeholder="Mobile number"
              value={phone}
              onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
              onKeyDown={handlePhoneKey}
              autoFocus
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.04em',
              }}
            />
            {phone.length > 0 && (
              <button onClick={() => setPhone('')} style={{ display: 'flex', color: 'var(--text-tertiary)' }}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>
          {error && <p style={{ fontSize: 13, color: 'var(--red)', margin: '0 0 12px 4px' }}>{error}</p>}
          <div style={{ height: 20 }} />
          <PrimaryButton onClick={handleSendOtp} style={{ opacity: sending ? 0.6 : 1 }}>
            {sending ? 'Sending…' : 'Continue'}
          </PrimaryButton>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 18, lineHeight: 1.5 }}>
            By continuing you agree to our terms of service.
          </p>
        </div>
      )}

      {phase === 'otp' && (
        <div>
          <OtpInput value={otp} onChange={handleOtpChange} />
          {error && <p style={{ fontSize: 13, color: 'var(--red)', margin: '12px 0 0', textAlign: 'center' }}>{error}</p>}
          <div style={{ height: 28 }} />
          <PrimaryButton
            onClick={handleVerifyOtp}
            style={{ opacity: (otp.length < 6 || verifying) ? 0.5 : 1 }}
          >
            {verifying ? 'Verifying…' : 'Verify & sign in'}
          </PrimaryButton>
          <button
            onClick={handleSendOtp}
            style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 15, fontWeight: 600, color: 'var(--blue)', textAlign: 'center' }}
          >
            {sending ? 'Resending…' : 'Resend code'}
          </button>
        </div>
      )}

      {phase === 'role_select' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>What's your role?</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 6 }}>This sets up your workspace</div>
          </div>
          {[
            { role: 'doctor', icon: 'stethoscope', label: 'Doctor', sub: "I'm a dentist or specialist" },
            { role: 'receptionist', icon: 'userCheck', label: 'Receptionist', sub: 'I manage the front desk' },
          ].map(opt => (
            <button key={opt.role} onClick={() => {
              setSelectedRole(opt.role);
              setPhase(opt.role === 'doctor' ? 'clinic_choice' : 'join_new');
            }} className="card tap" style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '20px 16px', marginBottom: 12, textAlign: 'left', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={opt.icon} size={28} stroke={1.9} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{opt.label}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.sub}</div>
              </div>
              <Icon name="chevRight" size={20} color="var(--text-tertiary)" />
            </button>
          ))}
        </div>
      )}

      {phase === 'clinic_choice' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Your clinic</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 6 }}>Set up or join a clinic</div>
          </div>
          {[
            { label: 'Create a new clinic', sub: "I'll be the clinic admin", fn: () => router.replace('/doctor/setup') },
            { label: 'Join an existing clinic', sub: 'I have a join code', fn: () => setPhase('join_new') },
          ].map((opt, i) => (
            <button key={i} onClick={opt.fn} className="card tap" style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '18px 16px', marginBottom: 12, textAlign: 'left', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{opt.label}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.sub}</div>
              </div>
              <span style={{ fontSize: 18, color: 'var(--text-tertiary)' }}>›</span>
            </button>
          ))}
          <button onClick={() => setPhase('role_select')} style={{ width: '100%', textAlign: 'center', marginTop: 8, fontSize: 15, color: 'var(--blue)', fontWeight: 500 }}>← Back</button>
        </div>
      )}

      {phase === 'join_new' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Join a clinic</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 6 }}>Ask your clinic admin for the join code</div>
          </div>
          <label style={{ display: 'block', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Your name</div>
            <input value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Dr. / Your full name" style={{ width: '100%', border: 'none', borderBottom: '1.5px solid var(--border)', outline: 'none', background: 'transparent', fontSize: 20, fontWeight: 600, padding: '4px 0 8px', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          </label>
          <label style={{ display: 'block', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Clinic join code</div>
            <input value={joinCode} onChange={e => { setJoinCode(e.target.value.toUpperCase()); setClinicPreview(null); setJoinError(''); }} placeholder="e.g. DENT-MUM-423" style={{ width: '100%', border: 'none', borderBottom: '1.5px solid var(--border)', outline: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, padding: '4px 0 8px', color: 'var(--text-primary)', fontFamily: 'inherit', letterSpacing: '0.04em' }} />
          </label>
          {clinicPreview && (
            <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{clinicPreview.name}</div>
              {clinicPreview.city && <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{clinicPreview.city}</div>}
            </div>
          )}
          {joinError && <div style={{ color: 'var(--red)', fontSize: 14, marginBottom: 12 }}>{joinError}</div>}
          {!clinicPreview ? (
            <PrimaryButton onClick={handleLookupClinic} style={{ opacity: joinLoading ? 0.5 : 1 }}>
              {joinLoading ? 'Looking up…' : 'Find clinic'}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={handleJoinClinic} style={{ opacity: joinLoading ? 0.5 : 1 }}>
              {joinLoading ? 'Joining…' : `Join as ${selectedRole === 'doctor' ? 'Doctor' : 'Receptionist'}`}
            </PrimaryButton>
          )}
          <button onClick={() => { setPhase('role_select'); setClinicPreview(null); setJoinError(''); }} style={{ width: '100%', textAlign: 'center', marginTop: 12, fontSize: 15, color: 'var(--blue)', fontWeight: 500 }}>← Back</button>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
