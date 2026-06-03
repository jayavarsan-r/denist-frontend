'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, PrimaryButton, PillToggle, Field } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';

const FLAG_DEFS = [
  ['isOnBloodThinners', 'Blood thinner'], ['hasDiabetes', 'Diabetes'], ['hasHeartCondition', 'Heart condition'],
  ['isPregnant', 'Pregnancy'], ['hasHypertension', 'Hypertension'], ['penicillin', 'Penicillin allergy'], ['latex', 'Latex allergy'],
];

export default function NewPatientSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const addPatient = usePatientStore((s) => s.addPatient);
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [complaint, setComplaint] = useState(''); const [notes, setNotes] = useState('');
  const [flags, setFlags] = useState({});
  const [voiceDone, setVoiceDone] = useState(false);
  const [recording, setRecording] = useState(false);
  const [extracted, setExtracted] = useState(null);

  const doVoice = () => { setRecording(true); setTimeout(() => { setRecording(false); setVoiceDone(true); setExtracted([['Age', '34', false], ['Gender', 'Female', false], ['Blood group', 'O+', true], ['Conditions', 'None', false]]); }, 2600); };
  const toggle = (k) => setFlags(f => ({ ...f, [k]: !f[k] }));
  const create = () => {
    if (!name) { showToast('Add a name first'); return; }
    const allergies = []; if (flags.penicillin) allergies.push('Penicillin'); if (flags.latex) allergies.push('Latex');
    addPatient({ id: 'p' + Date.now(), name, phone, age: extracted ? 34 : 30, gender: 'Female', bloodGroup: 'O+', hasDiabetes: !!flags.hasDiabetes, hasHypertension: !!flags.hasHypertension, hasHeartCondition: !!flags.hasHeartCondition, isPregnant: !!flags.isPregnant, isOnBloodThinners: !!flags.isOnBloodThinners, allergies, currentMedications: [], clinicalNotes: notes, chiefComplaint: complaint, status: 'new', createdAt: TODAY, teeth: {} });
    showToast('Patient created'); onClose();
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="New patient" onClose={onClose} />
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <Field value={name} onChange={setName} placeholder="Full name" />
        <div style={{ height: 14 }} />
        <Field value={phone} onChange={setPhone} placeholder="Phone number" type="tel" />
      </div>

      <SectionHeader>Clinical info</SectionHeader>
      {!voiceDone ? (
        <button onClick={doVoice} style={{ width: '100%', border: '1.5px dashed var(--border)', borderRadius: 12, padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.5)', marginBottom: 18 }}>
          <Icon name="mic" size={recording ? 30 : 30} color={recording ? 'var(--red)' : 'var(--accent)'} style={recording ? { animation: 'donePulse 1.2s infinite', borderRadius: '50%' } : {}} />
          <span style={{ fontSize: 17, fontWeight: 600 }}>{recording ? 'Listening…' : 'Say patient details'}</span>
          <span className="t-meta" style={{ textAlign: 'center' }}>age, gender, blood group, conditions, allergies, medications</span>
        </button>
      ) : (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          {extracted.map(([k, val, unc], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: unc ? 'rgba(255,159,10,0.04)' : 'transparent' }}>
              <span className="t-meta">{k}</span><div style={{ display: 'flex', gap: 7, alignItems: 'center' }}><span style={{ fontSize: 15, fontWeight: 600 }}>{val}</span>{unc && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div>
            </div>
          ))}
        </div>
      )}

      <Field label="Chief complaint" multiline value={complaint} onChange={setComplaint} placeholder="Why is this patient here?" mic minHeight={44} onMic={() => showToast('Listening…')} />

      <div style={{ height: 18 }} />
      <SectionHeader>Clinical flags</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {FLAG_DEFS.map(([k, label]) => <PillToggle key={k} label={label} active={!!flags[k]} onClick={() => toggle(k)} />)}
      </div>

      <Field label="Notes" multiline value={notes} onChange={setNotes} placeholder="Add clinical notes…" mic minHeight={44} onMic={() => showToast('Listening…')} />

      <div style={{ height: 22 }} />
      <PrimaryButton onClick={create}>Create patient</PrimaryButton>
    </div>
  );
}
