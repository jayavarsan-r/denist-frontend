'use client';
import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { useConsultStore } from '@/store/useConsultStore';
import Icon from '@/components/icons';
import ConsultReview from '@/components/consultation/ConsultReview';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { useGenerateNote } from '@/lib/hooks/useGenerateNote';
import { extractPrescription } from '@/lib/services/ai.service';
import { mergeMedicinesByName } from '@/store/consultDraft.mjs';

/* Accent waveform — consistent with VoiceSheet (dark bars, not red). */
function Waveform({ bars = 22, color = 'var(--accent)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 56 }}>
      {Array.from({ length: bars }, (_, i) => {
        const peak = 10 + Math.round(Math.abs(Math.sin(i * 1.7)) * 30);
        return <div key={i} style={{ width: 3, borderRadius: 3, background: color, '--peak': peak + 'px', height: peak, animation: `wave ${0.4 + (i % 5) * 0.14}s ease-in-out ${i * 0.04}s infinite` }} />;
      })}
    </div>
  );
}

// Best-effort continuation inference: if the patient already has an active plan,
// default this consult to "continuing" it (the doctor can correct on the review).
function inferContinuation(extraction, activeProc) {
  if (!extraction || !activeProc) return extraction;
  const total = activeProc.totalSittings || activeProc.total_sittings || extraction.totalSittings || 1;
  const done = activeProc.completedSittings || activeProc.completed_sittings || 0;
  return {
    ...extraction,
    isContinuation: true,
    sittingNumber: Math.min(total, done + 1),
    totalSittings: total,
    procedure: extraction.procedure || activeProc.type || activeProc.procedure_name || '',
  };
}

// extractPrescription → the frontend medicine shape ConsultReview edits.
const mapRxMed = (m) => ({
  name: m.name || '',
  dose: m.dose || m.dosage || '',
  frequency: m.frequency || '',
  duration: m.duration || '',
  slots: m.meal_timing_slots || m.slots || {},
  uncertain: m.uncertain || false,
});

/**
 * ConsultRecordSheet — the whole capture → review → checkout flow in one bottom
 * drawer. Replaces the old full-page recording/review screens.
 *
 * Self-contained: it reads the in-chair patient from the queue and reads/writes
 * the same useConsultStore draft (keyed by queue-entry id), so a hand-edited
 * review survives a patient swap and a re-open. Internal views: ready → recording
 * → processing → review. Closing mid-record releases the mic.
 */
export default function ConsultRecordSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const queue = useQueueStore((s) => s.queue);
  const completeConsult = useQueueStore((s) => s.completeConsult);
  const patients = usePatientStore((s) => s.patients);
  const procedures = useClinicalStore((s) => s.procedures);

  const current = queue.find((e) => e.status === 'in_consultation');
  const p = current && patients.find((x) => x.id === current.patientId);
  const activeProc = p && procedures
    .filter((x) => x.patientId === p.id && (x.status === 'in_progress' || x.status === 'planned'))
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];

  const draft = useConsultStore((s) => (current ? s.drafts[current.id] : null));
  const setPhase = useConsultStore((s) => s.setPhase);
  const setError = useConsultStore((s) => s.setError);
  const setExtraction = useConsultStore((s) => s.setExtraction);
  const mergeExtraction = useConsultStore((s) => s.mergeExtraction);
  const startManual = useConsultStore((s) => s.startManual);
  const editField = useConsultStore((s) => s.editField);
  const addMedicine = useConsultStore((s) => s.addMedicine);
  const editMedicine = useConsultStore((s) => s.editMedicine);
  const removeMedicine = useConsultStore((s) => s.removeMedicine);
  const resetDraft = useConsultStore((s) => s.resetDraft);

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription('diagnosis');
  const { generateFromTranscript } = useGenerateNote();

  // A hand-edited review (phase 'review' with an extraction) re-opens straight to
  // the review; recording/processing are transient and reset to the ready screen.
  const [view, setView] = useState(
    draft?.phase === 'review' && draft?.extraction ? 'review' : 'ready',
  );
  const [fixPhase, setFixPhase] = useState('idle');
  const [completing, setCompleting] = useState(false);

  // Release the mic if the drawer is dismissed mid-recording.
  useEffect(() => () => {
    if (recorder.isRecording) recorder.stopRecording().catch(() => {});
  }, [recorder.isRecording]);

  if (!current || !p) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>No patient in the chair.</div>
        <button onClick={onClose} style={{ marginTop: 16, color: 'var(--blue)', fontSize: 15, fontWeight: 600 }}>Close</button>
      </div>
    );
  }
  const id = current.id;

  /* ─── ready → recording ─── */
  const handleStartRecording = async () => {
    setError(id, null);
    try { await recorder.startRecording(); setView('recording'); }
    catch (e) { showToast(e.message || 'Could not start recording'); }
  };

  const handleManual = () => { startManual(id); setView('review'); };

  /* ─── recording → review ─── */
  const handleStop = async () => {
    setView('processing');
    try {
      const blob = await recorder.stopRecording();
      const { text: transcript, warning } = await transcribe(blob);
      if (!transcript) {
        setError(id, warning || "Couldn't transcribe — type your notes, or re-record");
        startManual(id);
        setView('review');
        return;
      }
      const note = await generateFromTranscript(transcript);
      let medicines = note.medicines || [];
      try {
        const rx = await extractPrescription(transcript);
        if (Array.isArray(rx.medicines) && rx.medicines.length) medicines = rx.medicines.map(mapRxMed);
      } catch { /* prescription optional */ }
      setExtraction(id, inferContinuation({ ...note, medicines, transcript }, activeProc));
      setPhase(id, 'review');
      setView('review');
    } catch (e) {
      setError(id, e.message || 'AI processing failed — type your notes, or re-record');
      startManual(id);
      setView('review');
    }
  };

  /* ─── Fix by voice — merges core fields AND the prescription ─── */
  const handleFixByVoice = async () => {
    if (fixPhase === 'recording') {
      setFixPhase('processing');
      setError(id, null);
      try {
        const blob = await recorder.stopRecording();
        const { text: transcript, warning } = await transcribe(blob);
        if (!transcript) { setError(id, warning || "Couldn't hear the correction — try again"); setFixPhase('idle'); return; }
        const raw = draft?.extraction?._raw || null;
        const [merged, rx] = await Promise.all([
          generateFromTranscript(transcript, raw),
          extractPrescription(transcript).catch(() => ({ medicines: [] })),
        ]);
        // Smart-merge by name: spoken meds update/add; if none spoken, keep existing.
        const spoken = (Array.isArray(rx?.medicines) ? rx.medicines : []).map(mapRxMed);
        const existing = draft?.extraction?.medicines || [];
        const medicines = spoken.length ? mergeMedicinesByName(existing, spoken) : existing;
        mergeExtraction(id, { ...merged, medicines });
        setFixPhase('idle');
        showToast('Correction applied');
      } catch (e) {
        setError(id, e.message || 'Could not apply correction');
        setFixPhase('idle');
      }
      return;
    }
    setError(id, null);
    try { await recorder.startRecording(); setFixPhase('recording'); }
    catch (e) { showToast(e.message || 'Could not start recording'); }
  };

  /* ─── Checkout ─── */
  const handleComplete = async () => {
    if (completing) return;
    const ex = draft?.extraction || {};
    setCompleting(true);
    try {
      await completeConsult(id, { ...ex, transcript: draft?.transcript || ex.transcript || '' });
      resetDraft(id);
      showToast(`${p?.name?.split(' ')[0] || 'Patient'} done · sent to front desk`);
      onClose();
    } catch (e) {
      showToast('Failed to save — try again');
    } finally {
      setCompleting(false);
    }
  };

  /* ─── Render ─── */
  const PatientHeader = (
    <div className="card" style={{ margin: '0 20px 16px', padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{p.name[0]}</div>
      <div><div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div><div className="t-meta">Token #{current.tokenNumber}</div></div>
    </div>
  );

  if (view === 'review') {
    return (
      <ConsultReview
        ex={draft?.extraction}
        error={draft?.error}
        onEditField={(k, v) => editField(id, k, v)}
        onAddMedicine={() => addMedicine(id)}
        onEditMedicine={(i, patch) => editMedicine(id, i, patch)}
        onRemoveMedicine={(i) => removeMedicine(id, i)}
        onFixByVoice={handleFixByVoice}
        fixPhase={fixPhase}
        fixSeconds={recorder.seconds}
        onRerecord={() => { setError(id, null); setView('ready'); }}
        onComplete={handleComplete}
        completing={completing}
      />
    );
  }

  return (
    <div style={{ paddingBottom: 28, minHeight: 280 }}>
      {PatientHeader}

      {view === 'ready' && (
        <div style={{ padding: '8px 24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button onClick={handleStartRecording} className="tap" style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}>
            <Icon name="mic" size={42} color="var(--accent-ink)" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 18 }}>Tap to record</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 4, lineHeight: 1.4, maxWidth: 280 }}>
            Speak your findings — the plan, prescription and next visits file themselves.
          </div>
          <button onClick={handleManual} style={{ marginTop: 22, fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>or fill in manually ›</button>
        </div>
      )}

      {view === 'recording' && (
        <div style={{ padding: '8px 24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Recording for {p.name.split(' ')[0]}</span>
            <button onClick={handleStop} style={{ color: 'var(--blue)', fontSize: 16, fontWeight: 600 }}>Stop</button>
          </div>
          <div style={{ padding: '24px 0 8px' }}><Waveform /></div>
          <div className="tnum" style={{ textAlign: 'center', fontSize: 20, fontWeight: 600 }}>0:{String(recorder.seconds).padStart(2, '0')}</div>
          {recorder.seconds >= 25 && (
            <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
              Long note — it'll transcribe in parts. No 30-second limit, no error.
            </div>
          )}
        </div>
      )}

      {view === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '54px 0' }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>Understanding…</div>
          <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}</div>
        </div>
      )}
    </div>
  );
}
