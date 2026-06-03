'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { Chip, StageDots, StatusChip } from '@/components/ui';
import { formatDate, clinicianFlags } from '@/lib/data/utils';
import { minutesAgo, waitLabel } from '@/lib/data/queue';
import { useQueueRealtime } from '@/lib/hooks/useQueueRealtime';

function ConsultModeScreen() {
  useQueueRealtime(); // load + subscribe on mount
  const router = useRouter();
  const openSheet = useAppStore(s => s.openSheet);
  const showToast = useAppStore(s => s.showToast);
  const queue = useQueueStore(s => s.queue);
  const callIn = useQueueStore(s => s.callIn);
  const patients = usePatientStore(s => s.patients);
  const visits = useVisitStore(s => s.visits);
  const procedures = useClinicalStore(s => s.procedures);
  const prescriptions = useClinicalStore(s => s.prescriptions);

  const pById = id => patients.find(p => p.id === id);
  const current = queue.find(e => e.status === 'in_consultation');
  const waiting = queue.filter(e => e.status === 'waiting');
  const p = current && pById(current.patientId);

  const lastVisit = p && visits.filter(v => v.patientId === p.id && v.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeProc = p && procedures.filter(x => x.patientId === p.id && (x.status === 'in_progress' || x.status === 'planned')).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
  const hasRx = p && prescriptions.some(r => r.patientId === p.id);
  const flags = p ? clinicianFlags(p) : [];

  const handleCallIn = (id) => {
    if (queue.some(e => e.status === 'in_consultation')) {
      showToast('Finish the current consult first');
      return;
    }
    callIn(id);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* slim top bar — Exit lives top-left (where leaving always is); Live signals the mode */}
      <div style={{ flexShrink: 0, paddingTop: 54, padding: '54px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.push('/')} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px 0 12px', borderRadius: 19, background: 'rgba(60,60,67,0.07)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
          <Icon name="chevLeft" size={20} color="var(--text-primary)" /> Exit
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', animation: 'donePulse 1.5s infinite' }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--orange)', textTransform: 'uppercase' }}>Live</span>
        </div>
      </div>

      {!current ? (
        <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px 60px' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginBottom: 24 }}>
            <Icon name="userCheck" size={48} stroke={1.6} />
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12 }}>The chair is empty</div>
          </div>
          {waiting.length > 0 ? (
            <button onClick={() => handleCallIn(waiting[0].id)} className="tap" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 20, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
              <Icon name="arrowRight" size={28} color="var(--accent-ink)" />
              <div><div style={{ fontSize: 20, fontWeight: 700 }}>Call in {pById(waiting[0].patientId)?.name.split(' ')[0]}</div><div style={{ fontSize: 14, opacity: 0.85 }}>Token {waiting[0].tokenNumber} · {waiting.length} waiting</div></div>
            </button>
          ) : <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-tertiary)' }}>No one is waiting.</div>}
        </div>
      ) : (
        <div className="scroll" style={{ flex: 1 }}>
          {/* patient focus — flows on the surface, no box */}
          <div style={{ padding: '20px 24px 0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--orange)', marginBottom: 8 }}>Now treating · Token {current.tokenNumber}</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{p.name}</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 3 }}>{p.age} · {p.gender} · {p.bloodGroup}</div>

            {/* medical risk — the one thing that must never be missed */}
            {flags.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,59,48,0.07)', borderRadius: 12, padding: '11px 14px', marginTop: 14 }}>
                <Icon name="alert" size={17} color="var(--red)" /><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{flags.join(' · ')}</span>
              </div>
            )}

            {/* complaint — the clinical anchor */}
            <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.35, color: 'var(--text-primary)', margin: '18px 0 0', textWrap: 'pretty' }}>"{current.chiefComplaint}"</div>

            {/* quiet ongoing context */}
            {activeProc && (
              <div style={{ fontSize: 14.5, color: 'var(--text-secondary)', marginTop: 12 }}>
                Ongoing: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeProc.type}{activeProc.tooth ? ' · Tooth ' + activeProc.tooth : ''}</span> — {activeProc.currentStage}{activeProc.status === 'in_progress' ? ` · visit ${activeProc.completedVisits + 1} of ${activeProc.estimatedVisits}` : ''}
              </div>
            )}

            {/* reference links — reachable without leaving the flow */}
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/patients/' + p.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 14.5, fontWeight: 600 }}><Icon name="clock" size={15} color="var(--blue)" />History{lastVisit ? ' · ' + formatDate(lastVisit.date) : ''}</button>
              {hasRx && <button onClick={() => router.push('/patients/' + p.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 14.5, fontWeight: 600 }}><Icon name="pill" size={15} color="var(--blue)" />Previous Rx</button>}
              {current.xrays && current.xrays.length > 0 && <button onClick={() => showToast('Opening ' + current.xrays[0].type)} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 14.5, fontWeight: 600 }}><Icon name="image" size={15} color="var(--blue)" />{current.xrays[0].type}</button>}
            </div>
          </div>

          {/* THE dominant action */}
          <div style={{ padding: '26px 24px 0' }}>
            <button onClick={() => openSheet('recordDiagnosis', { id: current.id })} className="tap" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 22, padding: '24px', display: 'flex', alignItems: 'center', gap: 18, textAlign: 'left', boxShadow: 'var(--elevation-2)' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="mic" size={32} color="var(--accent-ink)" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>Record diagnosis</div>
                <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2, lineHeight: 1.35 }}>Speak your findings — the plan, prescription and next visits file themselves.</div>
              </div>
            </button>
          </div>

          {/* queue — quiet, human language */}
          {waiting.length > 0 && (
            <div style={{ padding: '30px 24px 32px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>Next patient</div>
              {waiting.map((e, i) => {
                const wp = pById(e.patientId); if (!wp) return null;
                const longWait = minutesAgo(e.checkedInAt) > 25;
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 16.5, fontWeight: 600 }}>{wp.name}</span>
                        {i === 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>· up next</span>}
                        {e.priority === 'urgent' && <Chip label="Urgent" tone="red" />}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.chiefComplaint}</div>
                    </div>
                    {longWait && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', flexShrink: 0 }}>waiting {waitLabel(e.checkedInAt)}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConsultationPage() {
  return <ConsultModeScreen />;
}
