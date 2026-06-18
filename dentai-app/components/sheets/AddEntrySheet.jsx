'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { SheetHeader, PrimaryButton, Segmented, SelectPill, Field } from '@/components/ui';

export default function AddEntrySheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const addLedgerEntry = useClinicalStore((s) => s.addLedgerEntry);
  const [type, setType] = useState('income');
  const [amount, setAmount] = useState(''); const [desc, setDesc] = useState(''); const [cat, setCat] = useState('Treatment');
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Add entry" onClose={onClose} />
      <Segmented options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }]} value={type} onChange={setType} style={{ marginBottom: 18 }} />
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Amount ₹" value={amount} onChange={setAmount} type="tel" placeholder="0" />
        <Field label="Description" value={desc} onChange={setDesc} placeholder="What was this for?" />
        <div>
          <div className="t-section" style={{ marginBottom: 8 }}>Category</div>
          <div className="noscroll-x" style={{ display: 'flex', gap: 8 }}>{(type === 'income' ? ['Treatment', 'Consultation', 'Other'] : ['Lab', 'Supplies', 'Rent', 'Salary', 'Other']).map(c => <SelectPill key={c} label={c} active={cat === c} onClick={() => setCat(c)} />)}</div>
        </div>
      </div>
      <PrimaryButton onClick={async () => {
        if (saving) return;
        if (!amount || (parseFloat(amount) || 0) <= 0) { showToast('Enter an amount'); return; }
        setSaving(true);
        try {
          await addLedgerEntry({ type, category: cat, description: desc || cat, amount: parseFloat(amount) || 0 });
          showToast('Entry added');
          onClose();
        } catch (e) {
          showToast(e?.apiError?.message || e?.message || 'Could not save entry');
          setSaving(false);
        }
      }} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : `Add ${type === 'income' ? 'income' : 'expense'}`}</PrimaryButton>
    </div>
  );
}
