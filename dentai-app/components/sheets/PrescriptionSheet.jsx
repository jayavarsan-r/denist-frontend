'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, PrimaryButton, SelectPill, Field } from '@/components/ui';
import { TODAY, FREQUENT_MEDICINES } from '@/lib/data/patients';
import { formatDate } from '@/lib/data/utils';
import { createPrescription, getPrescription, getPrescriptionPdfUrl } from '@/lib/services/prescription.service';
import { extractPrescription } from '@/lib/services/ai.service';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';

const FREQ_OPTIONS = ['OD', 'BD', 'TDS', 'SOS', 'HS'];

function RecordingWave() {
  const peaks = [4, 8, 14, 6, 20, 10, 24, 16, 22, 12, 24, 10, 20, 8, 16, 6, 18, 10, 14, 8, 6];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, width: '100%' }}>
      {peaks.map((h, i) => (
        <div key={i} style={{ width: 4, borderRadius: 4, background: 'rgba(255,255,255,0.9)', height: h, animation: `wave ${0.5 + (i % 5) * 0.1}s ease-in-out ${i * 0.04}s infinite alternate` }} />
      ))}
    </div>
  );
}

export default function PrescriptionSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const prescriptions = useClinicalStore((s) => s.prescriptions);
  const saveRx = useClinicalStore((s) => s.saveRx);
  const existing = params.rxId && prescriptions.find(r => r.id === params.rxId);
  const p = patients.find(x => x.id === params.patientId);
  const [meds, setMeds] = useState(existing ? existing.medicines : []);
  const [instructions, setInstructions] = useState(existing ? existing.instructions : '');
  const [followUp, setFollowUp] = useState(existing ? existing.followUpDays : 7);
  // phase: idle | recording | transcribing | extracting | done
  const [phase, setPhase] = useState('idle');
  // dictateMode: 'full' fills medicines+instructions+followUp via AI; 'instructions' just transcribes into the instructions field
  const [dictateMode, setDictateMode] = useState('full');
  const [transcript, setTranscript] = useState('');
  const [expanded, setExpanded] = useState(null);

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription();

  const addMed = (name) => { if (meds.some(m => m.name === name)) { setMeds(meds.filter(m => m.name !== name)); return; } setMeds([...meds, { name, dosage: '', frequency: '', duration: '', notes: '' }]); };
  const updateMed = (i, patch) => setMeds(meds.map((m, j) => j === i ? { ...m, ...patch } : m));

  const startDictate = async (mode = 'full') => {
    try {
      setDictateMode(mode);
      await recorder.startRecording();
      setPhase('recording');
      setTranscript('');
    } catch(e) {
      showToast(e.message || 'Microphone unavailable');
    }
  };

  const stopDictate = async () => {
    setPhase('transcribing');
    try {
      const blob = await recorder.stopRecording();
      // ── Step 1: Sarvam STT ──
      const { text, warning } = await transcribe(blob);
      if (warning && !text) { showToast(warning); setPhase('idle'); return; }
      setTranscript(text);

      if (dictateMode === 'instructions') {
        setInstructions(prev => prev ? prev + ' ' + text : text);
        setPhase('done');
        setTimeout(() => setPhase('idle'), 2000);
        return;
      }

      // ── Step 2: Gemini extraction for full prescription ──
      setPhase('extracting');
      const result = await extractPrescription(text);

      if (result.medicines?.length > 0) {
        setMeds(prev => {
          const existing = new Set(prev.map(m => m.name.toLowerCase()));
          const newMeds = result.medicines
            .filter(m => !existing.has((m.name || '').toLowerCase()))
            .map(m => ({
              name: m.name || '',
              dosage: m.dosage || m.dose || '1 tab',
              frequency: m.frequency || 'BD',
              duration: m.duration || '5 days',
              notes: m.notes || m.instructions || '',
              uncertain: m.uncertain || false,
            }));
          return [...prev, ...newMeds];
        });
      }
      if (result.instructions) setInstructions(result.instructions);
      // Backend returns `followUp` as a free-text instruction (e.g. "follow up in
      // 7 days"); the stepper needs a day count, so pull the first number out.
      const fuDays = result.followUpDays
        || parseInt(String(result.followUp || '').match(/\d+/)?.[0], 10);
      if (fuDays && !Number.isNaN(fuDays)) setFollowUp(fuDays);
      if (result.warning) showToast(result.warning);
      setPhase('done');
      setTimeout(() => setPhase('idle'), 2000);
    } catch(e) {
      showToast('Dictation failed — please try again');
      setPhase('idle');
    }
  };

  const save = async () => {
    try {
      const result = await createPrescription({
        patientId: params.patientId,
        medicines: meds,
        instructions,
        followUpDays: followUp,
      });
      // Also persist in local store for UI consistency
      saveRx({ id: result.id || result.prescription_id || ('rx' + Date.now()), patientId: params.patientId, patientName: p ? p.name : '', date: TODAY, medicines: meds, instructions, followUpDays: followUp });
      showToast('Prescription saved');
      onClose();
    } catch(e) {
      showToast(e?.response?.data?.message || 'Could not save prescription');
    }
  };

  const printPrescription = async () => {
    try {
      let rxId = existing?.id;
      if (!rxId) {
        const result = await createPrescription({
          patientId: params.patientId,
          medicines: meds,
          instructions,
          followUpDays: followUp,
        });
        rxId = result.id || result.prescription_id;
      }
      if (!rxId) { showToast('Could not generate prescription'); return; }

      const pdfUrl = getPrescriptionPdfUrl(rxId);
      const patientName = p ? p.name : 'Patient';

      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: `Prescription — ${patientName}`,
            text: `Prescription for ${patientName}`,
            url: pdfUrl,
          });
          return;
        } catch {}
      }
      // Fallback: open in browser
      window.open(pdfUrl, '_blank');
    } catch(e) {
      showToast(e?.response?.data?.message || 'Could not generate PDF');
    }
  };

  const isRecording = recorder.isRecording;
  const isMedsRecording = isRecording && dictateMode === 'full';
  const isInstructionsRecording = isRecording && dictateMode === 'instructions';

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Prescription" onClose={onClose} />
      {p && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</span>
          <span className="t-meta">{formatDate(TODAY)}</span>
        </div>
      )}

      <SectionHeader>Medicines</SectionHeader>

      {/* Dictate pill button */}
      <button
        onClick={isMedsRecording ? stopDictate : () => startDictate('full')}
        disabled={phase === 'transcribing' || phase === 'extracting'}
        style={{
          width: '100%', borderRadius: 99, border: 'none', cursor: 'pointer',
          background: isMedsRecording ? '#C0392B' : phase === 'done' && dictateMode === 'full' ? '#16A34A' : 'var(--accent)',
          transition: 'background .25s',
          display: 'flex',
          flexDirection: isMedsRecording ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isMedsRecording ? 'center' : 'flex-start',
          gap: isMedsRecording ? 6 : 14,
          padding: isMedsRecording ? '18px 20px 14px' : '14px 18px',
          marginBottom: 14,
        }}
      >
        {isMedsRecording ? (
          <>
            <RecordingWave />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Tap to finish</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Medicines · instructions · review days</div>
          </>
        ) : (
          <>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {phase === 'transcribing' || phase === 'extracting'
                ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />
                : phase === 'done' && dictateMode === 'full'
                ? <Icon name="check" size={22} color="#fff" stroke={2.5} />
                : <Icon name="mic" size={22} color="#fff" />}
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {phase === 'transcribing' ? 'Transcribing…' : phase === 'extracting' ? 'Filling prescription…' : phase === 'done' && dictateMode === 'full' ? 'Done!' : 'Dictate prescription'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                {phase === 'done' && dictateMode === 'full' ? 'Medicines · instructions · review filled' : 'Medicines · instructions · review — hands-free'}
              </div>
            </div>
          </>
        )}
      </button>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
        {meds.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Add medicines below or dictate</div>}
        {meds.map((m, i) => (
          <div key={i} style={{ borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div onClick={() => setExpanded(expanded === i ? null : i)} style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{m.name}{m.uncertain && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div>
                <div className="t-meta">{m.dosage} · {m.frequency} · {m.duration}{m.notes ? ' · ' + m.notes : ''}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setMeds(meds.filter((_, j) => j !== i)); }} style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Icon name="x" size={16} /></button>
            </div>
            {expanded === i && (
              <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={m.dosage} onChange={e => updateMed(i, { dosage: e.target.value })} placeholder="Dosage" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                  <input value={m.duration} onChange={e => updateMed(i, { duration: e.target.value })} placeholder="Duration" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>{FREQ_OPTIONS.map(f => <button key={f} onClick={() => updateMed(i, { frequency: f })} style={{ flex: 1, height: 32, borderRadius: 8, fontSize: 13, fontWeight: 600, background: m.frequency === f ? 'var(--accent)' : '#fff', color: m.frequency === f ? 'var(--accent-ink)' : 'var(--text-secondary)', border: m.frequency === f ? 'none' : '1px solid var(--border)' }}>{f}</button>)}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18, paddingBottom: 2 }}>
        {FREQUENT_MEDICINES.map(name => <SelectPill key={name} label={name} active={meds.some(m => m.name === name)} onClick={() => addMed(name)} />)}
      </div>

      <Field label="Instructions" multiline value={instructions} onChange={setInstructions} placeholder="Special instructions (after food, avoid spicy food)…" mic micActive={isInstructionsRecording} minHeight={50} onMic={isInstructionsRecording ? stopDictate : () => startDictate('instructions')} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 20px' }}>
        <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Review after</span>
        <input value={followUp || ''} onChange={e => setFollowUp(parseInt(e.target.value) || null)} inputMode="numeric" style={{ width: 48, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '6px', fontSize: 15, outline: 'none', fontFamily: 'inherit' }} className="tnum" />
        <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>days</span>
      </div>

      <PrimaryButton onClick={save}>Save</PrimaryButton>
      <button onClick={printPrescription} style={{ width: '100%', textAlign: 'center', color: 'var(--blue)', fontSize: 15, fontWeight: 500, padding: '14px 0 2px' }}>Print / Share</button>
    </div>
  );
}
