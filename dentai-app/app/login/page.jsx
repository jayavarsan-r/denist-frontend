'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { PrimaryButton } from '@/components/ui';
import { sendOtp, verifyOtp, getMe } from '@/lib/services/auth.service';
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
  const phoneRef = React.useRef(null);

  // If already logged in, redirect to home
  useEffect(() => {
    if (getToken()) {
      router.replace('/');
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
        router.replace('/doctor/setup');
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

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
