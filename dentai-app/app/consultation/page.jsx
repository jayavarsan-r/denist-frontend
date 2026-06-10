'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { useConsultStore } from '@/store/useConsultStore';
import Icon from '@/components/icons';
import { Chip } from '@/components/ui';
import { formatDate, clinicianFlags } from '@/lib/data/utils';
import { minutesAgo, waitLabel } from '@/lib/data/queue';
import { useQueueRealtime } from '@/lib/hooks/useQueueRealtime';
import PatientContext from '@/components/consultation/PatientContext';
import ConsultReview from '@/components/consultation/ConsultReview';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { useGenerateNote } from '@/lib/hooks/useGenerateNote';
import { extractPrescription } from '@/lib/services/ai.service';

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

function ConsultModeScreen() {
  useQueueRealtime();
  const router = useRouter();
  const showToast = useAppStore((s) => s.showToast);
  const queue = useQueueStore((s) => s.queue);
  const callIn = useQueueStore((s) => s.callIn);
  const swapIn = useQueueStore((s) => s.swapIn);
  const completeConsult = useQueueStore((s) => s.completeConsult);
  const loadQueue = useQueueStore((s) => s.loadQueue);
  const patients = usePatientStore((s) => s.patients);
  const visits = useVisitStore((s) => s.visits);
  const procedures = useClinicalStore((s) => s.procedures);
  const prescriptions = useClinicalStore((s) => s.prescriptions);
  const fetchPatient = usePatientStore((s) => s.fetchPatient);
  const loadPatients = usePatientStore((s) => s.loadPatients);

  const pById = (id) => patients.find((p) => p.id === id);
  const current = queue.find((e) => e.status === 'in_consultation');
  const waiting = queue.filter((e) => e.status === 'waiting').sort((a, b) => a.tokenNumber - b.tokenNumber);
  const p = current && pById(current.patientId);

  /* ─── Consult draft (keyed by queue-entry id) ─── */
  const draft = useConsultStore((s) => (current ? s.drafts[current.id] : null));
  const ensureDraft = useConsultStore((s) => s.ensureDraft);
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
  const phase = draft?.phase || 'idle';

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription('diagnosis');
  const { generateFromTranscript } = useGenerateNote();
  const [fixPhase, setFixPhase] = useState('idle');
  const [completing, setCompleting] = useState(false);

  // Ensure a draft exists whenever a patient is in the chair.
  useEffect(() => { if (current?.id) ensureDraft(current.id); }, [current?.id]);

  // If the in-chair patient isn't in the local store yet, fetch them.
  useEffect(() => {
    if (!current?.patientId || p) return;
    fetchPatient(current.patientId).catch(() => { loadPatients().catch(() => {}); });
  }, [current?.patientId, !!p]);

  const lastVisit = p && visits.filter((v) => v.patientId === p.id && v.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeProc = p && procedures.filter((x) => x.patientId === p.id && (x.status === 'in_progress' || x.status === 'planned')).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
  const hasRx = p && prescriptions.some((r) => r.patientId === p.id);
  const flags = p ? clinicianFlags(p) : [];

  /* ─── Recording → extraction ─── */
  const handleStartRecording = async () => {
    if (!current) return;
    setError(current.id, null);
    try {
      await recorder.startRecording();
      setPhase(current.id, 'recording');
    } catch (e) {
      showToast(e.message || 'Could not start recording');
    }
  };

  const handleStop = async () => {
    if (!current) return;
    const id = current.id;
    setPhase(id, 'processing');
    try {
      const blob = await recorder.stopRecording();
      const { text: transcript, warning } = await transcribe(blob);
      if (!transcript) {
        setError(id, warning || "Couldn't transcribe — type your notes, or re-record");
        // Don't dead-end: drop the doctor into an editable (blank) review.
        startManual(id);
        return;
      }
      const note = await generateFromTranscript(transcript);
      let medicines = note.medicines || [];
      try {
        const rx = await extractPrescription(transcript);
        if (Array.isArray(rx.medicines) && rx.medicines.length) {
          medicines = rx.medicines.map((m) => ({
            name: m.name || '', dose: m.dose || m.dosage || '', frequency: m.frequency || '',
            duration: m.duration || '', slots: m.meal_timing_slots || m.slots, uncertain: m.uncertain || false,
          }));
        }
      } catch { /* prescription optional */ }
      const extraction = inferContinuation({ ...note, medicines, transcript }, activeProc);
      setExtraction(id, extraction);
      setPhase(id, 'review');
    } catch (e) {
      setError(id, e.message || 'AI processing failed — type your notes, or re-record');
      startManual(id);
    }
  };

  /* ─── Fix by voice — merge only the mentioned fields ─── */
  const handleFixByVoice = async () => {
    if (!current) return;
    const id = current.id;
    if (fixPhase === 'recording') {
      setFixPhase('processing');
      setError(id, null);
      try {
        const blob = await recorder.stopRecording();
        const { text: transcript, warning } = await transcribe(blob);
        if (!transcript) { setError(id, warning || "Couldn't hear the correction — try again"); setFixPhase('idle'); return; }
        const merged = await generateFromTranscript(transcript, draft?.extraction?._raw || null);
        mergeExtraction(id, { ...merged, medicines: (draft?.extraction?.medicines?.length ? draft.extraction.medicines : merged.medicines) || [] });
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

  /* ─── Complete ─── */
  const handleComplete = async () => {
    if (!current || completing) return;
    const id = current.id;
    const ex = draft?.extraction || {};
    setCompleting(true);
    try {
      await completeConsult(id, { ...ex, transcript: draft?.transcript || ex.transcript || '' });
      resetDraft(id);
      showToast(`${p?.name?.split(' ')[0] || 'Patient'} done · sent to front desk`);
    } catch (e) {
      showToast('Failed to save — try again');
    } finally {
      setCompleting(false);
    }
  };

  /* ─── Call in / swap ─── */
  const handleCallIn = (id) => {
    if (current) swapIn(id); else callIn(id);
  };

  /* ─── Render ─── */
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* slim top bar */}
      <div style={{ flexShrink: 0, padding: '54px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.push('/')} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: '0 16px 0 10px', borderRadius: 99, background: '#B91C1C', color: '#fff', fontSize: 15, fontWeight: 700 }}>
          <Icon name="chevLeft" size={18} color="#fff" /> Exit
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => loadQueue()} style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, padding: '6px 12px', borderRadius: 99, background: 'rgba(60,60,67,0.07)' }}>↻ Sync</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', animation: 'donePulse 1.5s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--orange)', textTransform: 'uppercase' }}>Live</span>
          </div>
        </div>
      </div>

      {!current ? (
        /* Empty chair */
        <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px 60px' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginBottom: 24 }}>
            <Icon name="userCheck" size={48} stroke={1.6} />
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12 }}>The chair is empty</div>
          </div>
          {waiting.length > 0 ? (
            <button onClick={() => handleCallIn(waiting[0].id)} className="tap" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 20, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
              <Icon name="arrowRight" size={28} color="var(--accent-ink)" />
              <div><div style={{ fontSize: 20, fontWeight: 700 }}>Call in {pById(waiting[0].patientId)?.name.split(' ')[0]}</div><div style={{ fontSize: 14, opacity: 0.85 }}>Token {waiting[0].tokenNumber} · {waiting.length} waiting</div></div>
            </button>
          ) : <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-tertiary)' }}>No one is waiting.</div>}
          {waiting.length > 1 && <WaitingQueue waiting={waiting.slice(1)} pById={pById} onCallIn={handleCallIn} label="Also waiting" />}
        </div>
      ) : !p ? (
        /* Loading patient */
        <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 24px 60px', gap: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>Loading patient…</div>
          <button onClick={() => { loadQueue(); loadPatients(); }} style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>Tap to retry</button>
        </div>
      ) : phase === 'recording' || phase === 'processing' ? (
        /* Voice capture — consistent with VoiceSheet */
        <div className="scroll" style={{ flex: 1, padding: '16px 20px 40px' }}>
          <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{p.name[0]}</div>
            <div><div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div><div className="t-meta">Token #{current.tokenNumber}</div></div>
          </div>
          {phase === 'recording' ? (
            <>
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
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '54px 0' }}>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>Understanding…</div>
              <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}</div>
            </div>
          )}
        </div>
      ) : phase === 'review' ? (
        /* Editable review */
        <div className="scroll" style={{ flex: 1 }}>
          <ConsultReview
            ex={draft?.extraction}
            error={draft?.error}
            onEditField={(k, v) => editField(current.id, k, v)}
            onAddMedicine={() => addMedicine(current.id)}
            onEditMedicine={(i, patch) => editMedicine(current.id, i, patch)}
            onRemoveMedicine={(i) => removeMedicine(current.id, i)}
            onFixByVoice={handleFixByVoice}
            fixPhase={fixPhase}
            fixSeconds={recorder.seconds}
            onRerecord={() => { setError(current.id, null); setPhase(current.id, 'idle'); }}
            onComplete={handleComplete}
            completing={completing}
          />
        </div>
      ) : (
        /* Idle — in chair */
        <div className="scroll" style={{ flex: 1 }}>
          <div style={{ padding: '16px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--orange)' }}>Now treating · Token {current.tokenNumber}</span>
              {current.priority === 'urgent' && <Chip label="Urgent" tone="red" />}
            </div>
            <button onClick={() => router.push('/patients/' + p.id)} className="tap" style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 20, padding: '16px 18px', boxShadow: 'var(--elevation-1)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{p.name}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{[p.age && `${p.age} yrs`, p.gender, p.bloodGroup].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <Icon name="chevRight" size={18} color="var(--text-tertiary)" />
                  <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>View profile</span>
                </div>
              </div>
              {flags.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,95,87,0.08)', borderRadius: 10, padding: '8px 12px', marginTop: 12 }}>
                  <Icon name="alert" size={15} color="var(--red)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{flags.join(' · ')}</span>
                </div>
              )}
              {current.chiefComplaint && (
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.45, color: 'var(--text-primary)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>"{current.chiefComplaint}"</div>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                {lastVisit && <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={13} color="var(--blue)" />Last visit {formatDate(lastVisit.date)}</span>}
                {hasRx && <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="pill" size={13} color="var(--blue)" />Has prescription</span>}
                {activeProc && <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Ongoing: {activeProc.type}</span>}
              </div>
            </button>
          </div>

          <PatientContext patientId={p.id} />

          {/* Dominant action + manual escape hatch */}
          <div style={{ padding: '26px 24px 0' }}>
            <button onClick={handleStartRecording} className="tap" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 22, padding: '24px', display: 'flex', alignItems: 'center', gap: 18, textAlign: 'left', boxShadow: 'var(--elevation-2)' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="mic" size={32} color="var(--accent-ink)" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>Record</div>
                <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2, lineHeight: 1.35 }}>Speak your findings — the plan, prescription and next visits file themselves.</div>
              </div>
            </button>
            <button onClick={() => startManual(current.id)} style={{ display: 'block', margin: '12px auto 0', fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>or fill in manually ›</button>
          </div>

          {waiting.length > 0 && <WaitingQueue waiting={waiting} pById={pById} onCallIn={handleCallIn} label="Waiting · tap to swap" />}
        </div>
      )}
    </div>
  );
}

/* Waiting queue — every patient is callable/swappable. */
function WaitingQueue({ waiting, pById, onCallIn, label }) {
  return (
    <div style={{ padding: '30px 24px 32px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
      {waiting.map((e, i) => {
        const wp = pById(e.patientId); if (!wp) return null;
        const longWait = minutesAgo(e.checkedInAt) > 25;
        return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 16.5, fontWeight: 600 }}>{wp.name}</span>
                {i === 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>· up next</span>}
                {e.priority === 'urgent' && <Chip label="Urgent" tone="red" />}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.chiefComplaint}{longWait ? ` · waiting ${waitLabel(e.checkedInAt)}` : ''}</div>
            </div>
            <button onClick={() => onCallIn(e.id)} className="tap" style={{ flexShrink: 0, fontSize: 13, color: 'var(--blue)', fontWeight: 700, background: 'rgba(0,110,230,0.08)', borderRadius: 99, padding: '7px 14px' }}>Call in</button>
          </div>
        );
      })}
    </div>
  );
}

export default function ConsultationPage() {
  return <ConsultModeScreen />;
}
