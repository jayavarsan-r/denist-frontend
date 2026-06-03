'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Avatar, PrimaryButton } from '@/components/ui';
import { SAMPLE_EXTRACTION } from '@/lib/data/queue';
import { formatCurrency } from '@/lib/data/utils';

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

function MealTiming({ slots }) {
  const cells = [['B', slots.breakfast], ['L', slots.lunch], ['D', slots.dinner]];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cells.map(([k, on]) => (
        <div key={k} style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: on ? 'var(--accent)' : 'rgba(60,60,67,0.06)', color: on ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>{k}</div>
      ))}
    </div>
  );
}

export default function RecordDiagnosisSheet({ params, onClose }) {
  const queue = useQueueStore((s) => s.queue);
  const completeConsult = useQueueStore((s) => s.completeConsult);
  const patients = usePatientStore((s) => s.patients);
  const entry = queue.find(e => e.id === params.id);
  const p = entry && patients.find(x => x.id === entry.patientId);
  const [phase, setPhase] = useState('idle'); // idle | recording | processing | review | done
  const [sec, setSec] = useState(0);
  const ex = SAMPLE_EXTRACTION;
  if (!entry || !p) return null;

  useEffect(() => {
    if (phase !== 'recording') return;
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const stop = () => { setPhase('processing'); setTimeout(() => setPhase('review'), 1300); };
  const create = () => {
    setPhase('done');
  };
  const finish = () => {
    completeConsult(entry.id, {
      diagnosis: ex.diagnosis, procedure: ex.procedure, tooth: ex.tooth, totalSittings: ex.totalSittings,
      sittingDone: 1, estimatedCost: ex.estimatedCost, medicines: ex.medicines, instructions: ex.instructions,
      followUp: ex.followUp, appointments: ex.appointments,
    });
    onClose();
  };

  if (phase === 'done') {
    const items = [
      { icon: 'checkCircle', text: 'Diagnosis saved to ' + p.name.split(' ')[0] + "'s history", color: 'var(--green)' },
      { icon: 'layers', text: `Treatment plan created · ${ex.procedure}, ${ex.totalSittings} sittings`, color: 'var(--text-primary)' },
      { icon: 'calendar', text: `${ex.appointments.length} future visits auto-scheduled`, color: 'var(--text-primary)' },
      { icon: 'pill', text: `Prescription ready · ${ex.medicines.length} medicines`, color: 'var(--text-primary)' },
      { icon: 'card', text: 'Sent to front desk for checkout', color: '#1B86B8' },
    ];
    return (
      <div style={{ padding: '0 20px 28px' }}>
        <SheetHeader title="Done. Patient checked out." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {items.map((it, i) => (
            <div key={i} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, animation: `cascadeIn .4s ease ${i * 0.09}s both` }}>
              <Icon name={it.icon} size={20} color={it.color} />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{it.text}</span>
            </div>
          ))}
        </div>
        <PrimaryButton onClick={finish}>Next patient</PrimaryButton>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px 28px', minHeight: 300 }}>
      <SheetHeader title="Record diagnosis" onClose={phase === 'idle' ? onClose : undefined} right={phase === 'recording' ? <button onClick={stop} style={{ color: 'var(--blue)', fontSize: 16, fontWeight: 600 }}>Stop</button> : null} />
      <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={p.name} size={36} /><div><div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div><div className="t-meta">Token #{entry.tokenNumber}</div></div>
      </div>

      {phase === 'idle' && <>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 22px' }}>
          <button onClick={() => { setSec(0); setPhase('recording'); }} style={{ width: 92, height: 92, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}><Icon name="mic" size={42} color="#fff" /></button>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>Tap to start recording</div>
          <div className="t-meta" style={{ textAlign: 'center', marginTop: 4, maxWidth: 240 }}>e.g. "Deep caries tooth 36, root canal, four sittings, six thousand rupees, amoxicillin and ibuprofen…"</div>
        </div>
      </>}

      {phase === 'recording' && <>
        <div style={{ padding: '20px 0 10px' }}><Waveform color="var(--red)" /></div>
        <div className="tnum" style={{ textAlign: 'center', fontSize: 22, fontWeight: 700 }}>0:{String(sec).padStart(2, '0')}</div>
        <div style={{ textAlign: 'center', marginTop: 18 }}><button onClick={stop} style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}><Icon name="stop" size={26} color="#fff" /></button></div>
      </>}

      {phase === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '54px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Extracting diagnosis…</div>
          <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}</div>
        </div>
      )}

      {phase === 'review' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Here's what I understood</span>
          <button onClick={() => { setSec(0); setPhase('recording'); }} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Re-record</button>
        </div>
        <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          {[['Diagnosis', ex.diagnosis], ['Procedure', ex.procedure + (ex.tooth ? ' · Tooth ' + ex.tooth : '')], ['Sittings', ex.totalSittings + ' visits'], ['Est. cost', formatCurrency(ex.estimatedCost)]].map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
              <span className="t-meta">{k}</span><span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', maxWidth: 200 }}>{v}</span>
            </div>
          ))}
        </div>
        <SectionHeader>Prescription · {ex.medicines.length}</SectionHeader>
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          {ex.medicines.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: m.uncertain ? 'rgba(255,159,10,0.04)' : 'transparent' }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{m.name} <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>{m.dose}</span>{m.uncertain && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div><div className="t-meta">{m.frequency} · {m.duration}</div></div>
              <MealTiming slots={m.slots} />
            </div>
          ))}
        </div>
        <PrimaryButton onClick={create}>Create plan & prescription</PrimaryButton>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 10 }}>Amber dot = please double-check before saving</div>
      </>}
    </div>
  );
}
