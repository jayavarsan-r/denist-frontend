'use client';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useVoiceJob } from '@/lib/hooks/useVoiceJob';
import { reviewDraft } from '@/lib/services/ai.service';
import { createVisit } from '@/lib/services/visit.service';
import { createTreatmentPlan } from '@/lib/services/treatment-plan.service';
import ConsultReview from '@/components/consultation/ConsultReview';
import ConsultRecorder from '@/components/consultation/ConsultRecorder';
import {
  withField, withAddedMedicine, withEditedMedicine, withRemovedMedicine, blankExtraction,
} from '@/store/consultDraft.mjs';
import { toFrontendExtraction, toConfirmedData } from '@/lib/voice/draftMapping';

// A NETWORK-level failure (no HTTP response) means the request never reached the
// server — typically the idle backend waking up, or a flaky connection — as opposed
// to the server answering with an error. Axios marks these with no `response`.
const isNetworkError = (e) =>
  !e?.response && !e?.apiError &&
  (e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED' || /network|timeout/i.test(e?.message || ''));

// Run an async write, retrying ONCE on a cold-start network blip (the second hit
// lands after the instance is awake). Real HTTP errors are not retried.
async function retryOnColdStart(fn) {
  try { return await fn(); }
  catch (e) {
    if (!isNetworkError(e)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return fn();
  }
}

/**
 * PatientConsultSheet — the patient-profile "Start consultation". Same async voice
 * pipeline as the queue consult (useVoiceJob → consultation_draft → Verification
 * Card), but keyed on the PATIENT (no queue entry): audio goes to
 * /api/patients/:id/start-voice. Confirming records the doctor's review on the
 * draft (the correction-learning loop) and then saves visit + plan + Rx exactly as
 * before. params: { patientId, autoStart }
 */
export default function PatientConsultSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const refreshPatientData = useAppStore((s) => s.refreshPatientData);
  const patients = usePatientStore((s) => s.patients);
  const saveRx = useClinicalStore((s) => s.saveRx);
  const p = params.patientId && patients.find((x) => x.id === params.patientId);

  // ready | recording | processing | review
  const [view, setView] = useState('ready');
  const [extraction, setExtraction] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [completing, setCompleting] = useState(false);

  const recorder = useAudioRecorder();
  const voiceJob = useVoiceJob({ patientId: params.patientId || null });

  const handleStartRecording = async () => {
    setAiError(null);
    voiceJob.reset();
    try { await recorder.startRecording(); setView('recording'); }
    catch (e) { setView('ready'); setAiError(e.message || 'Could not start recording'); }
  };

  // The mic tap already happened (FAB/Record button) — begin recording on open.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (params.autoStart && p && !autoStarted.current) { autoStarted.current = true; handleStartRecording(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.autoStart, !!p]);

  // Release the mic on unmount only (stopRecording self-guards when inactive).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { recorder.stopRecording().catch(() => {}); }, []);

  // Worker finished (or failed) → Verification Card / manual fallback.
  useEffect(() => {
    if (voiceJob.state === 'draft_ready' && voiceJob.draft) {
      setExtraction(toFrontendExtraction(voiceJob.draft));
      setView('review');
    }
    if (voiceJob.state === 'error') {
      setAiError(voiceJob.error || 'AI processing failed — type the findings, or re-record');
      setExtraction(blankExtraction());
      setView('review');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceJob.state]);

  if (!p) return null;

  const handleManual = () => { setExtraction(blankExtraction()); setView('review'); };

  const handleStop = async () => {
    setView('processing');
    try {
      const blob = await recorder.stopRecording();
      await voiceJob.submitRecording(blob);
      // draft_ready / error arrive via the effect above.
    } catch (e) {
      setAiError(e.message || 'Recording failed — type the findings, or re-record');
      setExtraction(blankExtraction());
      setView('review');
    }
  };

  /* ─── Confirm & save — visit + plan + Rx, then done. The draft confirmation
     (with the corrections diff) feeds the per-doctor learning loop. ─── */
  const confirmSave = async () => {
    const ex = extraction;
    if (!ex || completing) return;
    setCompleting(true);

    // VOICE PATH: a draft exists → one orchestrated server call creates plan + visit
    // + appointments (availability-scheduled) + Rx, exactly like the queue consult.
    if (ex._draftId) {
      try {
        await retryOnColdStart(() =>
          reviewDraft(ex._draftId, { status: 'confirmed', confirmedData: toConfirmedData(ex) }));
        refreshPatientData();
        showToast('Saved to ' + (p.name.split(' ')[0] || 'patient') + "'s record");
        onClose();
        return;
      } catch (e) {
        const msg = isNetworkError(e)
          ? "Couldn't reach the server — check your connection and try again"
          : (e?.apiError?.message || e?.message || 'Could not save — try again');
        showToast(msg);
        setCompleting(false);
        return;
      }
    }

    // MANUAL / AI-ERROR FALLBACK: no draft to orchestrate → legacy client-side writes.
    const teeth = Array.isArray(ex.teeth) && ex.teeth.length
      ? ex.teeth.map(String)
      : (ex.tooth ? [String(ex.tooth)] : []);
    const primaryTooth = teeth[0] || null;
    const followUpDate = /^\d{4}-\d{2}-\d{2}/.test(ex.followUp || '') ? ex.followUp : null;
    // visits.medications is a TEXT column (the structured Rx is saved separately via
    // saveRx below). Sending the medicine array tripped the string-only validator —
    // a 400 that aborted the whole save. Denormalize to a readable one-line summary.
    const medsText = (ex.medicines || [])
      .map((m) => [m.name, m.dose, m.frequency, m.duration].filter(Boolean).join(' '))
      .filter(Boolean)
      .join('; ');
    try {
      // The visit is the one CRITICAL write (plan + Rx below are non-fatal). The API
      // is on a backend that spins down when idle, so the first request after a lull
      // can fail at the NETWORK level (no HTTP response at all) while the instance
      // wakes — which previously surfaced as the misleading generic "could not save".
      // Retry that ONE class of failure once; a real 4xx/5xx (which carries a response)
      // is NOT retried and propagates its true reason.
      const visitRes = await retryOnColdStart(() => createVisit({
        patientId: p.id,
        procedureName: ex.procedure || 'Consultation',
        toothNumber: primaryTooth,
        notes: ex.diagnosis || '',
        medications: medsText || null,
        rawTranscript: ex.transcript || '',
        cost: ex.estimatedCost || null,
        followUpDate,
        status: 'completed',
      }));
      const visitId = visitRes?.visit?.id || null;

      if (ex.procedure) {
        try {
          await createTreatmentPlan({
            patientId: p.id, diagnosis: ex.diagnosis || '', procedureName: ex.procedure,
            totalSittings: ex.totalSittings || 1, estimatedCost: ex.estimatedCost || 0, notes: ex.instructions || '',
          });
        } catch { /* non-fatal */ }
      }

      if ((ex.medicines || []).length) {
        try {
          await saveRx({
            patientId: p.id, visitId, medicines: ex.medicines, instructions: ex.instructions || '',
            followUp: ex.followUp || '', rawVoice: ex.transcript || '',
          });
        } catch { /* non-fatal */ }
      }

      refreshPatientData();
      showToast('Saved to ' + (p.name.split(' ')[0] || 'patient') + "'s record");
      onClose();
    } catch (e) {
      // Tell the truth about WHY: a network failure (server unreachable / still waking)
      // is different from the server rejecting the data. The old blanket "try again"
      // hid both — making a transient connectivity issue look like bad input.
      const msg = isNetworkError(e)
        ? "Couldn't reach the server — check your connection and try again"
        : (e?.apiError?.message || e?.message || 'Could not save — try again');
      showToast(msg);
      setCompleting(false);
    }
  };

  if (view === 'review') {
    return (
      <ConsultReview
        ex={extraction}
        error={aiError}
        onEditField={(k, v) => setExtraction((cur) => withField(cur, k, v))}
        onAddMedicine={() => setExtraction((cur) => withAddedMedicine(cur))}
        onEditMedicine={(i, patch) => setExtraction((cur) => withEditedMedicine(cur, i, patch))}
        onRemoveMedicine={(i) => setExtraction((cur) => withRemovedMedicine(cur, i))}
        onRerecord={() => { setAiError(null); handleStartRecording(); }}
        onComplete={confirmSave}
        completing={completing}
        completeLabel="Confirm & save"
      />
    );
  }

  return (
    <ConsultRecorder
      patientName={p.name}
      headerSub={[p.age && `${p.age} yrs`, p.gender].filter(Boolean).join(' · ')}
      view={view}
      seconds={recorder.seconds}
      onStart={handleStartRecording}
      onStop={handleStop}
      onManual={handleManual}
      processingLabel="Analysing recording…"
    />
  );
}
