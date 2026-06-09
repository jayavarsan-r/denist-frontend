'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Avatar, PrimaryButton, SelectPill } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';

export default function WalkInSheet({ onClose }) {
  const openSheet = useAppStore((s) => s.openSheet);
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const addVisit = useVisitStore((s) => s.addVisit);
  const [pid, setPid] = useState(null);
  const [type, setType] = useState('Scaling');
  const [dur, setDur] = useState(30);
  const add = () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`;
    addVisit({ id: 'v' + Date.now(), patientId: pid, procedureId: null, date: TODAY, startTime: time, durationMinutes: dur, status: 'arrived', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] });
    onClose(); showToast('Added to schedule');
  };
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Consultation patient" onClose={onClose} />
      <SectionHeader right={<button onClick={() => { onClose(); openSheet('newPatient'); }} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 500 }}>Or create new →</button>}>Patient</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
        {patients.map((p, i) => (
          <button key={p.id} onClick={() => setPid(p.id)} className="rowtap" style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
            <Avatar name={p.name} size={36} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{p.name}</span>
            {pid === p.id && <Icon name="check" size={20} color="var(--blue)" stroke={2.6} />}
          </button>
        ))}
      </div>
      <SectionHeader>Procedure</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{['RCT', 'Extraction', 'Scaling', 'Crown', 'Implant', 'Other'].map(t => <SelectPill key={t} label={t} active={type === t} onClick={() => setType(t)} />)}</div>
      <SectionHeader>Duration</SectionHeader>
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>{[30, 45, 60, 90].map(d => <SelectPill key={d} label={d + ' min'} active={dur === d} onClick={() => setDur(d)} accentDark={false} />)}</div>
      <PrimaryButton onClick={() => pid ? add() : showToast('Pick a patient')}>Add to schedule</PrimaryButton>
    </div>
  );
}
