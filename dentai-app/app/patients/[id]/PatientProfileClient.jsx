'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { Avatar, Chip, StatusChip, SectionHeader, PillToggle, StageDots, ToothChip, EmptyState, PrimaryButton, NavBar } from '@/components/ui';
import Odontogram from '@/components/odontogram/Odontogram';
import { treatmentPlans } from '@/lib/data/procedures';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, formatDate, formatTime, clinicianFlags, hasComplications, parseDate, MONTHS, formatCurrencyK } from '@/lib/data/utils';
import { getProcedureColor, TOOTH_STATE_STYLE } from '@/lib/data/procedures';

function VoiceToolbar({ onClick, label = 'Add voice entry' }) {
  return (
    <button onClick={onClick} className="rowtap" style={{
      flexShrink: 0, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: 'var(--surface)', borderTop: '1px solid var(--border-light)', color: 'var(--text-secondary)',
    }}>
      <Icon name="mic" size={20} />
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
    </button>
  );
}

function currentStageIndex(proc) {
  const i = proc.stages.findIndex(s => !s.completed);
  return i === -1 ? proc.stages.length - 1 : i;
}

function ProcedureCard({ proc, onClick, showLab, labOrders }) {
  const STATUS_CHIP_MAP = {
    planned: ['Planned', 'neutral'], in_progress: ['In progress', 'amber'], completed: ['Completed', 'green'],
    paused: ['Paused', 'neutral'], follow_up: ['Follow-up', 'teal'],
    pending: ['Pending', 'neutral'], sent: ['Sent', 'amber'], received: ['Received', 'teal'],
  };
  const lab = showLab && proc.labOrderId ? labOrders.find(l => l.id === proc.labOrderId) : null;
  return (
    <button onClick={onClick} className="card tap" style={{ width: '100%', padding: 16, textAlign: 'left', marginBottom: 10, display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{proc.type}</span>
        {proc.tooth && <ToothChip tooth={proc.tooth} />}
        <div style={{ marginLeft: 'auto' }}><StatusChip status={proc.status} /></div>
      </div>
      <StageDots stages={proc.stages} currentIndex={currentStageIndex(proc)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span className="t-meta">{proc.currentStage}</span>
        <span className="t-meta">{proc.completedVisits} of {proc.estimatedVisits} visits</span>
      </div>
      {lab && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="flask" size={15} color="#1B86B8" />
          <span style={{ fontSize: 13, color: '#1B86B8', fontWeight: 500 }}>Lab: {lab.labName} · {(STATUS_CHIP_MAP[lab.status] || [lab.status])[0]}</span>
        </div>
      )}
    </button>
  );
}

/* ---- tabs ---- */
function OverviewTab({ p, procedures, visits, labOrders, openSheet, router }) {
  const procs = procedures.filter(pr => pr.patientId === p.id);
  const active = procs.filter(pr => pr.status === 'in_progress' || pr.status === 'planned');
  const upcoming = visits.filter(v => v.patientId === p.id && v.date >= TODAY && v.status !== 'done').sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const history = visits.filter(v => v.patientId === p.id && v.status === 'done').sort((a, b) => b.date.localeCompare(a.date));
  const procById = id => procedures.find(x => x.id === id);

  return (
    <div>
      <SectionHeader>Diagnosis</SectionHeader>
      <div className="card" style={{ padding: 16, marginBottom: 22, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 16, lineHeight: 1.4 }}>{p.chiefComplaint ? 'Irreversible pulpitis, tooth 36. ' + (p.clinicalNotes || '') : 'No diagnosis recorded yet'}</span>
        <button style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500, flexShrink: 0 }}>Edit</button>
      </div>

      {active.length > 0 && <>
        <SectionHeader>Current treatment</SectionHeader>
        <div style={{ marginBottom: 12 }}>
          {active.map(pr => <ProcedureCard key={pr.id} proc={pr} labOrders={labOrders} showLab onClick={() => openSheet('procedure', { id: pr.id })} />)}
        </div>
      </>}

      <SectionHeader>Upcoming visits</SectionHeader>
      {upcoming.length === 0 ? <div className="card" style={{ marginBottom: 22 }}><EmptyState title="No upcoming visits" hint="Schedule the next appointment" /></div> : (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 22 }}>
          {upcoming.map((v, i) => {
            const d = parseDate(v.date); const proc = procById(v.procedureId);
            return (
              <button key={v.id} onClick={() => router.push('/appointments/' + v.id)} className="rowtap" style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{MONTHS[d.getMonth()]}</div>
                  <div className="tnum" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>{d.getDate()}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{proc ? proc.type : 'Consultation'}</div>
                  <div className="t-meta">{formatTime(v.startTime).label}</div>
                </div>
                <StatusChip status={v.status} />
              </button>
            );
          })}
        </div>
      )}

      <SectionHeader>Treatment history</SectionHeader>
      {history.length === 0 ? <div className="card"><EmptyState icon="doc" title="No history yet" /></div> : history.map(v => {
        const proc = procById(v.procedureId);
        return (
          <div key={v.id} className="card" style={{ padding: 16, marginBottom: 10, borderLeft: v.status === 'arrived' ? '3px solid var(--amber)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{proc ? proc.type : 'Visit'}</span>
              {proc && proc.tooth && <ToothChip tooth={proc.tooth} />}
              <span className="t-meta" style={{ marginLeft: 'auto' }}>{formatDate(v.date)}</span>
            </div>
            {v.proceduresDone && <><div className="t-section" style={{ marginBottom: 3 }}>Notes</div><div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--text-primary)', marginBottom: v.nextSteps ? 10 : 0 }}>{v.clinicalNotes}</div></>}
            {v.nextSteps && <><div className="t-section" style={{ marginBottom: 3 }}>Next steps</div><div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--text-secondary)' }}>{v.nextSteps}</div></>}
          </div>
        );
      })}
    </div>
  );
}

function CasesTab({ p, procedures, labOrders, openSheet, patientTreatmentPlans }) {
  const plans = patientTreatmentPlans.filter(t => t.patientId === p.id);
  if (plans.length === 0) return <EmptyState icon="stethoscope" title="No treatment plans" hint="Create a plan to map this patient's journey" />;
  return (
    <div>
      {plans.map(plan => (
        <div key={plan.id} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 10px' }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{plan.title}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <StatusChip status={plan.status} />
              <button style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Edit</button>
            </div>
          </div>
          {plan.procedures.map(pid => {
            const pr = procedures.find(x => x.id === pid);
            return pr ? <ProcedureCard key={pid} proc={pr} labOrders={labOrders} showLab onClick={() => openSheet('procedure', { id: pr.id })} /> : null;
          })}
          <button style={{ color: 'var(--blue)', fontSize: 15, fontWeight: 500, padding: '4px 4px 0' }}>+ Add procedure</button>
        </div>
      ))}
      <button className="card tap" style={{ width: '100%', height: 48, color: 'var(--blue)', fontSize: 15, fontWeight: 600, marginTop: 4 }}>+ New treatment plan</button>
    </div>
  );
}

function ToothMapTab({ p, bills, openSheet }) {
  const treated = Object.entries(p.teeth).filter(([, st]) => st !== 'healthy');
  const treatedCount = treated.filter(([, st]) => ['rct','crown','filling','implant'].includes(st)).length;
  const scheduledCount = treated.filter(([, st]) => st === 'scheduled' || st === 'infection').length;
  const billed = bills.filter(b => b.patientId === p.id).reduce((s, b) => s + b.total, 0);
  const STATE_LABEL = { rct: 'Root canal', crown: 'Crown', filling: 'Filling', implant: 'Implant', extraction: 'Extraction', infection: 'Infection', scheduled: 'Scheduled' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Chip label={`${treatedCount} treated`} tone="blueOutline" size="lg" />
        <Chip label={`${scheduledCount} scheduled`} tone="amber" size="lg" />
        <Chip label={`${formatCurrencyK(billed)} billed`} tone="green" size="lg" />
      </div>
      <div className="card" style={{ padding: '8px 6px', marginBottom: 22 }}>
        <Odontogram teeth={p.teeth} onTooth={(n) => openSheet('tooth', { tooth: n, state: p.teeth[n] || 'healthy', patientId: p.id })} />
      </div>
      <SectionHeader>Treated teeth</SectionHeader>
      {treated.length === 0 ? <div className="card"><EmptyState icon="tooth" title="No teeth charted" hint="Tap any tooth above to record work" /></div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {treated.map(([num, st], i) => {
            const c = TOOTH_STATE_STYLE[st] || TOOTH_STATE_STYLE.healthy;
            return (
              <button key={num} onClick={() => openSheet('tooth', { tooth: +num, state: st, patientId: p.id })} className="rowtap" style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: c.fill === '#ffffff' ? 'rgba(60,60,67,0.06)' : c.fill, border: `1.5px solid ${c.stroke}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: st === 'rct' ? '#fff' : c.num }}>{num}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Tooth {num}</div>
                  <div className="t-meta">{STATE_LABEL[st] || st}</div>
                </div>
                <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function daysBetween(a, b) {
  function parseD(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  return Math.round((parseD(b) - parseD(a)) / 86400000);
}

function LabOrderCard({ order, openSheet, markLabReceived }) {
  const margin = order.chargedToPatient - order.costToClinic;
  const overdue = order.status === 'sent' && order.expectedReturnDate < TODAY;
  const rem = daysBetween(TODAY, order.expectedReturnDate);
  const timeLabel = order.status === 'received' || order.status === 'completed'
    ? (order.actualReturnDate ? 'Returned ' + formatDate(order.actualReturnDate) : 'Returned')
    : overdue ? `${Math.abs(rem)}d overdue` : rem === 0 ? 'Due today' : `${rem}d remaining`;
  return (
    <button onClick={() => openSheet('labDetail', { id: order.id })} className="card tap" style={{ width: '100%', padding: 16, marginBottom: 10, textAlign: 'left', display: 'block', borderLeft: overdue ? '3px solid var(--amber)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{order.labName}</span>
        <StatusChip status={order.status} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="t-meta">{order.patientName}</span>
        {order.toothNumber && <ToothChip tooth={order.toothNumber} />}
      </div>
      <div style={{ fontSize: 15, marginBottom: 8 }}>{order.workDescription}</div>
      <div className="t-meta" style={{ marginBottom: 8 }}>Sent {formatDate(order.sentDate)} · Expected {formatDate(order.expectedReturnDate)} · <span style={{ color: overdue ? 'var(--amber)' : 'var(--text-secondary)', fontWeight: overdue ? 600 : 400 }}>{timeLabel}</span></div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingTop: 8, borderTop: '1px solid var(--border-light)' }}>
        <span className="tnum">Cost {formatCurrency(order.costToClinic)} → Billed {formatCurrency(order.chargedToPatient)}</span> · <span className="tnum" style={{ color: '#1E8E3E', fontWeight: 600 }}>Margin {formatCurrency(margin)}</span>
      </div>
      {order.status === 'sent' && (
        <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
          <button onClick={(e) => { e.stopPropagation(); markLabReceived(order.id); }} style={{ height: 36, padding: '0 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, background: '#fff' }}>Mark received</button>
          <button onClick={(e) => e.stopPropagation()} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Add note</button>
        </div>
      )}
    </button>
  );
}

function LabTab({ p, labOrders, openSheet, markLabReceived }) {
  const labs = labOrders.filter(l => l.patientId === p.id);
  return (
    <div>
      <SectionHeader>Lab orders for this patient</SectionHeader>
      {labs.length === 0 ? <div className="card" style={{ marginBottom: 16 }}><EmptyState icon="flask" title="No lab orders" /></div> :
        labs.map(l => <LabOrderCard key={l.id} order={l} openSheet={openSheet} markLabReceived={markLabReceived} />)}
      <PrimaryButton onClick={() => openSheet('newLab', { patientId: p.id })} style={{ marginTop: 6 }}>+ New lab order</PrimaryButton>
    </div>
  );
}

function BillingTab({ p, bills, prescriptions, labOrders, visits, procedures, openSheet }) {
  const pbills = bills.filter(b => b.patientId === p.id);
  const rxs = prescriptions.filter(r => r.patientId === p.id);
  const totalBilled = pbills.reduce((s, b) => s + b.total, 0);
  const outstanding = pbills.reduce((s, b) => s + b.outstanding, 0);
  const labCost = labOrders.filter(l => l.patientId === p.id).reduce((s, l) => s + l.costToClinic, 0);
  const margin = totalBilled - labCost;
  const marginPct = totalBilled ? Math.round(margin / totalBilled * 100) : 0;
  const visitCount = visits.filter(v => v.patientId === p.id).length;
  const procCount = procedures.filter(x => x.patientId === p.id).length;
  const Row = ({ k, v, color, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
      <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span>
      <span className="tnum" style={{ fontSize: 15, fontWeight: bold ? 700 : 600, color: color || 'var(--text-primary)' }}>{v}</span>
    </div>
  );
  return (
    <div>
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="tnum" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatCurrency(totalBilled)}</div>
        <div style={{ fontSize: 14, color: 'var(--orange)', fontWeight: 600, marginTop: 2 }}>{formatCurrency(outstanding)} outstanding</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
          <span className="t-meta">{visitCount} visits</span><span className="t-meta">{procCount} procedures</span>
        </div>
      </div>
      <SectionHeader>Cost breakdown</SectionHeader>
      <div className="card" style={{ padding: '8px 16px', marginBottom: 22 }}>
        <Row k="Patient revenue" v={formatCurrency(totalBilled)} color="#1E8E3E" />
        <Row k="Lab costs" v={'−' + formatCurrency(labCost)} color="var(--orange)" />
        <div style={{ borderTop: '1px solid var(--border-light)', margin: '2px 0' }} />
        <Row k="Net margin" v={formatCurrency(margin)} color="#1E8E3E" bold />
        <div style={{ borderTop: '1px solid var(--border-light)', margin: '2px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
          <span className="t-section">Margin percentage</span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{marginPct}%</span>
        </div>
      </div>

      <SectionHeader right={<button onClick={() => openSheet('bill', { patientId: p.id })} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Create bill</button>}>Bills</SectionHeader>
      {pbills.length === 0 ? <div className="card" style={{ marginBottom: 22 }}><EmptyState icon="rupee" title="No bills yet" /></div> :
        <div style={{ marginBottom: 22 }}>{pbills.map(b => (
          <button key={b.id} onClick={() => openSheet('bill', { patientId: p.id, billId: b.id })} className="card tap" style={{ width: '100%', padding: 16, marginBottom: 10, textAlign: 'left', display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>Bill · {formatDate(b.createdAt)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="tnum" style={{ fontSize: 15, fontWeight: 700 }}>{formatCurrency(b.total)}</span><StatusChip status={b.status} /></div>
            </div>
            <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.items.slice(0, 2).map(it => it.description).join(', ')}{b.items.length > 2 ? ` +${b.items.length - 2} more` : ''}</div>
          </button>
        ))}</div>}

      <SectionHeader right={<button onClick={() => openSheet('rx', { patientId: p.id })} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>New prescription</button>}>Prescriptions</SectionHeader>
      {rxs.length === 0 ? <div className="card"><EmptyState icon="pill" title="No prescriptions" /></div> :
        <div className="card" style={{ overflow: 'hidden' }}>{rxs.map((r, i) => (
          <button key={r.id} onClick={() => openSheet('rx', { patientId: p.id, rxId: r.id })} className="rowtap" style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
            <Icon name="pill" size={18} color="var(--text-secondary)" />
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{formatDate(r.date)}</div><div className="t-meta">{r.medicines.length} medicines</div></div>
            <span style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>View</span>
          </button>
        ))}</div>}
    </div>
  );
}

const PROFILE_TABS = ['Overview', 'Cases', 'Tooth Map', 'Lab', 'Billing'];

function PatientProfile({ patientId, initialTab }) {
  const router = useRouter();
  const openSheet = useAppStore(s => s.openSheet);
  const patients = usePatientStore(s => s.patients);
  const updateToothState = usePatientStore(s => s.updateToothState);
  const visits = useVisitStore(s => s.visits);
  const procedures = useClinicalStore(s => s.procedures);
  const labOrders = useClinicalStore(s => s.labOrders);
  const bills = useClinicalStore(s => s.bills);
  const prescriptions = useClinicalStore(s => s.prescriptions);
  const advanceProcedure = useClinicalStore(s => s.advanceProcedure);
  const markLabReceived = useClinicalStore(s => s.markLabReceived);

  const p = patients.find(x => x.id === patientId);
  const [tab, setTab] = React.useState(initialTab || 'Overview');
  if (!p) return null;
  const flags = clinicianFlags(p);
  const outstanding = bills.filter(b => b.patientId === p.id).reduce((s, b) => s + b.outstanding, 0);
  const statusPill = p.status === 'current' ? <Chip label="Current patient" tone="dark" size="lg" /> : p.status === 'new' ? <Chip label="New patient" tone="blueOutline" size="lg" /> : <Chip label="Completed" tone="neutral" size="lg" />;

  // treatmentPlans from data (static seed)
  const patientTreatmentPlans = (treatmentPlans || []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar title="Patient" onBack={() => router.back()} right={<button onClick={() => openSheet('editPatient', { id: p.id })} style={{ color: 'var(--blue)', display: 'flex' }}><Icon name="pencil" size={20} /></button>} />
      <div className="scroll" style={{ flex: 1 }}>
        {/* hero */}
        <div style={{ padding: '16px 20px', display: 'flex', gap: 14 }}>
          <Avatar name={p.name} size={56} ring />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{p.name}</div>
            <a href={'tel:' + p.phone.replace(/\s/g, '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 15, textDecoration: 'none', margin: '2px 0' }}><Icon name="phone" size={14} color="var(--blue)" />{p.phone}</a>
            <div className="t-meta" style={{ marginBottom: 8 }}>{p.age} · {p.gender} · {p.bloodGroup}</div>
            {statusPill}
          </div>
        </div>

        <div style={{ padding: '0 20px' }}>
          {flags.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.25)', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
              <Icon name="alert" size={16} color="var(--red)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>{flags.join(' · ')}</span>
            </div>
          )}
          {outstanding > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--orange)' }}>{formatCurrency(outstanding)} outstanding</span>
              <button onClick={() => openSheet('bill', { patientId: p.id, billId: bills.find(b => b.patientId === p.id && b.outstanding > 0)?.id })} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Record payment →</button>
            </div>
          )}
          {p.chiefComplaint && (
            <div style={{ marginBottom: 14 }}>
              <div className="t-section" style={{ marginBottom: 3 }}>Chief complaint</div>
              <div style={{ fontSize: 15, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{p.chiefComplaint}</div>
            </div>
          )}
        </div>

        {/* tabs */}
        <div className="noscroll-x" style={{ display: 'flex', gap: 22, padding: '0 20px', borderBottom: '1px solid var(--border-light)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 5 }}>
          {PROFILE_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 0', fontSize: 15, fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', whiteSpace: 'nowrap' }}>{t}</button>
          ))}
        </div>

        <div style={{ padding: '18px 20px 24px' }}>
          {tab === 'Overview' && <OverviewTab p={p} procedures={procedures} visits={visits} labOrders={labOrders} openSheet={openSheet} router={router} />}
          {tab === 'Cases' && <CasesTab p={p} procedures={procedures} labOrders={labOrders} openSheet={openSheet} patientTreatmentPlans={patientTreatmentPlans} />}
          {tab === 'Tooth Map' && <ToothMapTab p={p} bills={bills} openSheet={openSheet} />}
          {tab === 'Lab' && <LabTab p={p} labOrders={labOrders} openSheet={openSheet} markLabReceived={markLabReceived} />}
          {tab === 'Billing' && <BillingTab p={p} bills={bills} prescriptions={prescriptions} labOrders={labOrders} visits={visits} procedures={procedures} openSheet={openSheet} />}
        </div>
      </div>
      <VoiceToolbar onClick={() => openSheet('voice', { scope: 'patient', patientId: p.id })} />
    </div>
  );
}

export default PatientProfile;
