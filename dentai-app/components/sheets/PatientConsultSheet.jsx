'use client';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { useGenerateNote } from '@/lib/hooks/useGenerateNote';
import { extractPrescription } from '@/lib/services/ai.service';
import { createVisit } from '@/lib/services/visit.service';
import { createTreatmentPlan } from '@/lib/services/treatment-plan.service';
import ConsultReview from '@/components/consultation/ConsultReview';
import ConsultRecorder from '@/components/consultation/ConsultRecorder';
import {
  normaliseExtraction, withField, withAddedMedicine, withEditedMedicine,
  withRemovedMedicine, blankExtraction, mergeMedicinesByName,
} from '@/store/consultDraft.mjs';

// extractPrescription → the frontend medicine shape ConsultReview edits.
const mapRxMed = (m) => ({
  name: m.name || '', dose: m.dose || m.dosage || '', frequency: m.frequency || '',
  duration: m.duration || '', slots: m.meal_timing_slots || m.slots || {}, uncertain: m.uncertain || false,
});

/**
 * PatientConsultSheet — the patient-profile "Start consultation". Uses the EXACT same
 * record → review UI as the queue consult (ConsultRecorder / ConsultReview), so the two
 * flows are identical. Confirming saves a visit + treatment plan + prescription for the
 * named patient; cash/payment is handled later in the receptionist section, not here.
 * params: { patientId, autoStart }
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
  const [fixPhase, setFixPhase] = useState('idle');
  const [completing, setCompleting] = useState(false);

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription('diagnosis');
  const { generateFromTranscript } = useGenerateNote();

  const handleStartRecording = async () => {
    setAiError(null);
    try { await recorder.startRecording(); setView('recording'); }
    catch (e) { setView('ready'); setAiError(e.message || 'Could not start recording'); }
  };

  // The mic tap already happened (FAB/Record button) — begin recording on open.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (params.autoStart && p && !autoStarted.current) { autoStarted.current = true; handleStartRecording(); }
  }, [params.autoStart, !!p]);

  // Release the mic on unmount only. Depending on isRecording made this fire on every
  // Stop and double-called stopRecording — orphaning the awaited stop promise and
  // freezing on "Understanding…". stopRecording self-guards when already inactive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { recorder.stopRecording().catch(() => {}); }, []);

  if (!p) return null;

  const handleManual = () => { setExtraction(blankExtraction()); setView('review'); };

  const handleStop = async () => {
    setView('processing');
    try {
      const blob = await recorder.stopRecording();
      const { text: transcript, warning } = await transcribe(blob);
      if (!transcript) {
        setAiError(warning || "Couldn't transcribe — type the findings, or re-record");
        setExtraction(blankExtraction());
        setView('review');
        return;
      }
      const note = await generateFromTranscript(transcript);
      let medicines = note.medicines || [];
      try {
        const rx = await extractPrescription(transcript);
        if (Array.isArray(rx.medicines) && rx.medicines.length) medicines = rx.medicines.map(mapRxMed);
      } catch { /* prescription optional */ }
      setExtraction(normaliseExtraction({ ...note, medicines, transcript }));
      setView('review');
    } catch (e) {
      setAiError(e.message || 'AI processing failed — type the findings, or re-record');
      setExtraction(blankExtraction());
      setView('review');
    }
  };

  /* ─── Fix by voice — merges core fields AND the prescription ─── */
  const handleFixByVoice = async () => {
    if (fixPhase === 'recording') {
      setFixPhase('processing');
      setAiError(null);
      try {
        const blob = await recorder.stopRecording();
        const { text: transcript, warning } = await transcribe(blob);
        if (!transcript) { setAiError(warning || "Couldn't hear the correction — try again"); setFixPhase('idle'); return; }
        const [merged, rx] = await Promise.all([
          generateFromTranscript(transcript, extraction?._raw || null),
          extractPrescription(transcript).catch(() => ({ medicines: [] })),
        ]);
        const spoken = (Array.isArray(rx?.medicines) ? rx.medicines : []).map(mapRxMed);
        const existing = extraction?.medicines || [];
        const medicines = spoken.length ? mergeMedicinesByName(existing, spoken) : existing;
        setExtraction((cur) => ({ ...(cur || {}), ...merged, medicines }));
        setFixPhase('idle');
        showToast('Correction applied');
      } catch (e) {
        setAiError(e.message || 'Could not apply correction');
        setFixPhase('idle');
      }
      return;
    }
    setAiError(null);
    try { await recorder.startRecording(); setFixPhase('recording'); }
    catch (e) { showToast(e.message || 'Could not start recording'); }
  };

  /* ─── Confirm & save — visit + plan + Rx, then done. Cash/payment is handled in the
     receptionist section (the patient's Billing → Collect), not here. ─── */
  const confirmSave = async () => {
    const ex = extraction;
    if (!ex || completing) return;
    setCompleting(true);
    const teeth = Array.isArray(ex.teeth) && ex.teeth.length
      ? ex.teeth.map(String)
      : (ex.tooth ? [String(ex.tooth)] : []);
    const primaryTooth = teeth[0] || null;
    const followUpDate = /^\d{4}-\d{2}-\d{2}/.test(ex.followUp || '') ? ex.followUp : null;
    try {
      await createVisit({
        patientId: p.id,
        procedureName: ex.procedure || 'Consultation',
        toothNumber: primaryTooth,
        notes: ex.diagnosis || '',
        medications: ex.medicines || [],
        rawTranscript: ex.transcript || '',
        cost: ex.estimatedCost || null,
        followUpDate,
        status: 'completed',
      });

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
            patientId: p.id, medicines: ex.medicines, instructions: ex.instructions || '',
            followUp: ex.followUp || '', rawVoice: ex.transcript || '',
          });
        } catch { /* non-fatal */ }
      }

      refreshPatientData();
      showToast('Saved to ' + (p.name.split(' ')[0] || 'patient') + "'s record");
      onClose();
    } catch (e) {
      showToast('Could not save — try again');
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
        onFixByVoice={handleFixByVoice}
        fixPhase={fixPhase}
        fixSeconds={recorder.seconds}
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
      processingLabel="Understanding…"
    />
  );
}
