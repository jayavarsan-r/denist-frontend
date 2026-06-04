'use client';
import React, { useState as useStateImport } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { PrimaryButton } from '@/components/ui';
import { formatTime } from '@/lib/data/utils';
import { createClinic } from '@/lib/services/auth.service';
import { getMe as getAuthMe } from '@/lib/services/auth.service';

const DOW = [
  { key: 1, label: 'Mon' }, { key: 2, label: 'Tue' }, { key: 3, label: 'Wed' },
  { key: 4, label: 'Thu' }, { key: 5, label: 'Fri' }, { key: 6, label: 'Sat' }, { key: 0, label: 'Sun' },
];

function SetupField({ label, value, onChange, placeholder, type = 'text', autoFocus }) {
  return (
    <label style={{ display: 'block', marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{label}</div>
      <input autoFocus={autoFocus} type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', border: 'none', borderBottom: '1.5px solid var(--border)', outline: 'none', background: 'transparent', fontSize: 22, fontWeight: 600, padding: '4px 0 8px', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
    </label>
  );
}

function DoctorSetup({ clinic, onDone, saving = false }) {
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({
    doctorName: clinic.doctorName || '', specialty: 'General Dentistry',
    clinicName: clinic.clinicName || '', city: clinic.city || '', address: '',
    days: clinic.days || [1, 2, 3, 4, 5, 6],
    sessions: clinic.sessions || [{ open: '09:00', close: '18:00' }],
    slot: clinic.slot || 30,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleDay = (d) => setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }));

  const steps = [
    { eyebrow: 'About you', title: 'Who are we setting up?', hint: "We'll put your name on prescriptions and records." },
    { eyebrow: 'Your clinic', title: 'Where do you practise?', hint: 'This appears on bills and patient documents.' },
    { eyebrow: 'Working hours', title: 'When is the clinic open?', hint: 'Used to lay out your schedule and suggest visit times.' },
    { eyebrow: 'All set', title: "You're ready to go.", hint: 'You can change any of this later from your account.' },
  ];
  const s = steps[step];
  const valid = step === 0 ? form.doctorName.trim() : step === 1 ? (form.clinicName.trim() && form.city.trim()) : true;
  const next = () => step < 3 ? setStep(step + 1) : onDone(form);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* progress */}
      <div style={{ display: 'flex', gap: 6, padding: '60px 28px 0' }}>
        {steps.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'rgba(60,60,67,0.14)', transition: 'background .3s' }} />)}
      </div>

      <div className="scroll" style={{ flex: 1, padding: '0 28px' }}>
        <div key={step} className="page-in" style={{ paddingTop: 40 }}>
          <div className="t-section" style={{ color: 'var(--accent)', marginBottom: 10 }}>{s.eyebrow}</div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 10px', textWrap: 'balance' }}>{s.title}</h1>
          <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0 0 34px' }}>{s.hint}</p>

          {step === 0 && <>
            <SetupField label="Your name" value={form.doctorName} onChange={v => set('doctorName', v)} placeholder="Dr. Arjun Mehta" autoFocus />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Specialty</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['General Dentistry', 'Endodontics', 'Orthodontics', 'Prosthodontics', 'Oral Surgery', 'Periodontics'].map(sp => (
                <button key={sp} onClick={() => set('specialty', sp)} className="tap" style={{ height: 38, padding: '0 15px', borderRadius: 20, fontSize: 14, fontWeight: 600, background: form.specialty === sp ? 'var(--accent)' : 'transparent', color: form.specialty === sp ? 'var(--accent-ink)' : 'var(--text-secondary)', border: form.specialty === sp ? 'none' : '1px solid var(--border)' }}>{sp}</button>
              ))}
            </div>
          </>}

          {step === 1 && <>
            <SetupField label="Clinic name" value={form.clinicName} onChange={v => set('clinicName', v)} placeholder="Mehta Dental Care" autoFocus />
            <SetupField label="City" value={form.city} onChange={v => set('city', v)} placeholder="Chennai" />
            <SetupField label="Address (optional)" value={form.address} onChange={v => set('address', v)} placeholder="Street, area, pincode" />
          </>}

          {step === 2 && <>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Open days</div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 30 }}>
              {DOW.map(d => {
                const on = form.days.includes(d.key);
                return <button key={d.key} onClick={() => toggleDay(d.key)} className="tap" style={{ flex: 1, height: 46, borderRadius: 12, fontSize: 13, fontWeight: 700, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--text-tertiary)', border: on ? 'none' : '1px solid var(--border)' }}>{d.label[0]}</button>;
              })}
            </div>
            <div style={{ marginBottom: 30 }}>
              {form.sessions.map((sess, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
                  <label style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {form.sessions.length > 1 ? `Session ${i + 1} · Opens` : 'Opens'}
                    </div>
                    <input type="time" value={sess.open} onChange={e => set('sessions', form.sessions.map((x, j) => j === i ? { ...x, open: e.target.value } : x))} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 17, fontWeight: 600, outline: 'none', fontFamily: 'inherit', background: '#fff' }} />
                  </label>
                  <label style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      {form.sessions.length > 1 ? `Session ${i + 1} · Closes` : 'Closes'}
                    </div>
                    <input type="time" value={sess.close} onChange={e => set('sessions', form.sessions.map((x, j) => j === i ? { ...x, close: e.target.value } : x))} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 17, fontWeight: 600, outline: 'none', fontFamily: 'inherit', background: '#fff' }} />
                  </label>
                  {form.sessions.length > 1 && (
                    <button onClick={() => set('sessions', form.sessions.filter((_, j) => j !== i))} style={{ width: 44, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}>
                      <Icon name="x" size={16} color="var(--text-tertiary)" />
                    </button>
                  )}
                </div>
              ))}
              {form.sessions.length < 3 && (
                <button onClick={() => set('sessions', [...form.sessions, { open: '17:00', close: '20:00' }])} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--blue)', fontSize: 14, fontWeight: 600, paddingTop: 4 }}>
                  <Icon name="plus" size={16} color="var(--blue)" stroke={2.2} /> Add another session
                </button>
              )}
            </div>
          </>}

          {step === 3 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={30} color="var(--accent-ink)" stroke={3} /></div>
                <div><div style={{ fontSize: 19, fontWeight: 700 }}>{form.clinicName}</div><div className="t-meta">{form.city}</div></div>
              </div>
              {[['Doctor', form.doctorName], ['Specialty', form.specialty], ['Open', `${form.days.length} days · ${form.sessions.map(s => `${formatTime(s.open).label}–${formatTime(s.close).label}`).join(', ')}`]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', maxWidth: 220 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, padding: '14px 28px 40px', display: 'flex', gap: 12, alignItems: 'center' }}>
        {step > 0 && step < 3 && <button onClick={() => setStep(step - 1)} style={{ width: 56, height: 54, borderRadius: 16, background: 'transparent', color: 'var(--text-secondary)' }}><Icon name="chevLeft" size={24} color="var(--text-secondary)" /></button>}
        <PrimaryButton onClick={() => valid && !saving && next()} style={{ opacity: (valid && !saving) ? 1 : 0.4 }}>{step === 3 ? (saving ? 'Setting up…' : 'Start using DentAI') : 'Continue'}</PrimaryButton>
      </div>
    </div>
  );
}

export default function DoctorSetupPage() {
  const router = useRouter();
  const clinic = useAppStore((s) => s.clinic);
  const hydrateAuth = useAppStore((s) => s.hydrateAuth);
  const saveClinic = useAppStore((s) => s.saveClinic);
  const showToast = useAppStore((s) => s.showToast);
  const [saving, setSaving] = useStateImport(false);

  const handleDone = async (c) => {
    setSaving(true);
    try {
      await createClinic(c.clinicName, c.city, c.doctorName);
      const me = await getAuthMe();
      hydrateAuth({ staff: me.staff, clinic: me.clinic });
      // derive open/close from first session for schedule grid
      const firstSession = (c.sessions || [])[0] || { open: '09:00', close: '18:00' };
      saveClinic({ ...c, open: firstSession.open, close: firstSession.close });
      router.replace('/');
    } catch (e) {
      showToast(e?.response?.data?.message || 'Could not create clinic. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return <DoctorSetup clinic={clinic} onDone={handleDone} saving={saving} />;
}
