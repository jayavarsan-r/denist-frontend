'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { apiClient } from '@/lib/api/client';
import Icon from '@/components/icons';
import { SectionHeader, Chip, StatusChip, Avatar, EmptyState, SelectPill, Segmented } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, formatCurrencyK, formatDate, formatDateLong, formatTime, parseDate, getInitials, hasComplications, clinicianFlags, MONTHS, DAYS, DAYS_FULL, getGreeting } from '@/lib/data/utils';
import { listLabCases, getReceptionInbox, STATUS_META } from '@/lib/services/lab-case.service';
import { listLowStock } from '@/lib/services/inventory.service';

const APPT_DOT = { confirmed: 'var(--blue)', arrived: 'var(--yellow)', done: 'var(--green)', no_show: 'var(--red)', scheduled: 'var(--blue)', completed: 'var(--green)', cancelled: 'var(--red)' };
const APPT_WORD = { confirmed: 'Confirmed', arrived: 'In chair', done: 'Done', no_show: 'No-show' };

// Lab-case status buckets for the homepage operations card (mirrors the tracker).
const LAB_ACTIVE = ['SENT', 'ACKNOWLEDGED', 'IN_PROGRESS'];
const LAB_READY = ['READY', 'DISPATCHED'];
const LAB_SETTLED = ['READY', 'DISPATCHED', 'RECEIVED', 'FITTED', 'CANCELLED']; // not "overdue" once here

/* faint eyebrow label that sets a section without a box */
function Eyebrow({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 10px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{children}</span>
      {action}
    </div>
  );
}

function HomeScreen() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const started = useAppStore((s) => s.started);
  const clinic = useAppStore((s) => s.clinic);
  const setPatientsFocus = useAppStore((s) => s.setPatientsFocus);
  const patients = usePatientStore((s) => s.patients);
  const visits = useVisitStore((s) => s.visits);
  const queue = useQueueStore((s) => s.queue);
  const procedures = useClinicalStore((s) => s.procedures);
  const bills = useClinicalStore((s) => s.bills);
  const [analytics, setAnalytics] = React.useState(null);
  const [labCases, setLabCases] = React.useState([]);
  const [lowStock, setLowStock] = React.useState([]);
  const [inboxCount, setInboxCount] = React.useState(0);

  React.useEffect(() => {
    if (!started) return;
    apiClient.get('/api/analytics/dashboard')
      .then(r => setAnalytics(r.data))
      .catch(() => {});
  }, [started]);

  // Operations cards (lab cases + low stock + reception inbox). Each call is
  // independent — allSettled so one failure never blanks the others; a failed
  // fetch just leaves that card empty (logged, no user-facing error).
  const loadOps = React.useCallback(() => {
    if (!started) return;
    Promise.allSettled([listLabCases({ open: 'true' }), listLowStock(), getReceptionInbox()])
      .then(([lc, ls, inb]) => {
        if (lc.status === 'fulfilled') setLabCases(lc.value || []); else console.error('[home] lab cases card failed', lc.reason);
        if (ls.status === 'fulfilled') setLowStock(ls.value || []); else console.error('[home] low stock card failed', ls.reason);
        if (inb.status === 'fulfilled') setInboxCount((inb.value || []).length); else console.error('[home] inbox count failed', inb.reason);
      });
  }, [started]);
  React.useEffect(() => { loadOps(); }, [loadOps]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const pById = id => patients.find(p => p.id === id);
  const procById = id => procedures.find(p => p.id === id);
  const todays = visits
    .filter(v => (v.date || v.appointment_date) === todayStr)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const ongoing = procedures.filter(p => p.status === 'in_progress');
  const waiting = queue.filter(e => e.status === 'waiting').length;
  const inChair = queue.some(e => e.status === 'in_consultation');
  const queueCount = waiting + (inChair ? 1 : 0);

  // ── Operations card derivations ──
  const labIsOverdue = (c) => c.expected_date && c.expected_date < todayStr && !LAB_SETTLED.includes(c.status);
  const labActive = labCases.filter(c => LAB_ACTIVE.includes(c.status)).length;
  const labReady = labCases.filter(c => LAB_READY.includes(c.status)).length;
  const labOverdue = labCases.filter(labIsOverdue).length;
  const labTop = [...labCases]
    .sort((a, b) => {
      const ao = labIsOverdue(a) ? 0 : 1, bo = labIsOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo; // overdue first
      return String(a.expected_date || '9999').localeCompare(String(b.expected_date || '9999')); // then soonest due
    })
    .slice(0, 2);
  const labSummary = [labActive ? `${labActive} active` : null, labReady ? `${labReady} ready` : null, labOverdue ? `${labOverdue} overdue` : null, inboxCount ? `${inboxCount} in inbox` : null].filter(Boolean).join(' · ');
  const invOut = lowStock.filter(i => Number(i.stock_qty) <= 0).length;
  const invLow = lowStock.filter(i => Number(i.stock_qty) > 0).length;
  const lowTop = [...lowStock].sort((a, b) => Number(a.stock_qty) - Number(b.stock_qty)).slice(0, 3);
  const invSummary = [invLow ? `${invLow} low` : null, invOut ? `${invOut} out of stock` : null].filter(Boolean).join(' · ');
  const showLabCard = labCases.length > 0 || inboxCount > 0;
  const showInvCard = lowStock.length > 0;

  // urgent alerts — medical flags on today's patients + outstanding balances
  const alerts = [];
  todays.forEach(v => { const p = pById(v.patientId); if (p && hasComplications(p) && !alerts.some(a => a.pid === p.id)) alerts.push({ pid: p.id, kind: 'medical', text: clinicianFlags(p)[0], name: p.name }); });
  bills.filter(b => b.outstanding > 0).forEach(b => { if (!alerts.some(a => a.pid === b.patientId && a.kind === 'pay')) alerts.push({ pid: b.patientId, kind: 'pay', text: formatCurrency(b.outstanding) + ' pending', name: b.patientName }); });

  const firstName = (clinic.doctorName || 'Doctor').replace(/^Dr\.?\s*/i, 'Dr. ');
  // getGreeting() is time- AND random-based, so it must run only on the client.
  // Computing it during SSR (the static export freezes it at build time) produced a
  // different string than the client at runtime → hydration mismatch. Start empty so
  // the server HTML and first client render agree, then fill it in after mount.
  const [greeting, setGreeting] = useState('');
  useEffect(() => { setGreeting(getGreeting()); }, []);

  return (
    <div className="scroll" style={{ flex: 1, background: 'var(--surface)' }}>
      {/* greeting */}
      <div style={{ padding: '58px 22px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500 }}>{greeting}</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.08, marginTop: 1 }}>{firstName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 3 }}>{clinic.clinicName}</div>
        </div>
        <button onClick={() => openSheet('account')} style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(60,60,67,0.07)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{(clinic.doctorName || 'Dr').replace(/^Dr\.?\s*/i, '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'DR'}</button>
      </div>

      {/* search */}
      <div style={{ padding: '0 20px' }}>
        <button onClick={() => { setPatientsFocus(true); router.push('/patients'); }} className="tap" style={{ width: '100%', height: 50, borderRadius: 99, background: 'var(--bg)', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10 }}>
          <Icon name="search" size={18} color="var(--text-tertiary)" />
          <span style={{ flex: 1, textAlign: 'left', fontSize: 16, color: 'var(--text-tertiary)' }}>Search a patient…</span>
          <Icon name="mic" size={18} color="var(--text-tertiary)" />
        </button>
      </div>

      {/* ── PRIMARY: consultation — the clinic's core workflow, strongest emphasis ── */}
      <div style={{ padding: '14px 20px 0' }}>
        <button onClick={() => router.push('/consultation')} className="tap" style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 16,
          background: '#1C1C1E', color: '#fff', borderRadius: 20, padding: '20px 22px',
          textAlign: 'left', boxShadow: 'var(--elevation-2)',
        }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="stethoscope" size={26} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{inChair ? 'Continue consultation' : 'Start consultation'}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{queueCount > 0 ? `${queueCount} in the queue${inChair ? ' · 1 in chair' : ''}` : 'Queue is clear'}</div>
          </div>
          <Icon name="arrowRight" size={22} color="rgba(255,255,255,0.85)" />
        </button>
      </div>

      {/* ── Quick tools — full soft-tinted tiles, above the live queue ── */}
      <div style={{ padding: '16px 20px 0' }}>
        <Eyebrow>Quick tools</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: 'personPlus', label: 'New patient',  tint: '#2F6FB3', soft: 'rgba(0,122,255,0.10)',  fn: () => openSheet('newPatient') },
            { icon: 'calendar',   label: 'Appointment',  tint: '#159AAE', soft: 'rgba(48,176,199,0.12)', fn: () => openSheet('newVisit', {}) },
            { icon: 'pencil',     label: 'Prescription', tint: '#1E8E3E', soft: 'rgba(48,209,88,0.12)',  fn: () => openSheet('patientPicker', { next: 'rx',   title: 'Prescription for…' }) },
            { icon: 'rupee',      label: 'Collect',      tint: '#B07D2B', soft: 'rgba(255,159,10,0.14)', fn: () => openSheet('patientPicker', { next: 'bill', title: 'Collect payment from…' }) },
          ].map((a) => (
            <button key={a.label} onClick={a.fn} className="tap" style={{
              background: a.soft, borderRadius: 16, padding: '14px 12px', minHeight: 92,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, textAlign: 'left',
            }}>
              <Icon name={a.icon} size={22} color={a.tint} stroke={2} />
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.15 }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* urgent alerts — only when present, plain semantic rows */}
      {alerts.length > 0 && (
        <div style={{ padding: '26px 22px 0' }}>
          <Eyebrow>Needs attention</Eyebrow>
          <div>
            {alerts.slice(0, 3).map((a, i) => {
              const c = a.kind === 'medical' ? 'var(--red)' : 'var(--orange)';
              return (
                <button key={i} onClick={() => router.push('/patients/' + a.pid)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{a.name}</span>
                  <span style={{ fontSize: 14, color: c, fontWeight: 600 }}>{a.text}</span>
                  <Icon name="chevRight" size={15} color="var(--text-tertiary)" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* continue treatment — ongoing procedures (longitudinal) */}
      {ongoing.length > 0 && (
        <div style={{ padding: '26px 22px 0' }}>
          <Eyebrow>Continue treatment</Eyebrow>
          <div>
            {ongoing.map((pr, i) => {
              const p = pById(pr.patientId); if (!p) return null;
              const pct = Math.round((pr.completedVisits / pr.estimatedVisits) * 100);
              return (
                <button key={pr.id} onClick={() => router.push('/patients/' + p.id)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 1 }}>{pr.type}{pr.tooth ? ' · Tooth ' + pr.tooth : ''} — {pr.currentStage}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(60,60,67,0.10)', overflow: 'hidden', maxWidth: 160 }}><div style={{ width: pct + '%', height: '100%', background: 'var(--accent)' }} /></div>
                      <span className="tnum" style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontWeight: 600 }}>Visit {pr.completedVisits} of {pr.estimatedVisits}</span>
                    </div>
                  </div>
                  <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* today */}
      <div style={{ padding: '26px 22px 0' }}>
        <Eyebrow action={<button onClick={() => router.push('/schedule')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>Schedule</button>}>Today · {analytics?.totalAppointmentsToday ?? todays.length}</Eyebrow>
        {todays.length === 0 ? (
          <div style={{ padding: '20px 0', color: 'var(--text-tertiary)', fontSize: 15 }}>No appointments scheduled.</div>
        ) : (
          <div>
            {todays.map((v, i) => {
              const p = pById(v.patientId); const proc = procById(v.procedureId); const t = formatTime(v.startTime);
              return (
                <button key={v.id} onClick={() => router.push('/patients/' + v.patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <div style={{ width: 52, flexShrink: 0 }}>
                    <div className="tnum" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.05 }}>{t.h12}:{String(t.m).padStart(2, '0')}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600 }}>{t.ampm}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 600 }}>{p?.name || v.patientName || 'Patient'}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proc ? `${proc.type}${proc.tooth ? ' · Tooth ' + proc.tooth : ''}` : 'Consultation'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: APPT_DOT[v.status] || 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{APPT_WORD[v.status] || ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* recent appointments — from analytics API */}
      {analytics?.recentAppointments?.length > 0 && (
        <div style={{ padding: '26px 22px 0' }}>
          <Eyebrow action={<button onClick={() => router.push('/schedule')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>See all</button>}>Recent appointments</Eyebrow>
          <div>
            {analytics.recentAppointments.slice(0, 5).map((appt, i) => {
              const patientName = appt.patients?.name || 'Patient';
              const patientId = appt.patients?.id || appt.patient_id;
              const dot = { scheduled: 'var(--blue)', completed: 'var(--green)', cancelled: 'var(--text-tertiary)', arrived: 'var(--orange)' }[appt.status] || 'var(--text-tertiary)';
              return (
                <button key={appt.id} onClick={() => router.push('/patients/' + patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 600 }}>{patientName}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{appt.appointment_date}</span>
                      {appt.purpose && <><span>·</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{appt.purpose}</span></>}
                      {appt.tooth_number && <><span>·</span><span style={{ color: 'var(--blue)', fontWeight: 600 }}>T{appt.tooth_number}</span></>}
                    </div>
                  </div>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Operations: lab cases + inventory (reception/admin glance) ── */}
      {(showLabCard || showInvCard) && (
        <div style={{ padding: '26px 22px 0' }}>
          <Eyebrow>Operations</Eyebrow>

          {/* Lab cases summary — header taps through to the tracker, rows open the case */}
          {showLabCard && (
            <div className="card" style={{ overflow: 'hidden', marginBottom: showInvCard ? 10 : 0 }}>
              <button onClick={() => router.push('/finance/lab-cases')} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left', background: 'transparent' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(50,173,230,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="flask" size={20} color="#1B86B8" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Lab cases
                    {labOverdue > 0 ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
                      : labReady > 0 ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)' }} /> : null}
                  </div>
                  <div className="t-meta">{labSummary || 'All clear'}</div>
                </div>
                <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
              </button>
              {labTop.map((c) => {
                const overdue = labIsOverdue(c);
                const meta = STATUS_META[c.status] || STATUS_META.DRAFT;
                return (
                  <button key={c.id} onClick={() => openSheet('labCaseDetail', { id: c.id, onChanged: loadOps })} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--border-light)', textAlign: 'left', background: 'transparent' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: overdue ? 'var(--red)' : meta.dot, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.case_code} · {(c.case_type || '').replace(/_/g, ' ')}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: overdue ? 'var(--red)' : 'var(--text-secondary)', flexShrink: 0 }}>
                      {overdue ? 'Overdue' : meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Inventory low stock — header taps through, rows open the item */}
          {showInvCard && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <button onClick={() => router.push('/finance/inventory')} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left', background: 'transparent' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(48,209,88,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="pill" size={20} color="#1E8E3E" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Inventory
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: invOut > 0 ? 'var(--red)' : 'var(--amber)' }} />
                  </div>
                  <div className="t-meta">{invSummary || 'Stock healthy'}</div>
                </div>
                <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
              </button>
              {lowTop.map((it) => {
                const out = Number(it.stock_qty) <= 0;
                return (
                  <button key={it.id} onClick={() => openSheet('inventoryDetail', { item: it, onSaved: loadOps })} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid var(--border-light)', textAlign: 'left', background: 'transparent' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.name}{it.strength ? ` ${it.strength}` : ''}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: out ? 'var(--red)' : 'var(--amber)', flexShrink: 0 }}>
                      {out ? 'Out of stock' : `${Number(it.stock_qty)} left`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* tail spacing */}
      <div style={{ height: 24 }} />
    </div>
  );
}

export default function HomePage() {
  return <HomeScreen />;
}
