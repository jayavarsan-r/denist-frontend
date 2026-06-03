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
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';

const FREQ_OPTIONS = ['OD', 'BD', 'TDS', 'SOS', 'HS'];

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
  const [phase, setPhase] = useState('idle');
  const [expanded, setExpanded] = useState(null);

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription();

  const addMed = (name) => { if (meds.some(m => m.name === name)) { setMeds(meds.filter(m => m.name !== name)); return; } setMeds([...meds, { name, dosage: '1 tab', frequency: 'BD', duration: '5 days', notes: '' }]); };
  const updateMed = (i, patch) => setMeds(meds.map((m, j) => j === i ? { ...m, ...patch } : m));

  const dictate = async () => {
    if (recorder.isRecording) {
      // Stop recording, transcribe, and let backend extract medicines
      setPhase('processing');
      try {
        const blob = await recorder.stopRecording();
        const transcript = await transcribe(blob);
        const result = await createPrescription({ patientId: params.patientId, rawVoice: transcript });
        // Populate medicines from backend response
        if (result && result.medicines && result.medicines.length > 0) {
          setMeds(result.medicines.map(m => ({
            name: m.name || '',
            dosage: m.dosage || m.dose || '1 tab',
            frequency: m.frequency || 'BD',
            duration: m.duration || '5 days',
            notes: m.notes || m.instructions || '',
            uncertain: m.uncertain || false,
          })));
        }
        if (result && result.instructions) setInstructions(result.instructions);
        if (result && result.followUpDays) setFollowUp(result.followUpDays);
        setPhase('idle');
      } catch(e) {
        showToast(e?.response?.data?.message || 'Dictation failed');
        setPhase('idle');
      }
      return;
    }
    // Start recording
    try {
      await recorder.startRecording();
      setPhase('recording');
    } catch(e) {
      showToast(e.message || 'Microphone unavailable');
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
      // If there's an existing prescription ID, open it directly
      if (existing && existing.id) {
        window.open(getPrescriptionPdfUrl(existing.id), '_blank');
        return;
      }
      // Otherwise save first then open PDF
      const result = await createPrescription({
        patientId: params.patientId,
        medicines: meds,
        instructions,
        followUpDays: followUp,
      });
      const rxId = result.id || result.prescription_id;
      if (rxId) {
        window.open(getPrescriptionPdfUrl(rxId), '_blank');
      } else {
        showToast('Generating prescription…');
      }
    } catch(e) {
      showToast(e?.response?.data?.message || 'Could not generate PDF');
    }
  };

  const isRecording = recorder.isRecording;

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Prescription" onClose={onClose} />
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{p ? p.name : ''}</span>
        <span className="t-meta">{formatDate(TODAY)}</span>
      </div>

      <SectionHeader right={<button onClick={dictate} style={{ color: isRecording ? 'var(--red)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500 }}><Icon name="mic" size={16} />{isRecording ? 'Listening…' : phase === 'processing' ? 'Processing…' : 'Dictate'}</button>}>Medicines</SectionHeader>
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

      <Field label="Instructions" multiline value={instructions} onChange={setInstructions} placeholder="Special instructions (after food, avoid spicy food)…" mic minHeight={50} onMic={() => showToast('Listening…')} />
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
