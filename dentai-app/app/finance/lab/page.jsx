'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { NavBar, EmptyState, SelectPill, StatusChip } from '@/components/ui';
import { ToothChip } from '@/components/ui';
import { STATUS_CHIP } from '@/components/ui/StatusChip';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency, formatCurrencyK, formatDate, parseDate } from '@/lib/data/utils';

function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

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

const LAB_FILTERS = ['All', 'pending', 'sent', 'received', 'completed'];

function LabScreen() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const labOrders = useClinicalStore((s) => s.labOrders);
  const markLabReceived = useClinicalStore((s) => s.markLabReceived);
  const [filter, setFilter] = React.useState('All');
  const orders = labOrders.filter(o => filter === 'All' || o.status === filter);
  const activeCount = labOrders.filter(o => o.status === 'sent' || o.status === 'pending').length;
  const owed = labOrders.filter(o => o.status !== 'completed').reduce((s, o) => s + o.costToClinic, 0);
  const margin = labOrders.reduce((s, o) => s + (o.chargedToPatient - o.costToClinic), 0);



  const summary = [
    { v: activeCount, l: 'Orders active', c: 'var(--text-primary)' },
    { v: formatCurrencyK(owed), l: 'Owed to labs', c: 'var(--orange)' },
    { v: formatCurrencyK(margin), l: 'Margin on lab', c: '#1E8E3E' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar title="Lab orders" onBack={() => router.back()} right={<button onClick={() => openSheet('newLab', {})} style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="plus" size={24} stroke={2.2} /></button>} />
      <div className="scroll" style={{ flex: 1, padding: '14px 0 24px' }}>
        <div className="noscroll-x" style={{ display: 'flex', gap: 8, padding: '0 20px 14px' }}>
          {LAB_FILTERS.map(f => <SelectPill key={f} label={f === 'All' ? 'All' : STATUS_CHIP[f][0]} active={filter === f} onClick={() => setFilter(f)} />)}
        </div>
        <div className="noscroll-x" style={{ display: 'flex', gap: 12, padding: '0 20px 18px' }}>
          {summary.map((s, i) => (
            <div key={i} className="card" style={{ flexShrink: 0, minWidth: 130, padding: 16 }}>
              <div className="tnum" style={{ fontSize: 26, fontWeight: 700, color: s.c }}>{s.v}</div>
              <div className="t-meta" style={{ marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '0 20px' }}>
          {orders.length === 0 ? <div className="card"><EmptyState icon="flask" title="No lab orders" hint="Tap + to create one" /></div> : orders.map(o => <LabOrderCard key={o.id} order={o} openSheet={openSheet} markLabReceived={markLabReceived} />)}
        </div>
      </div>
    </div>
  );
}

export default function LabPage() {
  return <LabScreen />;
}
