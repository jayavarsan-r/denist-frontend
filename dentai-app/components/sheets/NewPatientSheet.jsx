'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import Icon from '@/components/icons';
import { SheetHeader, PrimaryButton, VoiceButton } from '@/components/ui';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { extractPatientInfo } from '@/lib/services/ai.service';

const FLAGS = [
  ['isOnBloodThinners', 'Blood thinner'],
  ['hasDiabetes', 'Diabetes'],
  ['hasHeartCondition', 'Heart condition'],
  ['isPregnant', 'Pregnancy'],
  ['hasHypertension', 'Hypertension'],
  ['penicillin', 'Penicillin allergy'],
  ['latex', 'Latex allergy'],
];

function generatePatientId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'PT-';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/* Single field row inside the grouped card */
function FieldRow({ label, value, onChange, type = 'text', inputMode, placeholder, half, last, autoFocus }) {
  const filled = value && value.toString().trim().length > 0;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: half ? 1 : undefined,
      padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border-light)',
      minHeight: 58,
      position: 'relative',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          autoFocus={autoFocus}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || label}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 17, fontWeight: 500,
            color: filled ? 'var(--text-primary)' : 'var(--text-tertiary)',
            fontFamily: 'inherit', padding: 0,
          }}
        />
        {filled && (
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.85 }}>
            <Icon name="check" size={9} color="var(--accent-ink)" stroke={3} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewPatientSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const addPatient = usePatientStore((s) => s.addPatient);

  const [displayId] = useState(generatePatientId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [complaint, setComplaint] = useState('');
  const [flags, setFlags] = useState({});
  const [saving, setSaving] = useState(false);
  const [voicePhase, setVoicePhase] = useState('idle');
  const [voiceError, setVoiceError] = useState('');

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription();
  const toggle = (k) => setFlags(f => ({ ...f, [k]: !f[k] }));

  const isRecording = voicePhase === 'recording';
  const isProcessing = voicePhase === 'transcribing' || voicePhase === 'extracting';

  const handleVoiceTap = async () => {
    if (isProcessing) return;
    if (isRecording) {
      setVoicePhase('transcribing');
      setVoiceError('');
      try {
        const blob = await recorder.stopRecording();
        const { text: transcript, warning } = await transcribe(blob);
        if (!transcript) { setVoiceError(warning || "Couldn't hear — try again"); setVoicePhase('idle'); return; }
        setVoicePhase('extracting');
        const result = await extractPatientInfo(transcript);
        // Backend (receptionist prompt) returns: name, age, phone, chiefComplaint,
        // bloodGroup, flags{}. Map those names exactly. Only fill empty fields.
        const cc = result.chiefComplaint || result.chief_complaint || result.complaint;
        const bg = result.bloodGroup || result.blood_group;
        if (result.name && !name.trim())       setName(result.name);
        if (result.phone && !phone.trim())     setPhone(String(result.phone).replace(/\D/g, '').slice(0, 10));
        if (result.age && !age.trim())         setAge(String(result.age));
        if (bg && !bloodGroup.trim())          setBloodGroup(bg);
        if (cc && !complaint.trim())           setComplaint(cc);
        if (result.flags) setFlags(f => ({
          ...f, ...Object.fromEntries(Object.entries(result.flags).filter(([k, v]) => v === true && !f[k]))
        }));
        if (result.warning) setVoiceError(result.warning);
        setVoicePhase('done');
        setTimeout(() => setVoicePhase('idle'), 1800);
      } catch (err) {
        const code = err?.apiError?.code;
        const msg = err?.apiError?.message || err?.response?.data?.error?.message || err?.message || '';
        setVoiceError(
          code === 'RATE_LIMITED' || /rate limit|quota|exhaust/i.test(msg)
            ? 'AI is busy (free-tier limit) — wait a few seconds and retry, or type below'
            : /transcri/i.test(msg)
            ? 'Voice recognition unavailable — type below'
            : 'Could not process — fill fields manually'
        );
        setVoicePhase('idle');
      }
      return;
    }
    setVoiceError('');
    try { await recorder.startRecording(); setVoicePhase('recording'); }
    catch (e) { setVoiceError(e.message || 'Microphone unavailable'); }
  };

  const create = async () => {
    if (!name.trim()) { showToast('Name is required'); return; }
    if (!phone.trim()) { showToast('Phone number is required'); return; }
    setSaving(true);
    try {
      await addPatient({
        name: name.trim(), phone: phone.trim(),
        age: age ? Number(age) : null, gender: 'other', displayId,
        hasDiabetes: !!flags.hasDiabetes, hasHypertension: !!flags.hasHypertension,
        hasHeartCondition: !!flags.hasHeartCondition, isPregnant: !!flags.isPregnant,
        isOnBloodThinners: !!flags.isOnBloodThinners,
        allergies: [flags.penicillin && 'Penicillin', flags.latex && 'Latex'].filter(Boolean),
        chiefComplaint: complaint, status: 'new',
      });
      showToast(`Patient created · ${displayId}`);
      onClose();
    } catch (e) {
      showToast(e?.apiError?.message || e?.message || 'Could not create patient');
    } finally { setSaving(false); }
  };

  const vPhase = isRecording ? 'recording' : isProcessing ? 'processing' : voicePhase === 'done' ? 'done' : 'idle';

  return (
    <div style={{ padding: '0 20px 32px' }}>
      <SheetHeader title="New patient" onClose={onClose} />

      {/* Patient ID badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Patient ID</span>
        <span style={{
          height: 26, padding: '0 10px', borderRadius: 99,
          background: 'rgba(60,60,67,0.07)',
          display: 'inline-flex', alignItems: 'center',
          fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-secondary)',
        }}>{displayId}</span>
      </div>

      {/* ── Voice button (shared, consistent across the app) ── */}
      <div style={{ marginBottom: voiceError ? 8 : 20 }}>
        <VoiceButton
          phase={vPhase}
          seconds={recorder.seconds}
          onTap={handleVoiceTap}
          idleTitle={(name || phone) ? 'Speak to add more' : 'Speak patient details'}
          idleHint="Name · phone · age · complaint"
          recordingHint="Name · phone · age · complaint"
          doneTitle="All done"
          doneHint="Review and edit below"
        />
      </div>

      {voiceError && <p style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 14px 2px' }}>{voiceError}</p>}

      {/* ── Grouped card — iOS-style inset table ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--elevation-1)', marginBottom: 16 }}>
        <FieldRow label="Full name"    value={name}    onChange={setName}  placeholder="Full name" autoFocus />
        <FieldRow label="Phone number" value={phone}   onChange={v => setPhone(v.replace(/\D/g, '').slice(0, 10))} inputMode="tel" placeholder="Phone number" />
        {/* Age + Blood group side by side */}
        <div style={{ display: 'flex', borderBottom: 'none' }}>
          <FieldRow label="Age"         value={age}        onChange={v => setAge(v.replace(/\D/g, ''))} inputMode="numeric" placeholder="Age" half />
          <div style={{ width: 1, background: 'var(--border-light)', alignSelf: 'stretch', margin: '10px 0' }} />
          <FieldRow label="Blood group" value={bloodGroup} onChange={v => setBloodGroup(v.toUpperCase())} placeholder="A+" half last />
        </div>
      </div>

      {/* ── Chief complaint card ── */}
      <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--elevation-1)', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Chief complaint</div>
          <textarea
            value={complaint}
            onChange={e => setComplaint(e.target.value)}
            placeholder="What brings the patient in?"
            rows={2}
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, fontFamily: 'inherit', resize: 'none', padding: 0,
              color: complaint ? 'var(--text-primary)' : 'var(--text-tertiary)',
              lineHeight: 1.5, minHeight: 48,
            }}
          />
        </div>
      </div>

      {/* ── Medical flags ── */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Medical flags</div>
        <div className="noscroll-x" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {FLAGS.map(([k, label]) => {
            const on = !!flags[k];
            return (
              <button key={k} onClick={() => toggle(k)} style={{
                height: 34, padding: '0 14px', borderRadius: 99, flexShrink: 0,
                fontSize: 13, fontWeight: 600,
                background: on ? '#C0392B' : 'var(--surface)',
                color: on ? '#fff' : 'var(--text-secondary)',
                border: on ? 'none' : '1px solid var(--border)',
                boxShadow: on ? 'none' : 'var(--elevation-1)',
                transition: 'all .15s ease',
              }}>{label}</button>
            );
          })}
        </div>
      </div>

      <PrimaryButton onClick={create} style={{ opacity: saving ? 0.6 : 1, borderRadius: 99 }}>
        {saving ? 'Creating…' : `Create patient · ${displayId}`}
      </PrimaryButton>
    </div>
  );
}
