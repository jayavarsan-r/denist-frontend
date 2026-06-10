'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import Icon from '@/components/icons';
import { Avatar, Chip, StatusChip, SectionHeader, NavBar, PrimaryButton, ToothChip } from '@/components/ui';
import { formatCurrency, clinicianFlags, hasComplications, formatTime, parseDate, MONTHS, DAYS } from '@/lib/data/utils';
import { CONSULT_OUTCOMES } from '@/lib/data/queue';
import { recordPayment } from '@/lib/services/payment.service';
import { updateTreatmentPlan } from '@/lib/services/treatment-plan.service';
import { fetchPrescriptionPdfBlob } from '@/lib/services/prescription.service';
import { getCheckoutSummary } from '@/lib/services/queue.service';

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


function CheckoutScreen({ entryId }) {
  const router = useRouter();
  const openSheet = useAppStore(s => s.openSheet);
  const showToast = useAppStore(s => s.showToast);
  const role = useAppStore(s => s.role);
  const clinicSettings = useAppStore(s => s.clinic?.settings);
  // Doctors always can; receptionists only when the doctor enabled the clinic setting.
  const canAddMedicines = role !== 'receptionist' || !!clinicSettings?.receptionistCanAddMedicines;
  const queue = useQueueStore(s => s.queue);
  const checkout = useQueueStore(s => s.checkout);
  const patients = usePatientStore(s => s.patients);
  const fetchPatient = usePatientStore(s => s.fetchPatient);

  const entry = queue.find(e => e.id === entryId);
  const [summary, setSummary] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState(false);
  const [sittings, setSittings] = React.useState(1);
  const [cost, setCost] = React.useState(0);
  const [editingCost, setEditingCost] = React.useState(false);
  const [collected, setCollected] = React.useState('');
  const [method, setMethod] = React.useState('UPI');

  // Source of truth: persisted consultation summary from the backend (works for the
  // receptionist / any session). Falls back to the doctor's same-session consult data.
  React.useEffect(() => {
    let alive = true;
    setLoadErr(false);
    getCheckoutSummary(entryId)
      .then(s => { if (alive) setSummary(s); })
      .catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [entryId]);

  const c = summary || (entry && entry.consult) || null;
  const patientId = entry?.patientId || summary?.patient?.id;
  let p = patients.find(x => x.id === patientId);
  if (!p && summary?.patient) {
    // Minimal safe fallback until the normalised patient loads (avoid raw-shape crashes).
    p = { ...summary.patient, allergies: Array.isArray(summary.patient.allergies) ? summary.patient.allergies : [] };
  }

  // Ensure the patient is cached (receptionist may not have loaded them).
  React.useEffect(() => {
    if (patientId && !patients.find(x => x.id === patientId)) fetchPatient(patientId).catch(() => {});
  }, [patientId]);

  // Sync the editable cost/sittings once the consult data arrives.
  React.useEffect(() => {
    if (c) { setSittings(c.totalSittings || 1); setCost(c.estimatedCost || 0); }
  }, [c?.treatmentPlanId, c?.procedure, c?.estimatedCost]);

  // Loading / error states — never render blank.
  if (!c && !loadErr) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <NavBar title="Checkout" onBack={() => router.back()} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Loading checkout…</div>
        </div>
      </div>
    );
  }
  if (!c || !p) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <NavBar title="Checkout" onBack={() => router.back()} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px', textAlign: 'center' }}>
          <Icon name="alert" size={32} color="var(--text-tertiary)" />
          <div style={{ fontSize: 16, fontWeight: 600 }}>Consultation not found</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>This visit has no recorded consultation yet, or it couldn't be loaded.</div>
          <button onClick={() => router.push('/reception')} style={{ marginTop: 8, color: 'var(--blue)', fontSize: 15, fontWeight: 600 }}>Back to queue</button>
        </div>
      </div>
    );
  }

  const paid = parseInt(collected) || 0;
  const balance = Math.max(0, cost - paid);
  const status = paid === 0 ? 'unpaid' : balance === 0 ? 'paid' : 'partial';
  const statusColor = status === 'paid' ? '#1E8E3E' : status === 'partial' ? 'var(--orange)' : 'var(--red)';

  const complete = async () => {
    // Persist an edited quoted price to the plan so the doctor's UI reflects the change
    // too (otherwise the doctor keeps seeing the originally advised fee).
    if (c.treatmentPlanId && cost !== (c.estimatedCost || 0)) {
      try { await updateTreatmentPlan(c.treatmentPlanId, { estimatedCost: cost }); } catch { /* non-fatal */ }
    }
    // Only record a payment when money is actually collected (the API rejects ₹0).
    if (paid > 0) {
      try {
        await recordPayment({
          patientId,
          treatmentPlanId: c.treatmentPlanId || null,
          queueEntryId: entryId,
          amount: paid,
          paymentMethod: method.toLowerCase(),
          notes: '',
        });
      } catch (e) {
        showToast(e?.response?.data?.message || e?.apiError?.message || 'Payment record failed');
        return;
      }
    }
    const summ = { patientName: p.name, procedure: `${c.procedure}${c.tooth ? ' · Tooth ' + c.tooth : ''}`, amount: paid };
    checkout(entryId, summ);
    showToast(paid > 0 ? 'Checked out · ' + formatCurrency(paid) + ' collected' : 'Checked out');
    router.push('/reception');
  };

  const openPrescriptionPdf = async (rxId) => {
    if (!rxId) { showToast('Prescription is still generating…'); return; }
    try {
      const blob = await fetchPrescriptionPdfBlob(rxId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      showToast('Could not open the PDF');
    }
  };

  // Share the prescription PDF via the OS share sheet (Instagram, WhatsApp, etc.).
  // Falls back to WhatsApp if the device can't share files.
  const sharePrescription = async (rxId) => {
    if (!rxId) { showToast('Prescription is still generating…'); return; }
    try {
      const blob = await fetchPrescriptionPdfBlob(rxId);
      const file = new File([blob], `${(p?.name || 'patient').replace(/\s+/g, '_')}_prescription.pdf`, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Prescription', text: `Prescription for ${p?.name || ''}`.trim() });
        return;
      }
      // No file-share support (e.g. desktop) → open WhatsApp to the patient.
      const phone = (p?.phone || '').replace(/\D/g, '').slice(-10);
      window.open(phone ? `https://wa.me/91${phone}` : 'https://wa.me/', '_blank');
      showToast('Opening WhatsApp — attach the PDF');
    } catch (e) {
      if (e?.name !== 'AbortError') showToast('Could not share');
    }
  };

  const Row = ({ k, v, color, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
      <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span>
      <span className="tnum" style={{ fontSize: 15, fontWeight: bold ? 700 : 600, color: color || 'var(--text-primary)' }}>{v}</span>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar title="Checkout" onBack={() => router.back()} right={<StatusChip status={status} />} />
      <div className="scroll" style={{ flex: 1, padding: '16px 20px 28px' }}>
        {/* patient */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Avatar name={p.name} size={50} ring dot={hasComplications(p)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{p.name}</div>
            <div className="t-meta">{(c.tokenNumber ?? entry?.tokenNumber) ? `Token #${c.tokenNumber ?? entry?.tokenNumber} · ` : ''}{p.age} · {p.gender}</div>
          </div>
          <button onClick={() => router.push('/patients/' + p.id)} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Profile</button>
        </div>

        {hasComplications(p) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
            <Icon name="alert" size={16} color="var(--red)" /><span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--red)' }}>{clinicianFlags(p).join(' · ')}</span>
          </div>
        )}

        {/* procedure summary */}
        <SectionHeader>Today's procedure</SectionHeader>
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{c.procedure}</span>
            {c.tooth && <ToothChip tooth={c.tooth} />}
            <div style={{ marginLeft: 'auto' }}>{(() => { const o = CONSULT_OUTCOMES.find(x => x.id === (c.outcome ?? entry?.outcome)); return o ? <Chip label={o.label} tone={o.tone} /> : null; })()}</div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 14 }}>{c.diagnosis}</div>
          {/* sittings stepper */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
            <div><div style={{ fontSize: 15, fontWeight: 600 }}>Sittings planned</div><div className="t-meta">Sitting {c.sittingDone || 1} done today</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setSittings(s => Math.max(1, s - 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600 }}>−</button>
              <span className="tnum" style={{ fontSize: 18, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{sittings}</span>
              <button onClick={() => setSittings(s => Math.min(10, s + 1))} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600 }}>+</button>
            </div>
          </div>
        </div>

        {/* cost + payment */}
        <SectionHeader>Payment</SectionHeader>
        <div className="card" style={{ padding: '8px 16px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Quoted price</span>
            {editingCost ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="tnum" style={{ fontSize: 15, fontWeight: 700 }}>₹</span><input autoFocus value={cost} onChange={e => setCost(parseInt(e.target.value) || 0)} onBlur={() => setEditingCost(false)} inputMode="numeric" className="tnum" style={{ width: 72, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--blue)', outline: 'none', fontSize: 15, fontWeight: 700, fontFamily: 'inherit' }} /></div>
            ) : (
              <button onClick={() => setEditingCost(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="tnum" style={{ fontSize: 16, fontWeight: 700 }}>{formatCurrency(cost)}</span><Icon name="pencil" size={14} color="var(--blue)" /></button>
            )}
          </div>
          {/* Collect now — the primary receptionist action, made large and obvious */}
          <div style={{ padding: '12px 0 4px', borderTop: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Collect now</span>
              {cost > 0 && <button onClick={() => setCollected(String(cost))} style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', background: 'rgba(0,122,255,0.08)', borderRadius: 99, padding: '5px 12px' }}>Full · {formatCurrency(cost)}</button>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(48,209,88,0.08)', border: '1.5px solid rgba(48,209,88,0.30)', borderRadius: 14, padding: '12px 16px' }}>
              <span className="tnum" style={{ fontSize: 26, fontWeight: 800, color: '#1E8E3E' }}>₹</span>
              <input value={collected} onChange={e => setCollected(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" autoFocus className="tnum" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 28, fontWeight: 800, color: '#1E8E3E', fontFamily: 'inherit' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '12px 0 6px' }}>
            {['Cash', 'UPI', 'Card'].map(m => <button key={m} onClick={() => setMethod(m)} style={{ flex: 1, height: 38, borderRadius: 11, fontSize: 14, fontWeight: 600, background: method === m ? 'var(--accent)' : '#fff', color: method === m ? 'var(--accent-ink)' : 'var(--text-secondary)', border: method === m ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{m === 'Card' && <Icon name="card" size={15} color={method === m ? 'var(--accent-ink)' : 'var(--text-secondary)'} />}{m}</button>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 2px', borderTop: '1px solid var(--border-light)', marginTop: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Balance</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="tnum" style={{ fontSize: 17, fontWeight: 700, color: balance > 0 ? 'var(--orange)' : '#1E8E3E' }}>{formatCurrency(balance)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{status}</span>
            </div>
          </div>
        </div>

        {/* appointments */}
        {c.appointments && c.appointments.length > 0 && (
          <>
            <SectionHeader right={<span className="t-meta">Auto-scheduled</span>}>Next appointments</SectionHeader>
            <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              {c.appointments.map((a, i) => {
                const d = parseDate(a.date);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ width: 40, textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{MONTHS[d.getMonth()]}</div>
                      <div className="tnum" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</div>
                    </div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{a.purpose}</div><div className="t-meta">{DAYS[d.getDay()]} · {formatTime(a.time).label}</div></div>
                    <Chip label="Scheduled" tone="neutral" />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* prescription */}
        {c.medicines && c.medicines.length > 0 && (
          <>
            <SectionHeader right={<div style={{ display: 'flex', gap: 14 }}><button onClick={() => openPrescriptionPdf(c.prescriptionId || c.prescription_id || null)} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="printer" size={14} color="var(--blue)" />PDF</button><button onClick={() => sharePrescription(c.prescriptionId || c.prescription_id || null)} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="share" size={14} color="var(--blue)" />Share</button></div>}>Prescription</SectionHeader>
            <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
              {/* column header */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', background: 'rgba(60,60,67,0.03)', borderBottom: '1px solid var(--border-light)' }}>
                <span className="t-section" style={{ flex: 1 }}>Medicine</span>
                <span className="t-section">B · L · D</span>
              </div>
              {c.medicines.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{m.name} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{m.dose}</span></div>
                    <div className="t-meta">{m.frequency} · {m.duration} · {m.timing}</div>
                  </div>
                  <MealTiming slots={m.slots} />
                </div>
              ))}
              {c.instructions && <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-light)', background: 'rgba(60,60,67,0.02)' }}><div className="t-section" style={{ marginBottom: 3 }}>Instructions</div><div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-primary)' }}>{c.instructions}</div></div>}
            </div>
          </>
        )}

        {/* Add / edit medicines — doctors always; receptionists when permitted (#5) */}
        {canAddMedicines && patientId && (
          <button onClick={() => openSheet('rx', { patientId })} className="card tap" style={{ width: '100%', height: 48, color: 'var(--blue)', fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="plus" size={16} color="var(--blue)" /> Add / edit medicines
          </button>
        )}

        {/* confirm */}
        <PrimaryButton onClick={complete} style={{ height: 56 }}>{paid > 0 ? 'Collect ' + formatCurrency(paid) + ' & check out' : 'Check out'}</PrimaryButton>
        <button onClick={() => router.back()} style={{ width: '100%', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 15, fontWeight: 500, padding: '14px 0 2px' }}>Save & review later</button>
      </div>
    </div>
  );
}

export default CheckoutScreen;
