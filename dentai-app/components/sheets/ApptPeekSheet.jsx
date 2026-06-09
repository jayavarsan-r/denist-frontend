'use client';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { SheetHeader } from '@/components/ui';
import { formatTime } from '@/lib/data/utils';

function StatusStepper({ status }) {
  const steps = ['confirmed', 'arrived', 'done'];
  const labels = { confirmed: 'Confirmed', arrived: 'Arrived', done: 'Done' };
  const curIdx = steps.indexOf(status === 'no_show' ? 'confirmed' : status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
      {steps.map((s, i) => {
        const done = i < curIdx; const current = i === curIdx;
        const filled = done || current;
        return (
          <>
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filled ? 'var(--accent)' : '#fff', border: filled ? 'none' : '2px solid rgba(60,60,67,0.22)',
                animation: (current && s === 'done') ? 'donePulse 1.5s infinite' : 'none',
              }}>
                {done ? <Icon name="check" size={14} color="var(--accent-ink)" stroke={3} /> : <span style={{ fontSize: 12, fontWeight: 700, color: filled ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 12, fontWeight: current ? 600 : 500, color: filled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{labels[s]}</span>
            </div>
            {i < 2 && <div style={{ flex: 1, height: 2, background: i < curIdx ? 'var(--accent)' : 'rgba(60,60,67,0.18)', margin: '0 6px', marginBottom: 22 }} />}
          </>
        );
      })}
    </div>
  );
}

export default function ApptPeekSheet({ params, onClose }) {
  const openSheet = useAppStore((s) => s.openSheet);
  const visits = useVisitStore((s) => s.visits);
  const patients = usePatientStore((s) => s.patients);
  const v = visits.find(x => x.id === params.id);
  const p = v && patients.find(x => x.id === v.patientId);
  if (!v || !p) return null;
  const purpose = v.purpose || 'Consultation';
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={p.name} onClose={onClose} />
      <div className="t-meta" style={{ marginTop: -6, marginBottom: 14 }}>{purpose}{v.tooth ? ' · Tooth ' + v.tooth : ''} · {formatTime(v.startTime).label}</div>
      <div className="card" style={{ padding: '16px 12px', marginBottom: 16 }}><StatusStepper status={v.status} /></div>
      <button onClick={() => { onClose(); openSheet('endVisit', { id: v.id }); }} style={{ color: 'var(--blue)', fontSize: 15, fontWeight: 500 }}>Open full page →</button>
    </div>
  );
}
