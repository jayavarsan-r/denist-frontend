'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, StatusChip, PrimaryButton, SelectPill } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';
import { formatCurrency } from '@/lib/data/utils';
import { recordPayment } from '@/lib/services/payment.service';

export default function BillSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const procedures = useClinicalStore((s) => s.procedures);
  const bills = useClinicalStore((s) => s.bills);
  const saveBill = useClinicalStore((s) => s.saveBill);
  const existing = params.billId && bills.find(b => b.id === params.billId);
  const p = patients.find(x => x.id === params.patientId);
  const [items, setItems] = useState(existing ? existing.items : []);
  const [discount, setDiscount] = useState(existing ? existing.discount : 0);
  const [paid, setPaid] = useState(existing ? existing.paid : 0);
  const [method, setMethod] = useState('UPI');
  const [desc, setDesc] = useState(''); const [qty, setQty] = useState('1'); const [price, setPrice] = useState('');

  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const total = Math.max(0, subtotal - discount);
  const outstanding = Math.max(0, total - paid);

  const addItem = () => {
    if (!desc || !price) return;
    const q = parseInt(qty) || 1; const up = parseInt(price) || 0;
    setItems([...items, { description: desc, quantity: q, unitPrice: up, total: q * up }]);
    setDesc(''); setQty('1'); setPrice('');
  };
  const addFromProcedures = () => {
    const procs = procedures.filter(x => x.patientId === params.patientId);
    setItems([...items, ...procs.map(pr => ({ description: `${pr.type}${pr.tooth ? ' · Tooth ' + pr.tooth : ''}`, quantity: 1, unitPrice: pr.estimatedCost, total: pr.estimatedCost }))]);
  };
  const save = async () => {
    const status = outstanding === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    // Record payment via API if anything was paid
    if (paid > 0) {
      try {
        await recordPayment({
          patientId: params.patientId,
          amount: paid,
          paymentMethod: method.toLowerCase(),
          notes: items.map(it => it.description).join(', '),
        });
      } catch(e) {
        showToast(e?.response?.data?.message || 'Could not record payment');
        return;
      }
    }
    saveBill({ id: existing ? existing.id : 'bill' + Date.now(), patientId: params.patientId, patientName: p.name, items, subtotal, discount, total, paid, outstanding, createdAt: existing ? existing.createdAt : TODAY, status });
    showToast(existing ? 'Bill updated' : 'Bill saved');
    onClose();
  };

  const inputBox = { border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'inherit' };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={`Bill · ${p ? p.name : ''}`} onClose={onClose} right={<StatusChip status={outstanding === 0 && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid'} />} />

      <SectionHeader right={<button onClick={addFromProcedures} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 500 }}>Add from procedures →</button>}>Items</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
        {items.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>No items yet</div>}
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{it.description}</div><div className="t-meta">Qty {it.quantity} · {formatCurrency(it.unitPrice)}</div></div>
            <span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{formatCurrency(it.total)}</span>
            <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Icon name="x" size={16} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: items.length ? '1px solid var(--border-light)' : 'none', alignItems: 'center' }}>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" style={{ ...inputBox, flex: 1 }} />
          <input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" style={{ ...inputBox, width: 38, textAlign: 'center' }} />
          <input value={price} onChange={e => setPrice(e.target.value)} inputMode="numeric" placeholder="₹" style={{ ...inputBox, width: 58 }} />
          <button onClick={addItem} style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="plus" size={18} stroke={2.6} /></button>
        </div>
      </div>

      <div className="card" style={{ padding: '6px 16px', marginBottom: 16 }}>
        {[['Subtotal', formatCurrency(subtotal)]].map(([k, val]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span><span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{val}</span></div>)}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
          <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Discount</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>−₹</span><input value={discount || ''} onChange={e => setDiscount(parseInt(e.target.value) || 0)} inputMode="numeric" placeholder="0" style={{ width: 56, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontSize: 15, fontWeight: 600, fontFamily: 'inherit' }} className="tnum" /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border-light)' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Total</span><span className="tnum" style={{ fontSize: 17, fontWeight: 700 }}>{formatCurrency(total)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Paid</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: '#1E8E3E' }}>₹</span><input value={paid || ''} onChange={e => setPaid(parseInt(e.target.value) || 0)} inputMode="numeric" placeholder="0" style={{ width: 64, textAlign: 'right', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', fontSize: 15, fontWeight: 600, color: '#1E8E3E', fontFamily: 'inherit' }} className="tnum" /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Outstanding</span><span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: 'var(--orange)' }}>{formatCurrency(outstanding)}</span></div>
      </div>

      <SectionHeader>Payment method</SectionHeader>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['Cash', 'UPI', 'Card'].map(m => <SelectPill key={m} label={m} active={method === m} onClick={() => setMethod(m)} />)}
      </div>

      <PrimaryButton onClick={save}>Save bill</PrimaryButton>
      <button onClick={() => showToast('Generating PDF…')} style={{ width: '100%', textAlign: 'center', color: 'var(--blue)', fontSize: 15, fontWeight: 500, padding: '14px 0 2px' }}>Print / Share</button>
    </div>
  );
}
