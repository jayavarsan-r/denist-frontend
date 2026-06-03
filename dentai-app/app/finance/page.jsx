'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { Avatar, EmptyState } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, formatCurrencyK, formatDate, parseDate } from '@/lib/data/utils';

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
  const bills = useClinicalStore((s) => s.bills);
  const labOrders = useClinicalStore((s) => s.labOrders);
  const clinicAccounts = useClinicalStore((s) => s.clinicAccounts);
  const today = TODAY;
  const [showTx, setShowTx] = React.useState(false);

  const collectedToday = clinicAccounts.filter(a => a.type === 'income' && a.date === today).reduce((s, a) => s + a.amount, 0);
  const pendingBills = bills.filter(b => b.outstanding > 0)
    .map(b => { const ageDays = daysBetween(b.createdAt, today); return { ...b, ageDays, overdue: ageDays > 14 }; })
    .sort((a, b) => (b.overdue - a.overdue) || (b.outstanding - a.outstanding));
  const pendingTotal = pendingBills.reduce((s, b) => s + b.outstanding, 0);
  const labDue = labOrders.filter(o => o.status !== 'completed').reduce((s, o) => s + o.costToClinic, 0);
  const recent = [...clinicAccounts].sort((a, b) => b.date.localeCompare(a.date));

  const procLabel = (b) => (b.items && b.items[0] ? b.items[0].description.split(' (')[0] : 'Treatment');
  const labState = (o) => {
    if (o.status === 'sent') return { word: 'Awaiting delivery', color: 'var(--text-tertiary)' };
    if (o.status === 'received' || o.status === 'completed') return { word: 'Delivered · pay lab', color: 'var(--orange)' };
    if (o.status === 'pending') return { word: 'Not sent yet', color: 'var(--text-tertiary)' };
    return { word: o.status, color: 'var(--text-tertiary)' };
  };

  const Stat = ({ value, label, color }) => (
    <div style={{ flex: 1 }}>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
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

        {/* lightweight summary — only what matters during clinic hours */}
        <div style={{ display: 'flex', padding: '14px 22px 6px', gap: 8 }}>
          <Stat value={formatCurrency(collectedToday)} label="Collected today" color="#1E8E3E" />
          <Stat value={formatCurrency(pendingTotal)} label="Patients owe" color={pendingTotal ? 'var(--orange)' : undefined} />
          <Stat value={formatCurrency(labDue)} label="Owed to labs" color={labDue ? 'var(--orange)' : undefined} />
        </div>

        {/* DOMINANT — who hasn't paid */}
        <div style={{ padding: '24px 22px 0' }}>
          <Eyebrow>Pending payments · {pendingBills.length}</Eyebrow>
          {pendingBills.length === 0 ? (
            <div style={{ fontSize: 15, color: 'var(--text-tertiary)', padding: '6px 0' }}>Everyone has paid up.</div>
          ) : (
            <div>
              {pendingBills.map((b, i) => (
                <button key={b.id} onClick={() => router.push('/patients/' + b.patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <Avatar name={b.patientName} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 600 }}>{b.patientName}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{procLabel(b)}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2, color: b.overdue ? 'var(--red)' : 'var(--text-tertiary)' }}>{b.overdue ? `Overdue · ${b.ageDays} days` : b.ageDays === 0 ? 'Billed today' : `${b.ageDays} days ago`}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="tnum" style={{ fontSize: 19, fontWeight: 700, color: b.overdue ? 'var(--red)' : 'var(--orange)' }}>{formatCurrency(b.outstanding)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end', color: 'var(--blue)', fontSize: 13, fontWeight: 600, marginTop: 1 }}>Collect<Icon name="chevRight" size={14} color="var(--blue)" /></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* lab payments — operational states, not a ledger */}
        <div style={{ padding: '28px 22px 0' }}>
          <Eyebrow action={<button onClick={() => router.push('/finance/lab')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>All orders</button>}>Lab payments · {labOrders.length}</Eyebrow>
          <div>
            {labOrders.map((o, i) => {
              const st = labState(o);
              return (
                <button key={o.id} onClick={() => openSheet('labDetail', { id: o.id })} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(50,173,230,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="flask" size={20} color="#1B86B8" /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{o.labName}</div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.patientName} · {o.workDescription.split(',')[0]}</div>
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

        {/* recent activity — secondary, collapsed by default */}
        <div style={{ padding: '28px 22px 32px' }}>
          <button onClick={() => setShowTx(s => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>Recent activity</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{showTx ? 'Hide' : 'Show'}<Icon name={showTx ? 'chevDown' : 'chevRight'} size={14} color="var(--blue)" /></span>
          </button>
          {showTx && (
            <div style={{ marginTop: 6 }}>
              {recent.slice(0, 8).map((a, i) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.type === 'income' ? 'var(--green)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div><div className="t-meta">{formatDate(a.date)}</div></div>
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: a.type === 'income' ? '#1E8E3E' : 'var(--text-secondary)' }}>{a.type === 'income' ? '+' : '−'}{formatCurrency(a.amount)}</span>
                </div>
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
