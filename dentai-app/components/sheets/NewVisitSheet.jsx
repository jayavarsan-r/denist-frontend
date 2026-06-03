'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { SheetHeader, SectionHeader, PrimaryButton, SelectPill } from '@/components/ui';

export default function NewVisitSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const addVisit = useVisitStore((s) => s.addVisit);
  const [pid, setPid] = useState(patients[0].id);
  const [type, setType] = useState('RCT');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [dur, setDur] = useState(45);
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="New appointment" onClose={onClose} />
      <SectionHeader>Patient</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{patients.map(p => <SelectPill key={p.id} label={p.name.split(' ')[0]} active={pid === p.id} onClick={() => setPid(p.id)} />)}</div>
      <SectionHeader>Procedure</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{['RCT', 'Extraction', 'Scaling', 'Crown', 'Implant'].map(t => <SelectPill key={t} label={t} active={type === t} onClick={() => setType(t)} />)}</div>
      <SectionHeader>Date & time</SectionHeader>
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, alignItems: 'center' }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 6 }}>{[30, 45, 60].map(d => <SelectPill key={d} label={d + 'm'} active={dur === d} onClick={() => setDur(d)} accentDark={false} />)}</div>
      </div>
      <PrimaryButton onClick={() => { addVisit({ patientId: pid, date: date, startTime: time, durationMinutes: dur, status: 'confirmed', type: type, purpose: type }); onClose(); showToast('Appointment scheduled'); }}>Schedule</PrimaryButton>
    </div>
  );
}
