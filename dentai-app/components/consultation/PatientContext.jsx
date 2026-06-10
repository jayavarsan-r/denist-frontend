'use client';
import React, { useEffect, useState, useRef } from 'react';
import Icon from '@/components/icons';
import { formatCurrency, formatDate } from '@/lib/data/utils';
import { getPatientCaseSheet } from '@/lib/services/patient.service';
import { getXrayUrl } from '@/lib/services/xray.service';

const LAB_DOT = { pending: '#F59E0B', sent: '#3B82F6', received: '#0891B2', completed: '#9CA3AF' };
const PLAN_TONE = { active: '#1E8E3E', completed: '#9CA3AF', cancelled: '#EF4444' };

// The consult screen shows ONLY this check-in's x-rays (what the receptionist just
// uploaded for this visit) — the full history lives on the patient details page.
// We isolate the most recent UPLOAD BATCH via created_at (x-rays uploaded together at
// check-in land within a couple of minutes of each other), so a patient with older
// x-rays from the same day still only shows the current one(s).
function latestSessionXrays(all = []) {
  if (!all.length) return all;
  const t = (x) => new Date(x.created_at || x.date_taken || 0).getTime() || 0;
  const maxT = Math.max(...all.map(t));
  if (!maxT) return all.slice(0, 1);
  const WINDOW = 10 * 60 * 1000; // 10 min — one check-in upload session
  return all.filter((x) => maxT - t(x) <= WINDOW);
}

function Card({ title, action, children }) {
  return (
    <div style={{ padding: '16px 20px 0' }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 8px 2px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{title}</span>
          {action}
        </div>
      )}
      <div className="card" style={{ padding: 14, borderRadius: 18 }}>{children}</div>
    </div>
  );
}

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 30 }}>
      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: valueColor || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export default function PatientContext({ patientId, onTypeResolved }) {
  const [cs, setCs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [xrayUrls, setXrayUrls] = useState({}); // id -> url
  const reqRef = useRef(0);

  useEffect(() => {
    // Request-id guard: the latest request ALWAYS resolves `loading` (never stranded
    // by mount/cleanup), while stale responses are ignored.
    if (!patientId) { setCs(null); setLoading(false); return; }
    const myReq = ++reqRef.current;
    setLoading(true);
    // Safety timeout: a hung request (e.g. backend mid-restart) must never strand the spinner.
    const timer = setTimeout(() => { if (reqRef.current === myReq) setLoading(false); }, 12000);
    getPatientCaseSheet(patientId)
      .then((data) => { if (reqRef.current === myReq) setCs(data); })
      .catch(() => { if (reqRef.current === myReq) setCs(null); })
      .finally(() => { if (reqRef.current === myReq) { clearTimeout(timer); setLoading(false); } });
    return () => clearTimeout(timer);
  }, [patientId]);

  // Resolve viewable URLs for x-rays (best-effort, skip failures).
  // Only this check-in's x-rays belong on the consult screen — the full history lives
  // on the patient details page.
  useEffect(() => {
    const xrays = latestSessionXrays(cs?.xrays || []);
    if (!xrays.length) return;
    let alive = true;
    Promise.all(xrays.slice(0, 8).map(async (x) => {
      try { const { url } = await getXrayUrl(x.id); return [x.id, url]; } catch { return [x.id, null]; }
    })).then((pairs) => {
      if (!alive) return;
      setXrayUrls(Object.fromEntries(pairs.filter(([, u]) => u)));
    });
    return () => { alive = false; };
  }, [cs]);

  // Appointment vs consultation: appointment patient if a scheduled appt exists for today.
  const today = new Date().toISOString().slice(0, 10);
  const todaysAppt = (cs?.upcomingAppointments || []).find((a) => a.appointment_date === today);
  const isAppointment = !!todaysAppt;
  useEffect(() => { if (cs) onTypeResolved?.(isAppointment ? 'appointment' : 'consultation'); }, [cs]);

  if (loading) {
    return (
      <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
      </div>
    );
  }
  if (!cs) return null;

  const plan = (cs.activeTreatmentPlans || [])[0] || (cs.allTreatmentPlans || [])[0];
  const labs = cs.labOrders || [];
  // Consult screen shows ONLY this check-in's x-rays (latest session). Full history
  // lives on the patient details page.
  const xrays = latestSessionXrays(cs.xrays || []);
  const lastVisit = (cs.visits || [])[0];
  const pending = cs.summary?.pendingAmount || 0;

  return (
    <>
      {/* This visit — appointment vs consultation */}
      <Card title="This visit">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: isAppointment ? 'rgba(0,122,255,0.1)' : 'rgba(48,209,88,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={isAppointment ? 'calendar' : 'stethoscope'} size={20} color={isAppointment ? '#007AFF' : '#1E8E3E'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>{isAppointment ? 'Appointment patient' : 'Consultation patient'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 1 }}>
              {isAppointment
                ? `${todaysAppt.purpose || 'Scheduled visit'}${todaysAppt.sitting_number ? ` · Sitting ${todaysAppt.sitting_number}` : ''}`
                : (lastVisit ? `Last seen ${formatDate(lastVisit.visit_date)}` : 'First visit')}
            </div>
          </div>
        </div>
      </Card>

      {/* Active treatment plan */}
      {plan && (
        <Card title="Treatment plan">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{plan.procedure_name || 'Treatment plan'}</div>
            <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'capitalize', color: PLAN_TONE[plan.status] || 'var(--text-secondary)', flexShrink: 0 }}>{plan.status || 'active'}</span>
          </div>
          {plan.diagnosis && <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 10 }}>{plan.diagnosis}</div>}
          {(() => {
            const total = plan.total_sittings || 1;
            const done = plan.completed_sittings || 0;
            const remaining = Math.max(0, total - done);
            return (
              <>
                <Row label="Sittings" value={`${done} of ${total} done · ${remaining} more`} />
                {/* progress bar */}
                <div style={{ height: 6, borderRadius: 99, background: 'rgba(60,60,67,0.1)', margin: '6px 0 10px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (done / total) * 100)}%`, background: 'var(--accent)', borderRadius: 99 }} />
                </div>
              </>
            );
          })()}
          <Row label="Estimated cost" value={formatCurrency(plan.estimated_cost || 0)} />
          {pending > 0 && <Row label="Pending balance" value={formatCurrency(pending)} valueColor="#C77700" />}
        </Card>
      )}

      {/* X-rays — tap a thumbnail to open the full image */}
      {xrays.length > 0 && (
        <Card title={`X-rays · ${xrays.length}`}>
          <div className="noscroll-x" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {xrays.slice(0, 8).map((x) => {
              const url = xrayUrls[x.id];
              return (
                <button
                  key={x.id}
                  onClick={() => url && window.open(url, '_blank')}
                  style={{ flexShrink: 0, width: 132, textAlign: 'center', background: 'none', border: 'none', padding: 0, cursor: url ? 'pointer' : 'default' }}
                >
                  <div style={{ width: 132, height: 100, borderRadius: 12, background: '#0B0B0C', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                    {url
                      ? <img src={url} alt={x.xray_type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 5, fontWeight: 600 }}>
                    {x.xray_type}{x.tooth_number ? ` · ${x.tooth_number}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Lab reports */}
      {labs.length > 0 && (
        <Card title="Lab reports">
          {labs.slice(0, 5).map((l, i) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: LAB_DOT[l.status] || '#9CA3AF', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{l.procedure_type || l.work_description || 'Lab work'}{l.tooth_number ? ` · Tooth ${l.tooth_number}` : ''}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{[l.lab_name, l.expected_return_date && `Expected ${formatDate(l.expected_return_date)}`].filter(Boolean).join(' · ')}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: LAB_DOT[l.status] || '#9CA3AF', textTransform: 'capitalize', flexShrink: 0 }}>{l.status}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
