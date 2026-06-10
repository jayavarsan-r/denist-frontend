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
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, formatDate, formatTime, clinicianFlags, hasComplications, parseDate, MONTHS, formatCurrencyK } from '@/lib/data/utils';
import { getProcedureColor, TOOTH_STATE_STYLE } from '@/lib/data/procedures';
import { getToothHistory, getPatientCaseSheet } from '@/lib/services/patient.service';
import { getPatientXrays, uploadXray, uploadPatientPhoto } from '@/lib/services/xray.service';
import BeforeAfterCapture from '@/components/sheets/BeforeAfterCapture';

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
// OverviewTab — the treatment control center. Answers "what's happening with this
// patient right now, and what do I do next?" Driven entirely by the live case sheet.
function OverviewTab({ p, caseSheet, toothHistory, teeth, activePlan, activeTeeth, openSheet, router, setTab }) {
  const plan = activePlan;
  const total = plan?.total_sittings || 1;
  const done = plan?.completed_sittings || 0;
  const remaining = Math.max(0, total - done);
  const pending = caseSheet?.summary?.pendingAmount || 0;
  const nextAppt = (caseSheet?.upcomingAppointments || [])[0];
  const recent = (caseSheet?.visits || []).slice(0, 3);
  const ongoing = !!plan && remaining > 0 && plan.status === 'active';

  const PLAN_TONE = { active: '#1E8E3E', completed: '#9CA3AF', cancelled: '#EF4444' };
  const nextLabel = ongoing ? 'Continue treatment' : 'Record findings';
  const nextSub = ongoing
    ? `${plan.procedure_name || 'Treatment'} · ${remaining} sitting${remaining > 1 ? 's' : ''} left`
    : 'Speak findings — plan, Rx & next visit auto-fill';

  return (
    <div>
      {/* ── NEXT ACTION — the single strongest, operational CTA ── */}
      <button onClick={() => openSheet('patientConsult', { patientId: p.id })} className="tap" style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: '#1C1C1E', color: '#fff',
        borderRadius: 18, padding: '18px 20px', textAlign: 'left', marginBottom: 18, boxShadow: 'var(--elevation-2)',
      }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="mic" size={24} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{nextLabel}</div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{nextSub}</div>
        </div>
        <Icon name="arrowRight" size={20} color="rgba(255,255,255,0.85)" />
      </button>

      {/* ── CURRENT TREATMENT ── */}
      <SectionHeader>Current treatment</SectionHeader>
      {plan ? (
        <div className="card" style={{ padding: 16, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{plan.procedure_name || 'Treatment plan'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: PLAN_TONE[plan.status] || 'var(--text-secondary)', flexShrink: 0 }}>{plan.status || 'active'}</span>
          </div>
          {plan.diagnosis && <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10 }}>{plan.diagnosis}</div>}
          {activeTeeth.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {activeTeeth.map(t => <ToothChip key={t} tooth={t} />)}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Sittings</span>
            <span style={{ fontWeight: 700 }}>{done} of {total} done · {remaining} more</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(60,60,67,0.1)', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${Math.min(100, (done / total) * 100)}%`, background: 'var(--accent)', borderRadius: 99 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{formatCurrency(plan.estimated_cost || 0)} estimated</span>
            {pending > 0 && <span style={{ fontSize: 14, fontWeight: 700, color: '#C77700' }}>{formatCurrency(pending)} pending</span>}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '22px 16px', marginBottom: 18, textAlign: 'center' }}>
          <Icon name="stethoscope" size={30} color="var(--text-tertiary)" stroke={1.6} />
          <div style={{ fontSize: 15.5, fontWeight: 600, marginTop: 10 }}>No active treatment</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 3 }}>Record findings above to start a treatment plan.</div>
        </div>
      )}

      {/* ── AFFECTED TEETH — the chart, central and alive ── */}
      <SectionHeader action={<button onClick={() => setTab('Tooth Map')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>Open map</button>}>Affected teeth</SectionHeader>
      <div className="card" style={{ padding: '10px 8px 12px', marginBottom: 18 }}>
        <Odontogram
          teeth={teeth}
          onTooth={(n) => {
            const td = toothHistory?.toothMap?.find(t => t.toothNumber === String(n));
            openSheet('tooth', { tooth: n, state: teeth[n] || 'healthy', patientId: p.id, toothData: td });
          }}
        />
        <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 4 }}>Tap a tooth to view or chart its treatment</div>
      </div>

      {/* ── NEXT VISIT ── */}
      {nextAppt && (
        <>
          <SectionHeader>Next visit</SectionHeader>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', marginBottom: 18 }}>
            {(() => { const d = parseDate(nextAppt.appointment_date); return (
              <div style={{ width: 40, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>{MONTHS[d.getMonth()]}</div>
                <div className="tnum" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</div>
              </div>
            ); })()}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{nextAppt.purpose || 'Appointment'}</div>
              <div className="t-meta">{nextAppt.appointment_time ? formatTime(nextAppt.appointment_time).label : 'Time not set'}{nextAppt.sitting_number ? ` · Sitting ${nextAppt.sitting_number}` : ''}</div>
            </div>
          </div>
        </>
      )}

      {/* ── PREVIOUS WORK ── */}
      <SectionHeader>Previous work</SectionHeader>
      {recent.length === 0 ? (
        <div className="card" style={{ padding: '20px 16px', marginBottom: 18, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>No visits recorded yet</div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          {recent.map((v, i) => (
            <div key={v.id || i} style={{ padding: '12px 16px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{v.procedure_name || 'Visit'}</span>
                {v.tooth_number && <ToothChip tooth={v.tooth_number} />}
                <span className="t-meta" style={{ marginLeft: 'auto' }}>{v.visit_date ? formatDate(v.visit_date) : ''}</span>
              </div>
              {v.notes && <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>{v.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── SECONDARY tools for this patient ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {[
          { icon: 'pencil', label: 'Prescribe', tint: '#1E8E3E', soft: 'rgba(48,209,88,0.12)', fn: () => openSheet('rx', { patientId: p.id }) },
          { icon: 'calendar', label: 'Schedule', tint: '#2F6FB3', soft: 'rgba(0,122,255,0.10)', fn: () => openSheet('newVisit', { patientId: p.id }) },
          { icon: 'rupee', label: 'Collect', tint: '#B07D2B', soft: 'rgba(255,159,10,0.14)', fn: () => openSheet('bill', { patientId: p.id }) },
        ].map(a => (
          <button key={a.label} onClick={a.fn} className="tap" style={{ background: a.soft, borderRadius: 14, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, textAlign: 'left' }}>
            <Icon name={a.icon} size={20} color={a.tint} stroke={2} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Consolidated case view: the live "overall case" (updates each visit), the
// treatment plans, and the detailed treatment history (tap a row for full detail).
// Replaces the old standalone Case Sheet tab.
function CaseSummaryCard({ p, caseSheet, history }) {
  const flags = clinicianFlags(p);
  const conditions = [];
  if (p.hasDiabetes) conditions.push('Diabetes');
  if (p.hasHypertension) conditions.push('Hypertension');
  if (p.hasHeartCondition) conditions.push('Heart condition');
  if (p.isPregnant) conditions.push('Pregnant');
  if (p.isOnBloodThinners) conditions.push('Blood thinners');
  const medHistory = [...new Set([...conditions, ...flags])];
  const allergies = Array.isArray(p.allergies) ? p.allergies.filter(Boolean) : (p.allergies ? [p.allergies] : []);
  const latest = history[0];
  const activePlan = (caseSheet?.activeTreatmentPlans || [])[0]
    || (caseSheet?.allTreatmentPlans || []).find(pl => pl.status === 'active');
  const diagnosis = activePlan?.diagnosis || latest?.notes || p.clinicalNotes || null;
  const lastUpdated = latest?.date || null;

  const Row = ({ label, value, accent }) => (
    <div style={{ padding: '9px 0', borderTop: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: accent || 'var(--text-primary)', fontWeight: accent ? 600 : 400 }}>{value || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not recorded</span>}</div>
    </div>
  );

  return (
    <div className="card" style={{ padding: '14px 16px 8px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Case summary</span>
        {lastUpdated && <span className="t-meta">Updated {formatDate(lastUpdated)}</span>}
      </div>
      <Row label="Chief complaint" value={p.chiefComplaint} />
      <Row label="Medical history" value={medHistory.length ? medHistory.join(', ') : 'None reported'} accent={medHistory.length ? 'var(--red)' : undefined} />
      <Row label="Allergies" value={allergies.length ? allergies.join(', ') : 'None'} />
      <Row label="Working diagnosis" value={diagnosis} />
    </div>
  );
}

function PlanCard({ raw, p, openSheet }) {
  const plan = {
    id: raw.id,
    title: raw.title || raw.procedure || raw.procedure_name || raw.name || 'Treatment Plan',
    diagnosis: raw.diagnosis,
    status: raw.status || 'active',
    tooth: raw.tooth || raw.tooth_number,
    totalSittings: raw.totalSittings || raw.total_sittings || raw.sessions || 0,
    completedSittings: raw.completedSittings || raw.completed_sittings || 0,
    totalCost: raw.totalCost || raw.total_cost || raw.estimatedCost || raw.estimated_cost || 0,
  };
  return (
    <div className="card" style={{ padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{plan.title}</div>
          {plan.diagnosis && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{plan.diagnosis}</div>}
        </div>
        <StatusChip status={plan.status} />
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        {plan.totalCost > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cost</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{formatCurrency(plan.totalCost)}</div>
          </div>
        )}
        {plan.totalSittings > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sittings</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{plan.completedSittings || 0}/{plan.totalSittings}</div>
          </div>
        )}
        {plan.tooth && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tooth</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>#{plan.tooth}</div>
          </div>
        )}
      </div>
      {plan.totalSittings > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(60,60,67,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.round((plan.completedSittings / plan.totalSittings) * 100))}%`, background: 'var(--green)', borderRadius: 3 }} />
          </div>
        </div>
      )}
      <button
        onClick={() => openSheet('treatmentPlan', { plan: { ...raw, ...plan }, patientId: p.id })}
        style={{ marginTop: 14, width: '100%', height: 40, borderRadius: 10, background: 'rgba(0,122,255,0.08)', color: 'var(--blue)', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
      >
        <Icon name="share" size={16} color="var(--blue)" />
        View / Share with Patient
      </button>
    </div>
  );
}

function CasesTab({ p, caseSheet, clinicalVisits, openSheet }) {
  const plans = caseSheet?.allTreatmentPlans || caseSheet?.activeTreatmentPlans || [];
  // Prefer the patient's own visits from the case sheet (already patient-scoped and
  // loaded with the page) over filtering the clinic-wide list — the latter can be
  // momentarily empty, which made the history look like it "wasn't showing up".
  const csVisits = (caseSheet?.visits || []).map(v => ({
    id: v.id,
    date: v.visit_date || v.date || '',
    procedureName: v.procedure_name || v.procedureName || '',
    toothNumber: v.tooth_number || v.toothNumber || null,
    notes: v.notes || '',
  }));
  const fallback = (clinicalVisits || []).filter(v => v.patientId === p.id);
  const history = (csVisits.length ? csVisits : fallback)
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div>
      {/* OVERALL CASE — see the whole picture at once; updates each visit */}
      <CaseSummaryCard p={p} caseSheet={caseSheet} history={history} />

      {/* TREATMENT PLANS */}
      <SectionHeader>Treatment plans</SectionHeader>
      {plans.length === 0 ? (
        <div className="card" style={{ marginBottom: 22 }}><EmptyState icon="stethoscope" title="No treatment plans yet" hint="Record findings by voice to auto-create one" /></div>
      ) : (
        <div style={{ marginBottom: 22 }}>
          {plans.map((raw, idx) => <PlanCard key={raw.id || idx} raw={raw} p={p} openSheet={openSheet} />)}
        </div>
      )}

      {/* BEFORE / AFTER — add for the latest case right here (also available per-case
          by tapping a treatment below) */}
      {history.length > 0 && (
        <div className="card" style={{ padding: '12px 14px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Before / After · latest case</span>
            <span className="t-meta">{history[0].date ? formatDate(history[0].date) : ''}</span>
          </div>
          <BeforeAfterCapture patientId={p.id} visitId={history[0].id} title="" />
        </div>
      )}

      {/* TREATMENT HISTORY — tap a visit for the full case detail */}
      <SectionHeader>Treatment history · {history.length}</SectionHeader>
      {history.length === 0 ? (
        <div className="card"><EmptyState icon="clipboard" title="No treatments recorded" hint="Recorded visits appear here — tap one for full detail" /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {history.map((v, i) => (
            <button
              key={v.id}
              onClick={() => openSheet('visitRecord', { id: v.id })}
              className="rowtap"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="stethoscope" size={18} color="var(--blue)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>{v.procedureName || 'Consultation'}</span>
                  {v.toothNumber && <ToothChip tooth={v.toothNumber} />}
                </div>
                <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[v.date && formatDate(v.date), v.notes].filter(Boolean).join(' · ')}</div>
              </div>
              <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToothMapTab({ p, bills, openSheet, toothHistory, toothLoading }) {
  const treated = Object.entries(p.teeth).filter(([, st]) => st !== 'healthy');
  const treatedCount = treated.filter(([, st]) => ['rct','crown','filling','implant'].includes(st)).length;
  const scheduledCount = treated.filter(([, st]) => st === 'scheduled' || st === 'infection').length;
  const billed = bills.filter(b => b.patientId === p.id).reduce((s, b) => s + b.total, 0);
  const STATE_LABEL = { rct: 'Root canal', crown: 'Crown', filling: 'Filling', implant: 'Implant', extraction: 'Extraction', infection: 'Infection', scheduled: 'Scheduled' };

  // Legend shows ONLY the states actually present on this patient — no generic decoder.
  const presentStates = [...new Set(treated.map(([, st]) => st))];

  return (
    <div>
      {treated.length > 0 && (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{treatedCount}</span> treated
          {scheduledCount > 0 && <> · <span style={{ fontWeight: 700, color: '#C77700' }}>{scheduledCount}</span> pending</>}
        </div>
      )}
      <div className="card" style={{ padding: '12px 8px 8px', marginBottom: 10 }}>
        <Odontogram
          teeth={p.teeth}
          onTooth={(n) => {
            const toothData = toothHistory?.toothMap?.find(t => t.toothNumber === String(n));
            openSheet('tooth', { tooth: n, state: p.teeth[n] || 'healthy', patientId: p.id, toothData });
          }}
        />
        <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>Tap a tooth to view or chart its treatment</div>
      </div>
      {/* Contextual legend — only what's on this mouth */}
      {presentStates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', padding: '0 4px', marginBottom: 22 }}>
          {presentStates.map((st) => {
            const c = TOOTH_STATE_STYLE[st] || TOOTH_STATE_STYLE.healthy;
            return (
              <span key={st} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: c.fill === '#ffffff' ? '#fff' : c.fill, border: `1.5px solid ${c.stroke}`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>{STATE_LABEL[st] || st}</span>
              </span>
            );
          })}
        </div>
      )}
      <SectionHeader>Treated teeth</SectionHeader>
      {treated.length === 0 ? <div className="card"><EmptyState icon="tooth" title="Nothing charted yet" hint="Tap a tooth on the chart above to begin charting treatment" /></div> : (
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
                  <div className="t-meta">
                    {(() => {
                      const td = toothHistory?.toothMap?.find(t => t.toothNumber === String(num));
                      const lastProc = td?.completedProcedures?.[0];
                      if (lastProc) return lastProc.procedure + (lastProc.cost ? ` · ₹${Math.round(lastProc.cost).toLocaleString('en-IN')}` : '');
                      return STATE_LABEL[st] || st;
                    })()}
                  </div>
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

// Billing — driven entirely by real backend data (tooth-history payments/costs +
// case-sheet summary). The old version read a local `bills` array that was always
// empty, so the tab looked broken.
function BillingTab({ p, prescriptions, openSheet, toothHistory, caseSheet }) {
  const summary = caseSheet?.summary || {};
  const payments = (toothHistory?.payments || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const collected = payments.reduce((s, pay) => s + (parseFloat(pay.amount) || 0), 0) || (summary.totalCollected || 0);
  const billed = toothHistory?.totalBilled ?? summary.totalBilled ?? 0;
  const planned = summary.totalPlannedCost ?? 0;
  const pending = summary.pendingAmount != null ? summary.pendingAmount : Math.max(0, planned - collected);
  const toothCosts = (toothHistory?.toothMap || []).filter(t => t.totalCost > 0);
  const rxs = (prescriptions || []).filter(r => r.patientId === p.id);

  const Stat = ({ value, label, color }) => (
    <div style={{ flex: 1 }}>
      <div className="tnum" style={{ fontSize: 21, fontWeight: 700, color: color || 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 1 }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* headline — real money in / billed / owed */}
      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Stat value={formatCurrency(collected)} label="Collected" color="#1E8E3E" />
          <Stat value={formatCurrency(billed || planned)} label="Billed" />
          <Stat value={formatCurrency(pending)} label="Pending" color={pending > 0 ? 'var(--orange)' : undefined} />
        </div>
        <button onClick={() => openSheet('bill', { patientId: p.id })} style={{ marginTop: 16, width: '100%', height: 44, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Icon name="rupee" size={17} color="var(--accent-ink)" /> Collect payment
        </button>
      </div>

      {/* payments ledger (real) */}
      <SectionHeader>Payments · {payments.length}</SectionHeader>
      {payments.length === 0 ? (
        <div className="card" style={{ marginBottom: 22 }}><EmptyState icon="rupee" title="No payments yet" hint="Collected payments appear here" /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 22 }}>
          {payments.map((pay, i) => (
            <div key={pay.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(48,209,88,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="rupee" size={16} color="#1E8E3E" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{pay.date ? formatDate(pay.date) : 'Payment'}</div>
                {pay.method && <div className="t-meta" style={{ textTransform: 'capitalize' }}>{pay.method}</div>}
              </div>
              <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: '#1E8E3E' }}>+{formatCurrency(parseFloat(pay.amount) || 0)}</span>
            </div>
          ))}
        </div>
      )}

      {/* cost by tooth (real recorded visit costs) */}
      {toothCosts.length > 0 && (
        <>
          <SectionHeader>Cost by tooth</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 22 }}>
            {toothCosts.map((t, i) => (
              <div key={t.toothNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <ToothChip tooth={t.toothNumber} />
                  <span style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.completedProcedures?.[0]?.procedure || ''}</span>
                </div>
                <span className="tnum" style={{ fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{formatCurrency(t.totalCost)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* prescriptions */}
      <SectionHeader right={<button onClick={() => openSheet('rx', { patientId: p.id })} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>New</button>}>Prescriptions · {rxs.length}</SectionHeader>
      {rxs.length === 0 ? (
        <div className="card"><EmptyState icon="pill" title="No prescriptions" /></div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {rxs.map((r, i) => (
            <button key={r.id} onClick={() => openSheet('rx', { patientId: p.id, rxId: r.id })} className="rowtap" style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
              <Icon name="pill" size={18} color="var(--text-secondary)" />
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{r.date ? formatDate(r.date) : 'Prescription'}</div><div className="t-meta">{(r.medicines || []).length} medicines</div></div>
              <span style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>View</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── MEDIA TAB ─────────────────────────── */
function BeforeAfterSlot({ label, photo, onPick, onView }) {
  const accent = label === 'Before' ? 'var(--amber)' : 'var(--green)';
  if (photo) {
    return (
      <button
        onClick={onView}
        className="tap"
        style={{ flex: 1, borderRadius: 14, overflow: 'hidden', position: 'relative', aspectRatio: '1', background: '#000' }}
      >
        <img src={photo.url || photo.preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', padding: '20px 10px 8px' }}>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{label}</span>
        </div>
        <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={12} color="#fff" stroke={2.5} />
        </div>
      </button>
    );
  }
  return (
    <button
      onClick={onPick}
      className="tap"
      style={{ flex: 1, borderRadius: 14, border: `2px dashed ${accent}`, aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: label === 'Before' ? 'rgba(245,158,11,0.05)' : 'rgba(34,197,94,0.05)' }}
    >
      <Icon name="camera" size={26} color={accent} />
      <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Tap to capture</span>
    </button>
  );
}

function XrayThumbnail({ photo, onView }) {
  return (
    <button
      onClick={onView}
      className="tap"
      style={{ borderRadius: 12, overflow: 'hidden', position: 'relative', aspectRatio: '1', background: '#1a1a1a' }}
    >
      <img src={photo.url || photo.preview} alt={photo.xrayType || photo.type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 6px 5px', background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }}>
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>{photo.xrayType || photo.type}</span>
      </div>
    </button>
  );
}

function MediaTab({ p, openSheet }) {
  const showToast = useAppStore(s => s.showToast);
  const [xrays, setXrays] = React.useState([]);
  const [photos, setPhotos] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const xrayFileRef = React.useRef(null);

  React.useEffect(() => {
    if (!p?.id) return;
    setLoading(true);
    getPatientXrays(p.id)
      .then(data => {
        const all = Array.isArray(data) ? data : (data?.xrays || []);
        const normalised = all.map(x => ({
          id: x.id,
          url: x.url || x.file_url || x.imageUrl,
          xrayType: x.xray_type || x.xrayType || x.type || 'Photo',
          date: x.date_taken || x.created_at || x.createdAt || x.date || '',
          visitId: x.visit_id || x.visitId || null,
          isBeforeAfter: ['before', 'after'].includes((x.xray_type || x.xrayType || '').toLowerCase()),
          photoType: (x.xray_type || x.xrayType || '').toLowerCase(),
        }));
        setXrays(normalised.filter(x => !x.isBeforeAfter));
        setPhotos(normalised.filter(x => x.isBeforeAfter));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [p?.id]);

  // Group before/after photos by case (visit). Legacy photos with no visit fall back
  // to their date so they still group sensibly. Capture lives in the case sheet now.
  const caseMap = {};
  photos.forEach(ph => {
    const key = ph.visitId || ('d:' + (ph.date || '').slice(0, 10));
    if (!caseMap[key]) caseMap[key] = { key, date: ph.date, before: null, after: null };
    caseMap[key][ph.photoType] = ph;
    if (ph.date && ph.date > (caseMap[key].date || '')) caseMap[key].date = ph.date;
  });
  const caseList = Object.values(caseMap).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const handleXrayUpload = async (file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    try {
      const res = await uploadXray(file, p.id, 'OPG');
      setXrays(prev => [{ id: res.id || res.xray_id || res.xray?.id, url: res.url || res.xray?.url || preview, xrayType: 'OPG' }, ...prev]);
      showToast('X-ray saved');
    } catch {
      setXrays(prev => [{ preview, xrayType: 'OPG' }, ...prev]);
      showToast('Saved locally — will sync when online');
    }
  };

  const handleDeletePhoto = (id) => {
    setXrays(prev => prev.filter(x => x.id !== id));
    setPhotos(prev => prev.filter(x => x.id !== id));
  };

  const openAllXrays = (startIdx = 0) => openSheet('photoViewer', {
    photos: xrays,
    initialIndex: startIdx,
    title: 'X-rays & Scans',
    onDelete: handleDeletePhoto,
  });

  const CasePhoto = ({ label, photo }) => {
    const accent = label === 'Before' ? 'var(--amber)' : 'var(--green)';
    return (
      <div style={{ flex: 1 }}>
        {photo ? (
          <button onClick={() => (photo.url || photo.preview) && openSheet('photoViewer', { photos: [photo], title: label, onDelete: handleDeletePhoto })} className="tap" style={{ width: '100%', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: '#000', border: 'none', padding: 0 }}>
            <img src={photo.url || photo.preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </button>
        ) : (
          <div style={{ width: '100%', aspectRatio: '1', borderRadius: 12, border: `1.5px dashed ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 12.5, background: label === 'Before' ? 'rgba(245,158,11,0.05)' : 'rgba(34,197,94,0.05)' }}>No {label.toLowerCase()}</div>
        )}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: accent, marginTop: 4, textAlign: 'center' }}>{label}</div>
      </div>
    );
  };

  return (
    <div>
      {/* ── Before / After — grouped by case; add them from a case in the Cases tab ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>Before &amp; After · by case</span>
      </div>
      {caseList.length === 0 ? (
        <div className="card" style={{ padding: '20px 16px', marginBottom: 24, textAlign: 'center' }}>
          <Icon name="compare" size={26} color="var(--text-tertiary)" />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 8 }}>No before / after photos</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>Open a case in the Cases tab to add them</div>
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          {caseList.map((c, i) => (
            <div key={c.key} className="card" style={{ padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Case {caseList.length - i}</span>
                <span className="t-meta">{c.date ? formatDate(c.date) : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <CasePhoto label="Before" photo={c.before} />
                <CasePhoto label="After" photo={c.after} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── X-rays ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>X-rays & Scans</span>
        <button onClick={() => xrayFileRef.current?.click()} style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="plus" size={14} color="var(--blue)" /> Add
        </button>
      </div>
      <input ref={xrayFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleXrayUpload(e.target.files[0]); e.target.value = ''; }} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
        </div>
      ) : xrays.length === 0 ? (
        <button
          onClick={() => xrayFileRef.current?.click()}
          className="card"
          style={{ width: '100%', padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 22 }}
        >
          <Icon name="scan" size={32} color="var(--text-tertiary)" />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>No X-rays added yet</span>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Tap to upload OPG, RVG, CBCT…</span>
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 22 }}>
          {xrays.map((x, i) => (
            <XrayThumbnail key={x.id || i} photo={x} onView={() => openAllXrays(i)} />
          ))}
          <button
            onClick={() => xrayFileRef.current?.click()}
            style={{ borderRadius: 12, border: '2px dashed var(--border)', aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'transparent' }}
          >
            <Icon name="plus" size={22} color="var(--text-tertiary)" />
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Add</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── CASE SHEET TAB ─────────────────────────── */
function CaseSheetTab({ p, visits, procedures, openSheet }) {
  const [caseSheet, setCaseSheet] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!p?.id) return;
    setLoading(true);
    getPatientCaseSheet(p.id)
      .then(data => setCaseSheet(data?.case_sheet || data?.caseSheet || data))
      .catch(() => setCaseSheet(null))
      .finally(() => setLoading(false));
  }, [p?.id]);

  const flags = clinicianFlags(p);
  const lastVisit = visits
    .filter(v => v.patientId === p.id && v.status === 'done')
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const medConditions = [];
  if (p.hasDiabetes || (p.flags?.hasDiabetes)) medConditions.push('Diabetes Mellitus');
  if (p.hasHypertension || (p.flags?.hasHypertension)) medConditions.push('Hypertension');
  if (p.hasHeartCondition || (p.flags?.hasHeartCondition)) medConditions.push('Heart condition');
  if (p.isPregnant || (p.flags?.isPregnant)) medConditions.push('Pregnant');
  if (p.isOnBloodThinners || (p.flags?.isOnBloodThinners)) medConditions.push('Blood thinners');
  if (p.medicalConditions) medConditions.push(...p.medicalConditions.split(',').map(s => s.trim()).filter(Boolean));

  const Row = ({ label, value, accent }) => (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--border-light)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: accent || 'var(--text-primary)', fontWeight: accent ? 600 : 400 }}>{value || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Not recorded</span>}</div>
    </div>
  );

  return (
    <div>
      {/* header chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(60,60,67,0.06)', borderRadius: 12, padding: '10px 14px', marginBottom: 18 }}>
        <Icon name="clipboard" size={18} color="var(--text-secondary)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Case Sheet</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {lastVisit ? `Last updated ${formatDate(lastVisit.date)}` : 'No visits recorded'}
          </div>
        </div>
        <button onClick={() => openSheet('editPatient', { id: p.id })} style={{ marginLeft: 'auto', color: 'var(--blue)', fontSize: 13, fontWeight: 600 }}>Edit</button>
      </div>

      {/* Patient Info */}
      <SectionHeader>Patient Information</SectionHeader>
      <div className="card" style={{ padding: '0 16px 6px', marginBottom: 16 }}>
        <Row label="Full Name" value={p.name} />
        <Row label="Age / Gender" value={[p.age && `${p.age} years`, p.gender].filter(Boolean).join(' · ')} />
        <Row label="Blood Group" value={p.bloodGroup} />
        <Row label="Phone" value={p.phone} />
      </div>

      {/* Medical History */}
      <SectionHeader>Medical History</SectionHeader>
      <div className="card" style={{ padding: '0 16px 6px', marginBottom: 16 }}>
        <Row
          label="Medical Conditions"
          value={medConditions.length ? medConditions.join(', ') : 'None reported'}
          accent={medConditions.length ? 'var(--red)' : undefined}
        />
        <Row label="Drug Allergies" value={Array.isArray(p.allergies) ? p.allergies.join(', ') : (p.allergies || null)} />
        {flags.length > 0 && (
          <Row label="Clinical Flags" value={flags.join(', ')} accent="var(--red)" />
        )}
      </div>

      {/* Chief Complaint + Diagnosis */}
      <SectionHeader>Presenting Complaint</SectionHeader>
      <div className="card" style={{ padding: '0 16px 6px', marginBottom: 16 }}>
        <Row label="Chief Complaint" value={p.chiefComplaint} />
        <Row label="Duration" value={caseSheet?.duration || null} />
      </div>

      {/* Clinical Examination */}
      <SectionHeader>Clinical Examination</SectionHeader>
      <div className="card" style={{ padding: '0 16px 6px', marginBottom: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
          </div>
        ) : (
          <>
            <Row label="Extra-oral Examination" value={caseSheet?.extra_oral || caseSheet?.extraOral || null} />
            <Row label="Intra-oral Examination" value={caseSheet?.intra_oral || caseSheet?.intraOral || null} />
            <Row label="Periodontal Status" value={caseSheet?.periodontal_status || caseSheet?.periodontalStatus || null} />
          </>
        )}
      </div>

      {/* Diagnosis */}
      <SectionHeader>Diagnosis & Investigations</SectionHeader>
      <div className="card" style={{ padding: '0 16px 6px', marginBottom: 16 }}>
        <Row label="Provisional Diagnosis" value={caseSheet?.diagnosis || p.clinicalNotes || null} />
        <Row label="Final Diagnosis" value={caseSheet?.final_diagnosis || caseSheet?.finalDiagnosis || null} />
        <Row label="Investigations Ordered" value={caseSheet?.investigations || null} />
      </div>

      {/* Visits summary */}
      {lastVisit && (
        <>
          <SectionHeader>Last Visit Notes</SectionHeader>
          <div className="card" style={{ padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 4 }}>{formatDate(lastVisit.date)}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{lastVisit.clinicalNotes || lastVisit.notes || 'No notes recorded'}</div>
          </div>
        </>
      )}
    </div>
  );
}

const PROFILE_TABS = ['Overview', 'Cases', 'Tooth Map', 'Media', 'Billing'];

function procedureToState(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('root canal') || n.includes('rct') || n.includes('pulpectomy')) return 'rct';
  if (n.includes('crown') || n.includes('cap')) return 'crown';
  if (n.includes('extraction') || n.includes('removal')) return 'extraction';
  if (n.includes('filling') || n.includes('composite') || n.includes('restoration')) return 'filling';
  if (n.includes('implant')) return 'implant';
  if (n.includes('infection') || n.includes('abscess') || n.includes('periapical')) return 'infection';
  return 'rct';
}

function buildTeethMap(toothHistory) {
  const map = {};
  if (!toothHistory?.toothMap) return map;
  toothHistory.toothMap.forEach(t => {
    if (t.upcomingAppointments?.length > 0) {
      map[t.toothNumber] = 'scheduled';
    } else if (t.completedProcedures?.length > 0) {
      map[t.toothNumber] = procedureToState(t.completedProcedures[0]?.procedure);
    }
  });
  return map;
}

function PatientProfile({ patientId, initialTab }) {
  const router = useRouter();
  const openSheet = useAppStore(s => s.openSheet);
  const showToast = useAppStore(s => s.showToast);
  const patientDataVersion = useAppStore(s => s.patientDataVersion);
  const patients = usePatientStore(s => s.patients);
  const fetchPatient = usePatientStore(s => s.fetchPatient);
  const deletePatient = usePatientStore(s => s.deletePatient);
  const updateToothState = usePatientStore(s => s.updateToothState);
  const visits = useVisitStore(s => s.visits);
  const clinicalVisits = useVisitStore(s => s.clinicalVisits);
  const loadClinicalVisits = useVisitStore(s => s.loadClinicalVisits);
  const procedures = useClinicalStore(s => s.procedures);
  const labOrders = useClinicalStore(s => s.labOrders);
  const bills = useClinicalStore(s => s.bills);
  const prescriptions = useClinicalStore(s => s.prescriptions);
  const advanceProcedure = useClinicalStore(s => s.advanceProcedure);
  const markLabReceived = useClinicalStore(s => s.markLabReceived);

  const p = patients.find(x => x.id === patientId);
  const [tab, setTab] = React.useState(initialTab || 'Overview');
  const [toothHistory, setToothHistory] = React.useState(null);
  const [toothLoading, setToothLoading] = React.useState(false);

  // Ensure patient is loaded if navigated directly
  React.useEffect(() => {
    if (!patients.find(x => x.id === patientId)) {
      fetchPatient(patientId);
    }
  }, [patientId]);

  // Fetch tooth history from API. Re-runs on patientDataVersion bumps so a tooth
  // dictated by voice (which persists a visit) recolors the map right away.
  React.useEffect(() => {
    if (!patientId) return;
    setToothLoading(true);
    getToothHistory(patientId)
      .then(data => setToothHistory(data))
      .catch(() => {})
      .finally(() => setToothLoading(false));
  }, [patientId, patientDataVersion]);

  // This patient's clinical visits power the Cases → treatment history list.
  React.useEffect(() => {
    if (!patientId) return;
    loadClinicalVisits();
  }, [patientId, patientDataVersion]);

  // Load this patient's lab orders + prescriptions (the latter feeds Billing).
  const loadPatientLabOrders = useClinicalStore(s => s.loadPatientLabOrders);
  const loadPatientPrescriptions = useClinicalStore(s => s.loadPatientPrescriptions);
  React.useEffect(() => {
    if (!patientId) return;
    loadPatientLabOrders(patientId);
    loadPatientPrescriptions(patientId);
  }, [patientId, patientDataVersion]);

  // Case sheet — the live clinical state that drives the control center (active plan,
  // upcoming visit, recent work, balances). One read; backend is the source of truth.
  const [caseSheet, setCaseSheet] = React.useState(null);
  React.useEffect(() => {
    if (!patientId) return;
    getPatientCaseSheet(patientId).then(setCaseSheet).catch(() => {});
  }, [patientId, patientDataVersion]);

  if (!p) return null;

  // Merge: API tooth history overrides local p.teeth
  const apiTeethMap = buildTeethMap(toothHistory);
  const mergedTeeth = Object.keys(apiTeethMap).length > 0
    ? { ...p.teeth, ...apiTeethMap }
    : p.teeth;
  const flags = clinicianFlags(p);
  const outstanding = bills.filter(b => b.patientId === p.id).reduce((s, b) => s + b.outstanding, 0);
  const statusPill = p.status === 'current' ? <Chip label="Current patient" tone="dark" size="lg" /> : p.status === 'new' ? <Chip label="New patient" tone="blueOutline" size="lg" /> : <Chip label="Completed" tone="neutral" size="lg" />;

  // Active treatment = the live case context driving the header + control center.
  const activePlan = (caseSheet?.activeTreatmentPlans || [])[0] || (caseSheet?.allTreatmentPlans || []).find(pl => pl.status === 'active') || null;
  const activeTeeth = activePlan ? ((toothHistory?.treatmentPlans || []).find(tp => tp.id === activePlan.id)?.teeth || []) : [];
  const stageLine = activePlan
    ? `${activePlan.procedure_name || 'Treatment'}${activeTeeth.length ? ` · ${activeTeeth.length > 1 ? 'Teeth ' + activeTeeth.join(', ') : 'Tooth ' + activeTeeth[0]}` : ''} · Sitting ${(activePlan.completed_sittings || 0)} of ${activePlan.total_sittings || 1}`
    : null;

  const handleDeletePatient = async () => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${p.name}? They'll be removed from your lists. This is recoverable in the database.`)) return;
    try {
      await deletePatient(p.id);
      showToast('Patient deleted');
      router.replace('/patients');
    } catch {
      showToast('Could not delete patient');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar title="Patient" onBack={() => router.back()} right={<button onClick={() => openSheet('editPatient', { id: p.id })} style={{ color: 'var(--blue)', display: 'flex' }}><Icon name="pencil" size={20} /></button>} />
      <div className="scroll" style={{ flex: 1 }}>
        {/* hero */}
        <div style={{ padding: '16px 20px', display: 'flex', gap: 14 }}>
          <Avatar name={p.name} size={56} ring />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{p.name}</div>
            <a href={'tel:' + p.phone.replace(/\s/g, '')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 15, textDecoration: 'none', margin: '2px 0' }}><Icon name="phone" size={14} color="var(--blue)" />{p.phone}</a>
            <div className="t-meta" style={{ marginBottom: 8 }}>{p.age} · {p.gender} · {p.bloodGroup}</div>
            {stageLine ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(48,209,88,0.10)', borderRadius: 99, padding: '5px 12px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E8E3E' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#15702F' }}>{stageLine}</span>
              </div>
            ) : statusPill}
          </div>
          {/* Delete lives here — top-right of the name/number, not buried in every tab */}
          <button
            onClick={handleDeletePatient}
            style={{ flexShrink: 0, alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 99, border: '1px solid rgba(255,59,48,0.30)', background: 'rgba(255,59,48,0.06)', color: '#FF3B30', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <Icon name="x" size={13} color="#FF3B30" stroke={2.4} /> Delete
          </button>
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
          {tab === 'Overview' && <OverviewTab p={p} caseSheet={caseSheet} toothHistory={toothHistory} teeth={mergedTeeth} activePlan={activePlan} activeTeeth={activeTeeth} openSheet={openSheet} router={router} setTab={setTab} />}
          {tab === 'Cases' && <CasesTab p={p} procedures={procedures} caseSheet={caseSheet} clinicalVisits={clinicalVisits} toothHistory={toothHistory} openSheet={openSheet} />}
          {tab === 'Tooth Map' && <ToothMapTab p={{ ...p, teeth: mergedTeeth }} bills={bills} openSheet={openSheet} toothHistory={toothHistory} toothLoading={toothLoading} />}
          {tab === 'Media' && <MediaTab p={p} openSheet={openSheet} />}
          {tab === 'Billing' && <BillingTab p={p} prescriptions={prescriptions} openSheet={openSheet} toothHistory={toothHistory} caseSheet={caseSheet} />}
        </div>
      </div>
      <VoiceToolbar onClick={() => openSheet('patientConsult', { patientId: p.id })} />
    </div>
  );
}

export default PatientProfile;
