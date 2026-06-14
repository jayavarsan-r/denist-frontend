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
import { useVoiceJob } from '@/lib/hooks/useVoiceJob';
import { startManualDraft } from '@/lib/services/queue.service';
import { toFrontendExtraction, toConfirmedData } from '@/lib/voice/draftMapping';

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

/**
 * ConsultRecordSheet — the queue consult: capture → review → checkout in one drawer.
 *
 * Phase 2: the voice pipeline is ASYNC. Stopping the recording uploads the audio to
 * the backend (start-voice) and a worker does STT → context-aware extraction →
 * safety checks. We hear back on the consultation_draft row via Supabase Realtime
 * (useVoiceJob) and show the Verification Card (ConsultReview). Confirming posts
 * { draft_id, confirmed_data } to complete-consult — the only path that turns AI
 * output into clinical records. Manual ("type notes") entries flow through the same
 * gate via an empty manual draft.
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
  const startManual = useConsultStore((s) => s.startManual);
  const editField = useConsultStore((s) => s.editField);
  const addMedicine = useConsultStore((s) => s.addMedicine);
  const editMedicine = useConsultStore((s) => s.editMedicine);
  const removeMedicine = useConsultStore((s) => s.removeMedicine);
  const resetDraft = useConsultStore((s) => s.resetDraft);

  const recorder = useAudioRecorder();
  const voiceJob = useVoiceJob({ queueEntryId: current?.id || null });

  // A hand-edited review (phase 'review' with an extraction) re-opens straight to
  // the review; recording/processing are transient and reset to the ready screen.
  const [view, setView] = useState(
    draft?.phase === 'review' && draft?.extraction ? 'review' : 'ready',
  );
  const [completing, setCompleting] = useState(false);

  // Release the mic on unmount (drawer dismissed). stopRecording self-guards when
  // already inactive, so an unconditional call here is safe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { recorder.stopRecording().catch(() => {}); }, []);

  // The worker finished (or failed): surface the draft as the Verification Card.
  const id = current?.id;
  useEffect(() => {
    if (!id) return;
    if (voiceJob.state === 'draft_ready' && voiceJob.draft) {
      setExtraction(id, inferContinuation(toFrontendExtraction(voiceJob.draft), activeProc));
      setPhase(id, 'review');
      setView('review');
    }
    if (voiceJob.state === 'error') {
      setError(id, voiceJob.error || 'Processing failed — type your notes, or re-record');
      handleManual();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceJob.state]);

  // The Record button was the tap — open already recording (unless a hand-edited
  // review is waiting, which must never be clobbered).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!params.autoStart || autoStarted.current || !current || !p) return;
    if (view !== 'ready' || (draft?.phase === 'review' && draft?.extraction)) return;
    autoStarted.current = true;
    handleStartRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autoStart, current?.id, !!p]);

  if (!current || !p) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>No patient in the chair.</div>
        <button onClick={onClose} style={{ marginTop: 16, color: 'var(--blue)', fontSize: 15, fontWeight: 600 }}>Close</button>
      </div>
    );
  }

  /* ─── ready → recording ─── */
  const handleStartRecording = async () => {
    setError(id, null);
    voiceJob.reset();
    try { await recorder.startRecording(); setView('recording'); }
    catch (e) { showToast(e.message || 'Could not start recording'); }
  };

  /* ─── manual entry — same confirm gate via an empty draft ─── */
  const handleManual = async () => {
    startManual(id);
    setView('review');
    try {
      const { draft_id } = await startManualDraft(id);
      editField(id, '_draftId', draft_id);
    } catch {
      // No draft id yet — confirm will retry creating one.
    }
  };

  /* ─── recording → async processing (the worker takes it from here) ─── */
  const handleStop = async () => {
    setView('processing');
    try {
      const blob = await recorder.stopRecording();
      await voiceJob.submitRecording(blob);
      // draft_ready / error arrive via the useEffect above.
    } catch (e) {
      setError(id, e.message || 'Recording failed — type your notes, or re-record');
      handleManual();
    }
  };

  /* ─── Confirm & send to front desk — the doctor's last step ─── */
  const handleComplete = async () => {
    if (completing) return;
    const ex = draft?.extraction || {};
    setCompleting(true);
    try {
      let draftId = ex._draftId;
      if (!draftId) ({ draft_id: draftId } = await startManualDraft(id)); // manual fallback
      await completeConsult(id, { draftId, confirmedData: toConfirmedData(ex) });
      resetDraft(id);
      voiceJob.reset();
      showToast(`${p?.name?.split(' ')[0] || 'Patient'} sent to front desk for checkout`);
      onClose();
    } catch (e) {
      // Surface the real backend reason instead of a blanket "try again": a 409
      // (already saved), a 404 (draft gone), or a validation error are not things
      // a retry fixes, and the masked message left the doctor stuck with no signal.
      const code = e?.apiError?.code || e?.code;
      const msg =
        code === 'CONFLICT' || /already/i.test(e?.message || '')
          ? 'This consult was already saved.'
          : code === 'NOT_FOUND'
          ? 'Draft expired — re-record to try again.'
          : (e?.apiError?.message || e?.message || 'Failed to save — try again');
      setError(id, msg);
      showToast(msg);
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
        onRerecord={() => { setError(id, null); voiceJob.reset(); setView('ready'); }}
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
      processingLabel="Analysing recording…"
    />
  );
}
