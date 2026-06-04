'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { NavBar, StatusChip, ToothChip } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';
import { formatDate, parseDate } from '@/lib/data/utils';

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

const PALETTE = {
  pending:   { dot: '#F59E0B', bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.22)' },
  sent:      { dot: '#3B82F6', bg: 'rgba(59,130,246,0.06)',  border: 'rgba(59,130,246,0.18)'  },
  received:  { dot: '#0891B2', bg: 'rgba(8,145,178,0.07)',   border: 'rgba(8,145,178,0.2)'   },
  completed: { dot: '#9CA3AF', bg: 'transparent',            border: 'var(--border-light)'   },
  overdue:   { dot: '#EF4444', bg: 'rgba(239,68,68,0.05)',   border: 'rgba(239,68,68,0.28)'  },
};

function LabOrderCard({ order, openSheet, markLabReceived }) {
  const margin = order.chargedToPatient - order.costToClinic;
  const overdue = order.status === 'sent' && order.expectedReturnDate < TODAY;
  const rem = daysBetween(TODAY, order.expectedReturnDate);
  const isDone = order.status === 'completed';

  const timeLabel = isDone
    ? (order.actualReturnDate ? 'Returned ' + formatDate(order.actualReturnDate) : 'Returned')
    : overdue ? Math.abs(rem) + 'd overdue'
    : rem === 0 ? 'Due today'
    : rem > 0 ? rem + 'd left' : '';

  const pal = overdue ? PALETTE.overdue : (PALETTE[order.status] || PALETTE.sent);

  return (
    <button
      onClick={() => openSheet('labDetail', { id: order.id })}
      className="tap"
      style={{
        width: '100%', textAlign: 'left', display: 'block',
        background: pal.bg, border: '1px solid ' + pal.border,
        borderRadius: 18, padding: 16, marginBottom: 10,
        opacity: isDone ? 0.58 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: pal.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>{order.labName}</span>
        </div>
        <StatusChip status={overdue ? 'overdue' : order.status} />
      </div>

      <div style={{ paddingLeft: 16 }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 3 }}>
          {order.patientName}{order.toothNumber ? ' · Tooth ' + order.toothNumber : ''}
        </div>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 10 }}>
          {order.workDescription}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: overdue ? 700 : 500, color: overdue ? '#EF4444' : rem === 0 ? '#F59E0B' : 'var(--text-tertiary)' }}>
            {timeLabel}
          </span>
          <span className="tnum" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
            ₹{(order.costToClinic||0).toLocaleString('en-IN')}
            {margin > 0 && <span style={{ color: '#16A34A', fontWeight: 600 }}> · +₹{margin.toLocaleString('en-IN')}</span>}
          </span>
        </div>
      </div>

      {order.status === 'sent' && (
        <button
          onClick={(e) => { e.stopPropagation(); markLabReceived(order.id); }}
          style={{
            marginTop: 12, width: '100%', height: 40, borderRadius: 12,
            background: overdue ? '#EF4444' : 'var(--accent)',
            color: '#fff', fontSize: 14, fontWeight: 700, border: 'none',
          }}
        >
          {overdue ? '⚠ Mark received — overdue' : 'Mark received'}
        </button>
      )}
    </button>
  );
}

const FILTERS = [
  { id: 'All', label: 'All' }, { id: 'pending', label: 'Pending' },
  { id: 'sent', label: 'Sent' }, { id: 'received', label: 'Received' }, { id: 'completed', label: 'Completed' },
];

function LabScreen() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const labOrders = useClinicalStore((s) => s.labOrders);
  const markLabReceived = useClinicalStore((s) => s.markLabReceived);
  const [filter, setFilter] = React.useState('All');

  const orders = labOrders.filter(o => filter === 'All' || o.status === filter);
  const activeCount = labOrders.filter(o => o.status === 'sent' || o.status === 'pending').length;
  const overdueCount = labOrders.filter(o => o.status === 'sent' && o.expectedReturnDate < TODAY).length;
  const owed = labOrders.filter(o => o.status !== 'completed').reduce((s, o) => s + (o.costToClinic||0), 0);
  const margin = labOrders.reduce((s, o) => s + ((o.chargedToPatient||0) - (o.costToClinic||0)), 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar
        title="Lab orders"
        onBack={() => router.back()}
        right={
          <button onClick={() => openSheet('newLab', {})} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={20} stroke={2.4} color="var(--accent-ink)" />
          </button>
        }
      />

      <div className="scroll" style={{ flex: 1, padding: '16px 20px 32px' }}>

        {/* ── Stats — one card, 3 columns, always visible ── */}
        <div style={{ background: 'var(--surface)', borderRadius: 20, display: 'flex', boxShadow: 'var(--elevation-1)', marginBottom: 18, padding: '16px 0' }}>
          {[
            { value: activeCount, label: 'Active', alert: overdueCount > 0 ? overdueCount + ' overdue' : null, color: activeCount > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' },
            { value: '₹' + owed.toLocaleString('en-IN'), label: 'Owed to labs', color: owed > 0 ? '#EA580C' : 'var(--text-tertiary)' },
            { value: '₹' + margin.toLocaleString('en-IN'), label: 'Your margin', color: margin > 0 ? '#16A34A' : 'var(--text-tertiary)' },
          ].map((s, i, arr) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid var(--border-light)' : 'none', padding: '0 10px' }}>
              {s.alert && <div style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', letterSpacing: '0.04em', marginBottom: 2 }}>{s.alert.toUpperCase()}</div>}
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1.15 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Filter pills ── */}
        <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto', paddingBottom: 2 }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                height: 34, padding: '0 16px', borderRadius: 99, flexShrink: 0,
                fontSize: 14, fontWeight: 600,
                background: active ? 'var(--accent)' : 'var(--surface)',
                color: active ? 'var(--accent-ink)' : 'var(--text-secondary)',
                border: active ? 'none' : '1px solid var(--border)',
                boxShadow: active ? 'none' : 'var(--elevation-1)',
              }}>{f.label}</button>
            );
          })}
        </div>

        {/* ── List or empty state ── */}
        {orders.length === 0 ? (
          <div style={{ paddingTop: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(8,145,178,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="flask" size={30} color="#0891B2" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>No lab orders</div>
            <div style={{ fontSize: 14, color: 'var(--text-tertiary)', textAlign: 'center', maxWidth: 220, lineHeight: 1.5 }}>
              {filter === 'All' ? 'Send your first crown or RCT to a lab' : 'No ' + filter + ' orders right now'}
            </div>
            {filter === 'All' && (
              <button onClick={() => openSheet('newLab', {})} style={{ marginTop: 8, height: 44, padding: '0 24px', borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 15, fontWeight: 700, border: 'none' }}>
                + New lab order
              </button>
            )}
          </div>
        ) : (
          orders.map(o => <LabOrderCard key={o.id} order={o} openSheet={openSheet} markLabReceived={markLabReceived} />)
        )}
      </div>
    </div>
  );
}

export default function LabPage() {
  return <LabScreen />;
}
