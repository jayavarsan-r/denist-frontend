'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore, isInChair } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { useConsultStore } from '@/store/useConsultStore';
import Icon from '@/components/icons';
import { Chip } from '@/components/ui';
import { formatDate, clinicianFlags } from '@/lib/data/utils';
import { minutesAgo, waitLabel } from '@/lib/data/queue';
import { useQueueRealtime } from '@/lib/hooks/useQueueRealtime';
import PatientContext from '@/components/consultation/PatientContext';

function ConsultModeScreen() {
  useQueueRealtime();
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const queue = useQueueStore((s) => s.queue);
  const callIn = useQueueStore((s) => s.callIn);
  const swapIn = useQueueStore((s) => s.swapIn);
  const loadQueue = useQueueStore((s) => s.loadQueue);
  const patients = usePatientStore((s) => s.patients);
  const visits = useVisitStore((s) => s.visits);
  const procedures = useClinicalStore((s) => s.procedures);
  const prescriptions = useClinicalStore((s) => s.prescriptions);
  const fetchPatient = usePatientStore((s) => s.fetchPatient);
  const loadPatients = usePatientStore((s) => s.loadPatients);

  /* ─── Consult draft (keyed by queue-entry id) — the recorder/review drawer reads it ─── */
  const ensureDraft = useConsultStore((s) => s.ensureDraft);
  const startManual = useConsultStore((s) => s.startManual);

  const pById = (id) => patients.find((p) => p.id === id);
  const current = queue.find(isInChair);
  const waiting = queue.filter((e) => e.status === 'waiting').sort((a, b) => a.tokenNumber - b.tokenNumber);
  const p = current && pById(current.patientId);

  // Ensure a draft exists whenever a patient is in the chair.
  useEffect(() => { if (current?.id) ensureDraft(current.id); }, [current?.id]);

  // If the in-chair patient isn't in the local store yet, fetch them.
  useEffect(() => {
    if (!current?.patientId || p) return;
    fetchPatient(current.patientId).catch(() => { loadPatients().catch(() => {}); });
  }, [current?.patientId, !!p]);

  const lastVisit = p && visits.filter((v) => v.patientId === p.id && v.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeProc = p && procedures.filter((x) => x.patientId === p.id && (x.status === 'in_progress' || x.status === 'planned')).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
  const hasRx = p && prescriptions.some((r) => r.patientId === p.id);
  const flags = p ? clinicianFlags(p) : [];

  // Open the record → review → checkout drawer (ConsultRecordSheet). The tap on
  // Record IS the gesture — the drawer opens already recording.
  const openRecorder = () => { if (current) { ensureDraft(current.id); openSheet('consultRecord', { autoStart: true }); } };
  const openManual = () => { if (current) { startManual(current.id); openSheet('consultRecord'); } };

  /* ─── Call in / swap ─── */
  const handleCallIn = (id) => {
    if (current) swapIn(id); else callIn(id);
  };

  /* ─── Render ─── */
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* slim top bar */}
      <div style={{ flexShrink: 0, padding: '54px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => router.push('/')} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: '0 16px 0 10px', borderRadius: 99, background: '#B91C1C', color: '#fff', fontSize: 15, fontWeight: 700 }}>
          <Icon name="chevLeft" size={18} color="#fff" /> Exit
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => loadQueue()} style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, padding: '6px 12px', borderRadius: 99, background: 'rgba(60,60,67,0.07)' }}>↻ Sync</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', animation: 'donePulse 1.5s infinite' }} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--orange)', textTransform: 'uppercase' }}>Live</span>
          </div>
        </div>
      </div>

      {!current ? (
        /* Empty chair */
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
          {waiting.length > 1 && <WaitingQueue waiting={waiting.slice(1)} pById={pById} onCallIn={handleCallIn} label="Also waiting" />}
        </div>
      ) : !p ? (
        /* Loading patient */
        <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '0 24px 60px', gap: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>Loading patient…</div>
          <button onClick={() => { loadQueue(); loadPatients(); }} style={{ fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>Tap to retry</button>
        </div>
      ) : (
        /* In chair */
        <div className="scroll" style={{ flex: 1 }}>
          <div style={{ padding: '16px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--orange)' }}>Now treating · Token {current.tokenNumber}</span>
              {current.priority === 'urgent' && <Chip label="Urgent" tone="red" />}
            </div>
            <button onClick={() => router.push('/patients/' + p.id)} className="tap" style={{ width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 20, padding: '16px 18px', boxShadow: 'var(--elevation-1)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{p.name}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{[p.age && `${p.age} yrs`, p.gender, p.bloodGroup].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <Icon name="chevRight" size={18} color="var(--text-tertiary)" />
                  <span style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>View profile</span>
                </div>
              </div>
              {flags.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,95,87,0.08)', borderRadius: 10, padding: '8px 12px', marginTop: 12 }}>
                  <Icon name="alert" size={15} color="var(--red)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{flags.join(' · ')}</span>
                </div>
              )}
              {current.chiefComplaint && (
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.45, color: 'var(--text-primary)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>"{current.chiefComplaint}"</div>
              )}
              <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                {lastVisit && <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={13} color="var(--blue)" />Last visit {formatDate(lastVisit.date)}</span>}
                {hasRx && <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="pill" size={13} color="var(--blue)" />Has prescription</span>}
                {activeProc && <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Ongoing: {activeProc.type}</span>}
              </div>
            </button>
          </div>

          <PatientContext patientId={p.id} />

          {/* Dominant action — opens the record drawer; manual is the escape hatch */}
          <div style={{ padding: '26px 24px 0' }}>
            <button onClick={openRecorder} className="tap" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 22, padding: '24px', display: 'flex', alignItems: 'center', gap: 18, textAlign: 'left', boxShadow: 'var(--elevation-2)' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="mic" size={32} color="var(--accent-ink)" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>Record</div>
                <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2, lineHeight: 1.35 }}>Speak your findings — the plan, prescription and next visits file themselves.</div>
              </div>
            </button>
            <button onClick={openManual} style={{ display: 'block', margin: '12px auto 0', fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>or fill in manually ›</button>
          </div>

          {waiting.length > 0 && <WaitingQueue waiting={waiting} pById={pById} onCallIn={handleCallIn} label="Waiting · tap to swap" />}
        </div>
      )}
    </div>
  );
}

/* Waiting queue — every patient is callable/swappable. */
function WaitingQueue({ waiting, pById, onCallIn, label }) {
  return (
    <div style={{ padding: '30px 24px 32px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>{label}</div>
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
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.chiefComplaint}{longWait ? ` · waiting ${waitLabel(e.checkedInAt)}` : ''}</div>
            </div>
            <button onClick={() => onCallIn(e.id)} className="tap" style={{ flexShrink: 0, fontSize: 13, color: 'var(--blue)', fontWeight: 700, background: 'rgba(0,110,230,0.08)', borderRadius: 99, padding: '7px 14px' }}>Call in</button>
          </div>
        );
      })}
    </div>
  );
}

export default function ConsultationPage() {
  return <ConsultModeScreen />;
}
