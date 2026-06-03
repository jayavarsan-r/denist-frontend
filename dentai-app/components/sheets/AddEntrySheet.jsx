'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { SheetHeader, PrimaryButton, Segmented, SelectPill, Field } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';

export default function AddEntrySheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const addAccount = useClinicalStore((s) => s.addAccount);
  const [type, setType] = useState('income');
  const [amount, setAmount] = useState(''); const [desc, setDesc] = useState(''); const [cat, setCat] = useState('Treatment');
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Add entry" onClose={onClose} />
      <Segmented options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }]} value={type} onChange={setType} style={{ marginBottom: 18 }} />
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Amount ₹" value={amount} onChange={setAmount} type="tel" placeholder="0" />
        <Field label="Description" value={desc} onChange={setDesc} placeholder="What was this for?" mic onMic={() => showToast('Listening…')} />
        <div>
          <div className="t-section" style={{ marginBottom: 8 }}>Category</div>
          <div className="noscroll-x" style={{ display: 'flex', gap: 8 }}>{(type === 'income' ? ['Treatment', 'Consultation', 'Other'] : ['Lab', 'Supplies', 'Rent', 'Salary', 'Other']).map(c => <SelectPill key={c} label={c} active={cat === c} onClick={() => setCat(c)} />)}</div>
        </div>
      </div>
      <PrimaryButton onClick={() => { addAccount({ id: 'a' + Date.now(), date: TODAY, type, category: cat, description: desc || cat, amount: parseInt(amount) || 0, patientId: null, labOrderId: null }); onClose(); showToast('Entry added'); }}>Add {type === 'income' ? 'income' : 'expense'}</PrimaryButton>
    </div>
  );
}
