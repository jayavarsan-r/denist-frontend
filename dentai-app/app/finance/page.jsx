'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { Avatar } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, formatDate, parseDate, MONTHS } from '@/lib/data/utils';

function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

/* faint eyebrow label that sets a section without a box */
function Eyebrow({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 10px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{children}</span>
      {action}
    </div>
  );
}

function FinanceScreen() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const labOrders = useClinicalStore((s) => s.labOrders);
  const clinicAccounts = useClinicalStore((s) => s.clinicAccounts);
  const paymentStats = useClinicalStore((s) => s.paymentStats);
  const pendingPlans = useClinicalStore((s) => s.pendingPlans);
  const loadClinicPayments = useClinicalStore((s) => s.loadClinicPayments);
  const loadLabOrders = useClinicalStore((s) => s.loadLabOrders);
  const loadPaymentStats = useClinicalStore((s) => s.loadPaymentStats);
  const loadPendingPlans = useClinicalStore((s) => s.loadPendingPlans);
  const today = TODAY;
  const [showAllTx, setShowAllTx] = React.useState(false);

  // Everything on this page is clinic-wide and API-backed: collection totals,
  // who still owes (treatment plans with a balance), payments ledger, lab orders.
  React.useEffect(() => {
    loadPaymentStats();
    loadPendingPlans();
    loadClinicPayments();
    loadLabOrders();
  }, []);

  const pending = pendingPlans
    .map((b) => { const ageDays = b.createdAt ? daysBetween(b.createdAt, today) : 0; return { ...b, ageDays, overdue: ageDays > 14 }; })
    .sort((a, b) => (b.overdue - a.overdue) || (b.pendingAmount - a.pendingAmount));
  const pendingTotal = pending.reduce((s, b) => s + b.pendingAmount, 0);
  const labDue = labOrders.filter(o => o.status !== 'completed').reduce((s, o) => s + o.costToClinic, 0);
  const recent = [...clinicAccounts].sort((a, b) => b.date.localeCompare(a.date));
  const visibleTx = showAllTx ? recent.slice(0, 20) : recent.slice(0, 4);
  const monthName = MONTHS[parseDate(today).getMonth()];

  // Tapping a patient anywhere here lands on their Billing tab — what they paid,
  // for which procedure, and what's left.
  const goToBilling = (patientId) => { if (patientId) router.push(`/patients/${patientId}?tab=Billing`); };

  const labState = (o) => {
    if (o.status === 'sent') return { word: 'Awaiting delivery', color: 'var(--text-tertiary)' };
    if (o.status === 'received' || o.status === 'completed') return { word: 'Delivered · pay lab', color: 'var(--orange)' };
    if (o.status === 'pending') return { word: 'Not sent yet', color: 'var(--text-tertiary)' };
    return { word: o.status, color: 'var(--text-tertiary)' };
  };

  const Stat = ({ value, label, color }) => (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="tnum" style={{ fontSize: 21, fontWeight: 700, color: color || 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 1 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div className="scroll" style={{ flex: 1 }}>
        {/* header */}
        <div style={{ padding: '58px 22px 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}>Money</div>
          <button onClick={() => openSheet('addEntry')} style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(60,60,67,0.07)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={22} stroke={2.2} /></button>
        </div>

        {/* earnings — today and the month each get their own number, plus the
            all-time total and what patients still owe */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 22px 6px' }}>
          <Stat value={formatCurrency(paymentStats.today)} label="Collected today" color="#1E8E3E" />
          <Stat value={formatCurrency(paymentStats.month)} label={`This month · ${monthName}`} color="#1E8E3E" />
          <Stat value={formatCurrency(paymentStats.total)} label="Total collected" />
          <Stat value={formatCurrency(pendingTotal)} label="Patients owe" color={pendingTotal ? 'var(--orange)' : undefined} />
        </div>

        {/* DOMINANT — who hasn't paid, and how much of the quote is already in */}
        <div style={{ padding: '24px 22px 0' }}>
          <Eyebrow>Pending payments · {pending.length}</Eyebrow>
          {pending.length === 0 ? (
            <div style={{ fontSize: 15, color: 'var(--text-tertiary)', padding: '6px 0' }}>Everyone has paid up.</div>
          ) : (
            <div>
              {pending.map((b, i) => (
                <button key={b.id} onClick={() => goToBilling(b.patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <Avatar name={b.patientName} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 600 }}>{b.patientName}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.procedure}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2, color: b.overdue ? 'var(--red)' : 'var(--text-tertiary)' }}>
                      {formatCurrency(b.collectedAmount)} of {formatCurrency(b.estimatedCost)} paid{b.overdue ? ` · overdue ${b.ageDays}d` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="tnum" style={{ fontSize: 19, fontWeight: 700, color: b.overdue ? 'var(--red)' : 'var(--orange)' }}>{formatCurrency(b.pendingAmount)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end', color: 'var(--blue)', fontSize: 13, fontWeight: 600, marginTop: 1 }}>Collect<Icon name="chevRight" size={14} color="var(--blue)" /></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* lab payments — operational states, not a ledger */}
        <div style={{ padding: '28px 22px 0' }}>
          <Eyebrow action={<button onClick={() => router.push('/finance/lab')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>All orders</button>}>
            Lab payments · {labOrders.length}{labDue > 0 ? ` · ${formatCurrency(labDue)} due` : ''}
          </Eyebrow>
          <div>
            {labOrders.length === 0 && <div style={{ fontSize: 15, color: 'var(--text-tertiary)', padding: '6px 0' }}>No lab orders.</div>}
            {labOrders.map((o, i) => {
              const st = labState(o);
              return (
                <button key={o.id} onClick={() => openSheet('labDetail', { id: o.id })} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(50,173,230,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="flask" size={20} color="#1B86B8" /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{o.labName}</div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.patientName} · {(o.workDescription || '').split(',')[0]}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="tnum" style={{ fontSize: 16, fontWeight: 700 }}>{formatCurrency(o.costToClinic)}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: st.color, marginTop: 1 }}>{st.word}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* recent payments — open by default; each row says what it paid for */}
        <div style={{ padding: '28px 22px 32px' }}>
          <Eyebrow action={recent.length > 4 ? (
            <button onClick={() => setShowAllTx(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>
              {showAllTx ? 'Show less' : 'Show all'}<Icon name={showAllTx ? 'chevDown' : 'chevRight'} size={14} color="var(--blue)" />
            </button>
          ) : null}>Recent payments</Eyebrow>
          {visibleTx.length === 0 ? (
            <div style={{ fontSize: 15, color: 'var(--text-tertiary)', padding: '6px 0' }}>No payments recorded yet.</div>
          ) : (
            <div>
              {visibleTx.map((a, i) => (
                <button key={a.id} onClick={() => goToBilling(a.patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.type === 'income' ? 'var(--green)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>
                    <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[a.procedure, a.date && formatDate(a.date)].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className="tnum" style={{ fontSize: 14.5, fontWeight: 600, color: a.type === 'income' ? '#1E8E3E' : 'var(--text-secondary)', flexShrink: 0 }}>{a.type === 'income' ? '+' : '−'}{formatCurrency(a.amount)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FinancePage() {
  return <FinanceScreen />;
}
