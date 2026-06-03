'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { Avatar, StageDots, StatusChip, NavBar } from '@/components/ui';
import { formatTime, hasComplications } from '@/lib/data/utils';

function currentStageIndex(proc) {
  const i = proc.stages.findIndex(s => !s.completed);
  return i === -1 ? proc.stages.length - 1 : i;
}

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
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
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
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AppointmentScreen({ visitId }) {
  const router = useRouter();
  const openSheet = useAppStore(s => s.openSheet);
  const showToast = useAppStore(s => s.showToast);
  const visits = useVisitStore(s => s.visits);
  const updateVisit = useVisitStore(s => s.updateVisit);
  const patients = usePatientStore(s => s.patients);
  const procedures = useClinicalStore(s => s.procedures);

  const v = visits.find(x => x.id === visitId);
  const p = v && patients.find(x => x.id === v.patientId);
  const proc = v && procedures.find(x => x.id === v.procedureId);
  const [notes, setNotes] = React.useState(v ? v.proceduresDone : '');
  const [next, setNext] = React.useState(v ? v.nextSteps : '');
  if (!v || !p) return null;

  const advance = () => {
    if (v.status === 'confirmed') { updateVisit(v.id, { status: 'arrived' }); showToast('Marked arrived'); }
    else if (v.status === 'arrived') { openSheet('endVisit', { id: v.id }); }
  };

  const Row = ({ k, val }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border-light)' }}>
      <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span>
      <span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{val}</span>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar title="Appointment" onBack={() => router.back()} right={<button onClick={advance}><StatusChip status={v.status} /></button>} />
      <div className="scroll" style={{ flex: 1, padding: '16px 20px 28px' }}>
        {/* patient */}
        <button onClick={() => router.push('/patients/' + p.id)} className="card tap" style={{ width: '100%', padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, textAlign: 'left' }}>
          <Avatar name={p.name} size={44} dot={hasComplications(p)} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 600 }}>{p.name}</div><div className="t-meta">Tap to view profile</div></div>
          <Icon name="chevRight" size={18} color="var(--text-tertiary)" />
        </button>

        {/* status stepper */}
        <div className="card" style={{ padding: '16px 12px 12px', marginBottom: 16 }}>
          <StatusStepper status={v.status} />
          {v.status !== 'done' && <button onClick={advance} className="btn-dark" style={{ height: 44, marginTop: 8, width: '100%' }}>{v.status === 'confirmed' ? 'Mark arrived' : 'Complete visit'}</button>}
        </div>

        {/* procedure context */}
        <div className="card" style={{ padding: '4px 16px 14px', marginBottom: 16 }}>
          <Row k="Procedure" val={proc ? proc.type : 'Consultation'} />
          {proc && proc.tooth && <Row k="Tooth" val={proc.tooth} />}
          <Row k="Visit" val={`${v.visitNumber} of ${v.totalVisits}`} />
          <Row k="Time" val={formatTime(v.startTime).label} />
          <Row k="Duration" val={`${v.durationMinutes} min`} />
        </div>

        {proc && (
          <div style={{ marginBottom: 16, padding: '0 4px' }}>
            <StageDots stages={proc.stages} currentIndex={currentStageIndex(proc)} />
            <div className="t-meta" style={{ marginTop: 8 }}>{proc.type} · Visit {v.visitNumber} of {v.totalVisits}</div>
          </div>
        )}

        {p.chiefComplaint && (
          <div style={{ marginBottom: 16 }}>
            <div className="t-section" style={{ marginBottom: 3 }}>Chief complaint</div>
            <div style={{ fontSize: 15, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{p.chiefComplaint}</div>
          </div>
        )}

        {/* visit notes */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="t-section">Visit notes</span>
            <button onClick={() => openSheet('voice', { scope: 'visit', patientId: p.id })} style={{ color: 'var(--text-secondary)', display: 'flex' }}><Icon name="mic" size={18} /></button>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Tap mic or type what was done…" style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', minHeight: 60, fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          <div className="t-section" style={{ margin: '6px 0 4px' }}>Next steps</div>
          <textarea value={next} onChange={e => setNext(e.target.value)} placeholder="What comes next…" style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', minHeight: 40, fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
        </div>

        {/* actions */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <button onClick={() => showToast('Reminder sent via WhatsApp')} className="rowtap" style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', textAlign: 'left' }}>
            <Icon name="whatsapp" size={20} color="#1E8E3E" /><span style={{ fontSize: 15 }}>Send appointment reminder</span>
          </button>
          <button onClick={() => { updateVisit(v.id, { status: 'no_show' }); showToast('Marked as no-show'); }} className="rowtap" style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderTop: '1px solid var(--border-light)', textAlign: 'left' }}>
            <Icon name="x" size={20} color="var(--text-secondary)" /><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Mark as no-show</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default AppointmentScreen;
