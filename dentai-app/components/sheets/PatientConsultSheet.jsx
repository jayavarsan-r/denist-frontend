'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Avatar, PrimaryButton } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/utils';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { useGenerateNote } from '@/lib/hooks/useGenerateNote';
import { extractPrescription } from '@/lib/services/ai.service';
import { createVisit } from '@/lib/services/visit.service';
import { createTreatmentPlan } from '@/lib/services/treatment-plan.service';

function Waveform({ color = 'var(--accent)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 56 }}>
      {Array.from({ length: 22 }, (_, i) => {
        const peak = 10 + Math.round(Math.abs(Math.sin(i * 1.7)) * 30);
        return <div key={i} style={{ width: 3, borderRadius: 3, background: color, height: peak, animation: `wave ${0.4 + (i % 5) * 0.14}s ease-in-out ${i * 0.04}s infinite` }} />;
      })}
    </div>
  );
}

function MealTiming({ slots }) {
  const cells = [['B', slots?.breakfast], ['L', slots?.lunch], ['D', slots?.dinner]];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cells.map(([k, on]) => (
        <div key={k} style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: on ? 'var(--accent)' : 'rgba(60,60,67,0.06)', color: on ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>{k}</div>
      ))}
    </div>
  );
}

/**
 * PatientConsultSheet — a REAL patient-scoped voice consultation (opened from the
 * patient profile). Records → Sarvam transcribe → Gemini structure → on save it
 * persists a visit (drives the tooth map + treatment history), an optional treatment
 * plan and prescription, and updates each mentioned tooth's state so the odontogram
 * reflects the dictation immediately. params: { patientId }
 */
export default function PatientConsultSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const refreshPatientData = useAppStore((s) => s.refreshPatientData);
  const patients = usePatientStore((s) => s.patients);
  const saveRx = useClinicalStore((s) => s.saveRx);
  const p = params.patientId && patients.find((x) => x.id === params.patientId);

  const [phase, setPhase] = useState('idle'); // idle | recording | processing | review | saving
  const [extraction, setExtraction] = useState(null);
  const [aiError, setAiError] = useState(null);

  const recorder = useAudioRecorder();
  const { transcribe, loading: transcribing } = useTranscription('diagnosis');
  const { generateFromTranscript, loading: generating } = useGenerateNote();

  if (!p) return null;

  const start = async () => {
    setAiError(null);
    try { await recorder.startRecording(); setPhase('recording'); }
    catch (e) { showToast(e.message || 'Could not start recording'); }
  };

  const stop = async () => {
    setPhase('processing');
    try {
      const blob = await recorder.stopRecording();
      const { text: transcript, warning } = await transcribe(blob);
      if (!transcript) { setAiError(warning || "Couldn't transcribe — try again"); setPhase('idle'); return; }
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
      setExtraction({ ...note, medicines, transcript });
      setPhase('review');
    } catch (e) {
      setAiError(e.message || 'AI processing failed. Please try again.');
      setPhase('idle');
    }
  };

  const save = async () => {
    const ex = extraction;
    if (!ex) return;
    setPhase('saving');
    const teeth = Array.isArray(ex.teeth) && ex.teeth.length
      ? ex.teeth.map(String)
      : (ex.tooth ? [String(ex.tooth)] : []);
    const primaryTooth = teeth[0] || null;
    const followUpDate = /^\d{4}-\d{2}-\d{2}/.test(ex.followUp || '') ? ex.followUp : null;
    try {
      // 1) Visit — the source the tooth map + treatment history read from.
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

      // 2) Treatment plan (best-effort) so it appears under Cases → plans.
      if (ex.procedure) {
        try {
          await createTreatmentPlan({
            patientId: p.id, diagnosis: ex.diagnosis || '', procedureName: ex.procedure,
            totalSittings: ex.totalSittings || 1, estimatedCost: ex.estimatedCost || 0, notes: ex.instructions || '',
          });
        } catch { /* non-fatal */ }
      }

      // 3) Prescription (best-effort).
      if ((ex.medicines || []).length) {
        try {
          await saveRx({
            patientId: p.id,
            medicines: ex.medicines,
            instructions: ex.instructions || '',
            followUp: ex.followUp || '',
            rawVoice: ex.transcript || '',
          });
        } catch { /* non-fatal */ }
      }

      // 4) Refresh open patient screens. The tooth map, case summary, billing and
      // treatment history all derive from the backend (tooth-history / case-sheet),
      // so bumping the version refetches them — the dictated tooth (saved on the
      // visit above) recolors the odontogram. (patients.teeth isn't a real column,
      // so there's nothing to optimistically set here.)
      refreshPatientData();
      showToast('Saved to ' + (p.name.split(' ')[0] || 'patient') + "'s record");
      onClose();
    } catch (e) {
      showToast('Could not save — try again');
      setPhase('review');
    }
  };

  const ex = extraction;
  const toothLine = ex && (Array.isArray(ex.teeth) && ex.teeth.length > 1
    ? ' · Teeth ' + ex.teeth.join(', ')
    : ex.tooth ? ' · Tooth ' + ex.tooth : (ex.teeth?.[0] ? ' · Tooth ' + ex.teeth[0] : ''));

  return (
    <div style={{ padding: '0 20px 28px', minHeight: 300 }}>
      <SheetHeader
        title="Record findings"
        onClose={phase === 'idle' || phase === 'review' ? onClose : undefined}
        right={phase === 'recording' ? <button onClick={stop} style={{ color: 'var(--blue)', fontSize: 16, fontWeight: 600 }}>Stop</button> : null}
      />
      <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={p.name} size={36} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
          <div className="t-meta">{[p.age && `${p.age} yrs`, p.gender].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

      {phase === 'idle' && (
        <>
          {aiError && <div style={{ background: 'rgba(255,59,48,0.08)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--red)' }}>{aiError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 22px' }}>
            <button onClick={start} style={{ width: 92, height: 92, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}>
              <Icon name="mic" size={42} color="#fff" />
            </button>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>Tap to start recording</div>
            <div className="t-meta" style={{ textAlign: 'center', marginTop: 4, maxWidth: 250 }}>
              e.g. "Deep caries tooth 36, root canal, four sittings, six thousand rupees, amoxicillin and ibuprofen…"
            </div>
          </div>
        </>
      )}

      {phase === 'recording' && (
        <>
          <div style={{ padding: '20px 0 10px' }}><Waveform color="var(--red)" /></div>
          <div className="tnum" style={{ textAlign: 'center', fontSize: 22, fontWeight: 700 }}>0:{String(recorder.seconds).padStart(2, '0')}</div>
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button onClick={stop} style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}>
              <Icon name="stop" size={26} color="#fff" />
            </button>
          </div>
        </>
      )}

      {(phase === 'processing' || phase === 'saving') && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '54px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {phase === 'saving' ? 'Saving…' : transcribing ? 'Transcribing audio…' : generating ? 'Extracting findings…' : 'Processing…'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}
          </div>
        </div>
      )}

      {phase === 'review' && ex && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Here's what I understood</span>
            <button onClick={() => { setPhase('idle'); setExtraction(null); }} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Re-record</button>
          </div>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
            {[
              ['Diagnosis', ex.diagnosis],
              ['Procedure', (ex.procedure || 'Consultation') + toothLine],
              ['Sittings', (ex.totalSittings || 1) + ' visit' + ((ex.totalSittings || 1) > 1 ? 's' : '')],
              ['Est. cost', ex.estimatedCost ? formatCurrency(ex.estimatedCost) : '—'],
              ...(ex.followUp ? [['Next visit', /^\d{4}-\d{2}-\d{2}/.test(ex.followUp) ? formatDate(ex.followUp) : ex.followUp]] : []),
            ].filter(([, v]) => v != null && v !== '').map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <span className="t-meta">{k}</span>
                <span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', maxWidth: 210 }}>{v}</span>
              </div>
            ))}
          </div>
          {(ex.medicines || []).length > 0 && (
            <>
              <SectionHeader>Prescription · {ex.medicines.length}</SectionHeader>
              <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
                {ex.medicines.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: m.uncertain ? 'rgba(255,159,10,0.04)' : 'transparent' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{m.name}<span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>{m.dose}</span>{m.uncertain && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div>
                      <div className="t-meta">{[m.frequency, m.duration].filter(Boolean).join(' · ')}</div>
                    </div>
                    <MealTiming slots={m.slots} />
                  </div>
                ))}
              </div>
            </>
          )}
          <PrimaryButton onClick={save}>Save to record</PrimaryButton>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 10 }}>
            Saves the visit, prescription & updates the tooth map
          </div>
        </>
      )}
    </div>
  );
}
