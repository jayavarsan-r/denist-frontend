'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, PrimaryButton, PillToggle, Field } from '@/components/ui';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { extractComplaint as apiExtractComplaint } from '@/lib/services/ai.service';

const FLAG_DEFS = [
  ['isOnBloodThinners', 'Blood thinner'], ['hasDiabetes', 'Diabetes'],
  ['hasHeartCondition', 'Heart condition'], ['isPregnant', 'Pregnancy'],
  ['hasHypertension', 'Hypertension'], ['penicillin', 'Penicillin allergy'],
  ['latex', 'Latex allergy'],
];

// Smooth animated bars for active recording
function RecordingWave() {
  const peaks = [5, 9, 14, 8, 18, 11, 20, 13, 16, 9, 18, 7, 12, 8, 5];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 40 }}>
      {peaks.map((h, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 3, background: 'var(--red)', height: h,
          animation: `wave ${0.5 + (i % 4) * 0.12}s ease-in-out ${i * 0.05}s infinite alternate`,
        }} />
      ))}
    </div>
  );
}

// Three bouncing dots — used for async processing steps
function ProcessingDots({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, height: 36, alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)',
            animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

export default function NewPatientSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const addPatient = usePatientStore((s) => s.addPatient);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [complaint, setComplaint] = useState('');
  const [notes, setNotes] = useState('');
  const [flags, setFlags] = useState({});
  const [saving, setSaving] = useState(false);
  const [voiceError, setVoiceError] = useState('');

  // Voice state machine: idle | recording | transcribing | extracting
  const [voicePhase, setVoicePhase] = useState('idle');

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription();

  const toggle = (k) => setFlags(f => ({ ...f, [k]: !f[k] }));

  /* ─── Voice flow: record → Sarvam STT → Gemini extract ─── */
  const handleVoiceTap = async () => {
    if (voicePhase === 'recording') {
      // Stop recording → start Sarvam transcription
      setVoicePhase('transcribing');
      setVoiceError('');
      try {
        const blob = await recorder.stopRecording();

        // Step 1: Sarvam speech-to-text
        const { text: transcript, warning } = await transcribe(blob);

        if (!transcript) {
          setVoiceError(warning || "Couldn't hear clearly — try again or type below");
          setVoicePhase('idle');
          return;
        }

        // Step 2: Gemini LLM — clean and translate to English
        setVoicePhase('extracting');
        try {
          const result = await apiExtractComplaint(transcript);
          const cleaned = result?.complaint || result?.chief_complaint || transcript;
          setComplaint(cleaned);
        } catch {
          // Gemini failed — use raw Sarvam transcript
          setComplaint(transcript);
        }
        setVoicePhase('idle');
      } catch (e) {
        setVoiceError('Recording failed — please try again');
        setVoicePhase('idle');
      }
      return;
    }

    if (voicePhase !== 'idle') return; // don't allow tap during processing

    // Start recording
    setVoiceError('');
    try {
      await recorder.startRecording();
      setVoicePhase('recording');
    } catch (e) {
      setVoiceError(e.message || 'Microphone unavailable — check browser permissions');
    }
  };

  /* ─── Create patient ─── */
  const create = async () => {
    if (!name.trim()) { showToast('Add a name first'); return; }
    if (!phone.trim()) { showToast('Add a phone number'); return; }
    setSaving(true);
    const allergies = [];
    if (flags.penicillin) allergies.push('Penicillin');
    if (flags.latex) allergies.push('Latex');
    try {
      await addPatient({
        name: name.trim(),
        phone: phone.trim(),
        age: age ? Number(age) : null,
        gender: 'other',
        hasDiabetes:       !!flags.hasDiabetes,
        hasHypertension:   !!flags.hasHypertension,
        hasHeartCondition: !!flags.hasHeartCondition,
        isPregnant:        !!flags.isPregnant,
        isOnBloodThinners: !!flags.isOnBloodThinners,
        allergies,
        clinicalNotes: notes,
        chiefComplaint: complaint,
        status: 'new',
      });
      showToast('Patient created');
      onClose();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Could not create patient — try again');
    } finally {
      setSaving(false);
    }
  };

  const isProcessing = voicePhase === 'transcribing' || voicePhase === 'extracting';
  const isRecording = voicePhase === 'recording';

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="New patient" onClose={onClose} />

      {/* ── Basic info ── */}
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <Field value={name} onChange={setName} placeholder="Full name" autoFocus />
        <div style={{ height: 14 }} />
        <Field value={phone} onChange={setPhone} placeholder="Phone number" type="tel" />
        <div style={{ height: 14 }} />
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field value={age} onChange={v => setAge(v.replace(/\D/g, ''))} placeholder="Age" type="tel" />
          </div>
          <div style={{ flex: 1 }}>
            <Field value={bloodGroup} onChange={setBloodGroup} placeholder="Blood group" />
          </div>
        </div>
      </div>

      {/* ── Chief complaint with voice ── */}
      <SectionHeader>Chief complaint</SectionHeader>

      {/* Voice button */}
      <button
        onClick={handleVoiceTap}
        disabled={isProcessing}
        style={{
          width: '100%',
          border: `1.5px dashed ${isRecording ? 'var(--red)' : isProcessing ? 'var(--accent)' : voiceError ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 12, padding: '18px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          background: isRecording ? 'rgba(255,59,48,0.04)' : isProcessing ? 'rgba(28,28,30,0.03)' : 'rgba(255,255,255,0.5)',
          marginBottom: voiceError ? 6 : 12,
          transition: 'border-color .2s ease, background .2s ease',
          cursor: isProcessing ? 'default' : 'pointer',
        }}
      >
        {voicePhase === 'transcribing' ? (
          <ProcessingDots label="Sarvam is transcribing your voice…" />
        ) : voicePhase === 'extracting' ? (
          <ProcessingDots label="Gemini is cleaning the complaint…" />
        ) : isRecording ? (
          <>
            <RecordingWave />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)' }}>
              {recorder.seconds}s · Tap to stop
            </span>
            <span className="t-meta">Speak in Tamil or English</span>
          </>
        ) : (
          <>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="mic" size={22} color="var(--accent-ink)" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Record complaint</span>
            <span className="t-meta">Tamil or English → Sarvam STT → Gemini cleanup</span>
          </>
        )}
      </button>

      {/* Error message */}
      {voiceError && (
        <p style={{ fontSize: 12, color: 'var(--red)', margin: '0 0 10px 4px' }}>{voiceError}</p>
      )}

      {/* Editable text field — always visible so user can type or correct */}
      <Field
        multiline value={complaint} onChange={setComplaint}
        placeholder="Or type the chief complaint here…"
        minHeight={52}
      />

      <div style={{ height: 18 }} />

      {/* ── Clinical flags ── */}
      <SectionHeader>Clinical flags</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {FLAG_DEFS.map(([k, label]) => (
          <PillToggle key={k} label={label} active={!!flags[k]} onClick={() => toggle(k)} />
        ))}
      </div>

      <Field label="Notes" multiline value={notes} onChange={setNotes} placeholder="Add clinical notes…" minHeight={44} />

      <div style={{ height: 22 }} />
      <PrimaryButton onClick={create} style={{ opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Creating…' : 'Create patient'}
      </PrimaryButton>
    </div>
  );
}
