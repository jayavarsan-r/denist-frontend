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
  const queue = useQueueStore(s => s.queue);
  const checkout = useQueueStore(s => s.checkout);
  const patients = usePatientStore(s => s.patients);

  const entry = queue.find(e => e.id === entryId);
  const p = entry && patients.find(x => x.id === entry.patientId);
  const c = entry && entry.consult;
  const [sittings, setSittings] = React.useState(c ? c.totalSittings : 1);
  const [cost, setCost] = React.useState(c ? c.estimatedCost : 0);
  const [editingCost, setEditingCost] = React.useState(false);
  const [collected, setCollected] = React.useState('');
  const [method, setMethod] = React.useState('UPI');
  if (!entry || !p || !c) return null;

  const paid = parseInt(collected) || 0;
  const balance = Math.max(0, cost - paid);
  const status = paid === 0 ? 'unpaid' : balance === 0 ? 'paid' : 'partial';
  const statusColor = status === 'paid' ? '#1E8E3E' : status === 'partial' ? 'var(--orange)' : 'var(--red)';

  const complete = () => {
    checkout(entry.id, { patientName: p.name, procedure: `${c.procedure}${c.tooth ? ' · Tooth ' + c.tooth : ''}`, amount: paid });
    showToast('Checked out · ' + formatCurrency(paid) + ' collected');
    router.push('/reception');
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
            <div className="t-meta">Token #{entry.tokenNumber} · {p.age} · {p.gender}</div>
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
            <div style={{ marginLeft: 'auto' }}>{(() => { const o = CONSULT_OUTCOMES.find(x => x.id === entry.outcome); return o ? <Chip label={o.label} tone={o.tone} /> : null; })()}</div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Collecting now</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="tnum" style={{ fontSize: 16, fontWeight: 700, color: '#1E8E3E' }}>₹</span><input value={collected} onChange={e => setCollected(e.target.value)} inputMode="numeric" placeholder="0" className="tnum" style={{ width: 90, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontSize: 17, fontWeight: 700, color: '#1E8E3E', fontFamily: 'inherit' }} /></div>
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
            <SectionHeader right={<div style={{ display: 'flex', gap: 14 }}><button onClick={() => showToast('Generating PDF…')} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="printer" size={14} color="var(--blue)" />PDF</button><button onClick={() => showToast('Shared via WhatsApp')} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="share" size={14} color="var(--blue)" />Share</button></div>}>Prescription</SectionHeader>
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

        {/* confirm */}
        <PrimaryButton onClick={complete} style={{ height: 54 }}>{balance > 0 ? 'Approve & checkout · ' + formatCurrency(paid) : 'Approve & checkout'}</PrimaryButton>
        <button onClick={() => router.back()} style={{ width: '100%', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 15, fontWeight: 500, padding: '14px 0 2px' }}>Save & review later</button>
      </div>
    </div>
  );
}

export default CheckoutScreen;
