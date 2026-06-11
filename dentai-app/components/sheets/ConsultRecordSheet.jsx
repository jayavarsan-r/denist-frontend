'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { useConsultStore } from '@/store/useConsultStore';
import ConsultReview from '@/components/consultation/ConsultReview';
import ConsultRecorder from '@/components/consultation/ConsultRecorder';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { useGenerateNote } from '@/lib/hooks/useGenerateNote';
import { extractPrescription } from '@/lib/services/ai.service';
import { mergeMedicinesByName } from '@/store/consultDraft.mjs';

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
 * ConsultRecordSheet — the queue consult: capture → review → checkout in one drawer.
 *
 * Self-contained: it reads the in-chair patient from the queue and reads/writes the
 * same useConsultStore draft (keyed by queue-entry id), so a hand-edited review
 * survives a patient swap and a re-open. The record/review UI is shared with the
 * patient-profile consult (ConsultRecorder / ConsultReview) so both entry points look
 * identical. Confirming sends the patient to the receptionist's checkout — the doctor
 * never handles cash here. With params.autoStart it opens already recording.
 */
export default function ConsultRecordSheet({ params = {}, onClose }) {
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

  // Release the mic on unmount (drawer dismissed). Depending on isRecording made this
  // fire on every Stop and double-called stopRecording — orphaning the awaited stop
  // promise and freezing the screen on "Understanding…". stopRecording self-guards when
  // already inactive, so an unconditional call here is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { recorder.stopRecording().catch(() => {}); }, []);

  // The Record button was the tap — open already recording (unless a hand-edited
  // review is waiting, which must never be clobbered).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!params.autoStart || autoStarted.current || !current || !p) return;
    if (view !== 'ready' || (draft?.phase === 'review' && draft?.extraction)) return;
    autoStarted.current = true;
    handleStartRecording();
  }, [params.autoStart, current?.id, !!p]);

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

  /* ─── Confirm & send to front desk — the doctor's last step. Payment/cash is the
     receptionist's job, so there's no amount step here: completing the consult moves
     the patient into the receptionist's "Ready for checkout" list. ─── */
  const handleComplete = async () => {
    if (completing) return;
    const ex = draft?.extraction || {};
    setCompleting(true);
    try {
      await completeConsult(id, { ...ex, transcript: draft?.transcript || ex.transcript || '' });
      resetDraft(id);
      showToast(`${p?.name?.split(' ')[0] || 'Patient'} sent to front desk for checkout`);
      onClose();
    } catch (e) {
      showToast('Failed to save — try again');
    } finally {
      setCompleting(false);
    }
  };

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
        completeLabel="Confirm & send to front desk"
      />
    );
  }

  return (
    <ConsultRecorder
      patientName={p.name}
      headerSub={`Token #${current.tokenNumber}`}
      view={view}
      seconds={recorder.seconds}
      onStart={handleStartRecording}
      onStop={handleStop}
      onManual={handleManual}
      processingLabel="Understanding…"
    />
  );
}
