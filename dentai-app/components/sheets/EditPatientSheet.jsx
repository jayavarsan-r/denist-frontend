'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { SheetHeader, SectionHeader, PrimaryButton, PillToggle, Segmented, Field } from '@/components/ui';

const FLAG_DEFS = [
  ['isOnBloodThinners', 'Blood thinner'], ['hasDiabetes', 'Diabetes'], ['hasHeartCondition', 'Heart condition'],
  ['isPregnant', 'Pregnancy'], ['hasHypertension', 'Hypertension'], ['penicillin', 'Penicillin allergy'], ['latex', 'Latex allergy'],
];

export default function EditPatientSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const updatePatient = usePatientStore((s) => s.updatePatient);
  const p = patients.find(x => x.id === params.id);
  const [form, setForm] = useState({ ...p });
  const [flags, setFlags] = useState({ hasDiabetes: p.hasDiabetes, hasHypertension: p.hasHypertension, hasHeartCondition: p.hasHeartCondition, isPregnant: p.isPregnant, isOnBloodThinners: p.isOnBloodThinners, penicillin: p.allergies.includes('Penicillin'), latex: p.allergies.includes('Latex') });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    const allergies = []; if (flags.penicillin) allergies.push('Penicillin'); if (flags.latex) allergies.push('Latex');
    updatePatient(p.id, { ...form, ...flags, allergies });
    showToast('Saved'); onClose();
  };
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Edit patient" onClose={onClose} right={<button onClick={save} className="btn-dark" style={{ height: 34, padding: '0 16px', borderRadius: 10, fontSize: 14 }}>Save</button>} />
      <SectionHeader>Identity</SectionHeader>
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name" value={form.name} onChange={v => set('name', v)} />
        <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} type="tel" />
      </div>
      <SectionHeader>Demographics</SectionHeader>
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><div className="t-section" style={{ marginBottom: 8 }}>Gender</div><Segmented options={['Male', 'Female', 'Other']} value={form.gender} onChange={v => set('gender', v)} /></div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}><Field label="Age" value={String(form.age)} onChange={v => set('age', parseInt(v) || 0)} type="tel" /></div>
          <div style={{ flex: 1 }}><Field label="Blood group" value={form.bloodGroup} onChange={v => set('bloodGroup', v)} /></div>
        </div>
      </div>
      <Field label="Chief complaint" multiline value={form.chiefComplaint} onChange={v => set('chiefComplaint', v)} mic minHeight={44} onMic={() => showToast('Listening…')} />
      <div style={{ height: 18 }} />
      <SectionHeader>Clinical flags</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>{FLAG_DEFS.map(([k, label]) => <PillToggle key={k} label={label} active={!!flags[k]} onClick={() => setFlags(f => ({ ...f, [k]: !f[k] }))} />)}</div>
      <Field label="Clinical notes" multiline value={form.clinicalNotes} onChange={v => set('clinicalNotes', v)} mic minHeight={60} onMic={() => showToast('Listening…')} />
      <div style={{ height: 22 }} />
      <PrimaryButton onClick={save}>Save changes</PrimaryButton>
    </div>
  );
}
