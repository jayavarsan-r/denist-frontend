'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { SheetHeader, PrimaryButton } from '@/components/ui';

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

function MagicMomentBody({ openSheet, showToast, visit, patient, proc, onClose }) {
  const items = [];
  items.push({ icon: 'checkCircle', text: `Visit ${visit.visitNumber} of ${visit.totalVisits} marked complete`, color: 'var(--green)' });
  items.push({ icon: 'doc', text: `Note saved to ${patient.name}'s history`, color: 'var(--text-primary)' });
  items.push({ icon: 'calendar', text: 'Next appointment suggested · Thu 5 Jun', color: 'var(--blue)', tap: true });
  if (proc && proc.type === 'RCT') items.push({ icon: 'flask', text: 'Crown procedure now pending — lab order needed', color: 'var(--blue)', tap: true, action: () => { onClose(); openSheet('newLab', { patientId: patient.id }); } });
  items.push({ icon: 'rupee', text: 'Payment reminder set', color: 'var(--blue)', tap: true });

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Done. Here's what changed:" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        {items.map((it, i) => (
          <div key={i} className="card" onClick={it.action} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, animation: `cascadeIn .4s ease ${i * 0.08}s both`, cursor: it.tap ? 'pointer' : 'default' }}>
            <Icon name={it.icon} size={20} color={it.color} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: it.tap ? 'var(--blue)' : 'var(--text-primary)' }}>{it.text}</span>
            {it.tap && <Icon name="chevRight" size={16} color="var(--blue)" />}
          </div>
        ))}
      </div>
      <PrimaryButton onClick={onClose}>Done</PrimaryButton>
    </div>
  );
}

export default function EndVisitSheet({ params, onClose }) {
  const openSheet = useAppStore((s) => s.openSheet);
  const showToast = useAppStore((s) => s.showToast);
  const visits = useVisitStore((s) => s.visits);
  const updateVisit = useVisitStore((s) => s.updateVisit);
  const patients = usePatientStore((s) => s.patients);
  const procedures = useClinicalStore((s) => s.procedures);
  const advanceProcedure = useClinicalStore((s) => s.advanceProcedure);
  const v = visits.find(x => x.id === params.id);
  const p = v && patients.find(x => x.id === v.patientId);
  const [phase, setPhase] = useState('capture'); // capture | recording | magic
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState('');
  if (!v || !p) return null;

  const proc = procedures.find(x => x.id === v.procedureId);

  const dictate = () => {
    setPhase('recording');
    setTimeout(() => {
      setNotes('Cleaning & shaping completed on all canals. Calcium hydroxide dressing placed, temporary restoration given.');
      setNext('Obturation next visit. Patient tolerating well.');
      setPhase('capture');
    }, 2600);
  };

  const save = () => {
    updateVisit(v.id, { status: 'done', proceduresDone: notes, clinicalNotes: notes, nextSteps: next });
    if (proc) advanceProcedure(proc.id);
    setPhase('magic');
  };

  if (phase === 'magic') return <MagicMomentBody openSheet={openSheet} showToast={showToast} visit={v} patient={p} proc={proc} onClose={onClose} />;

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="What was done?" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 18px' }}>
        <button onClick={dictate} style={{ width: 84, height: 84, borderRadius: '50%', background: phase === 'recording' ? 'var(--red)' : 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)', animation: phase === 'recording' ? 'donePulse 1.2s infinite' : 'none' }}>
          <Icon name="mic" size={40} color="#fff" />
        </button>
        <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 14 }}>{phase === 'recording' ? 'Listening…' : 'Tap to dictate'}</div>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe this visit…" className="card" style={{ width: '100%', minHeight: 90, padding: 14, fontSize: 15, fontFamily: 'inherit', border: 'none', resize: 'none', outline: 'none', marginBottom: 12 }} />
      <textarea value={next} onChange={e => setNext(e.target.value)} placeholder="Next steps…" className="card" style={{ width: '100%', minHeight: 56, padding: 14, fontSize: 15, fontFamily: 'inherit', border: 'none', resize: 'none', outline: 'none', marginBottom: 18 }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={onClose} style={{ width: 70, fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500, height: 52 }}>Skip</button>
        <PrimaryButton onClick={save}>Save to history</PrimaryButton>
      </div>
    </div>
  );
}
