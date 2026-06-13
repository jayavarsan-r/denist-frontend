'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { SheetHeader, PrimaryButton } from '@/components/ui';
import { createInventoryItem } from '@/lib/services/inventory.service';

const CATEGORIES = [
  { id: 'medicine',   label: 'Medicine' },
  { id: 'consumable', label: 'Consumable' },
  { id: 'equipment',  label: 'Equipment' },
];
const UNITS = ['tablet', 'capsule', 'strip', 'bottle', 'vial', 'tube', 'pack', 'piece', 'box', 'ml', 'g'];

const FIELD = { width: '100%', fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right' };

function Row({ label, children, first }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 46, padding: '8px 14px', borderTop: first ? 'none' : '1px solid var(--border-light)' }}>
      <span className="t-meta" style={{ flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

export default function AddInventorySheet({ params = {}, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const [category, setCategory] = useState('medicine');
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('');
  const [unit, setUnit] = useState('tablet');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [threshold, setThreshold] = useState('10');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { showToast('Name is required'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await createInventoryItem({
        category,
        name: name.trim(),
        strength: strength.trim() || null,
        unit,
        price_per_unit: price === '' ? null : parseFloat(price),
        stock_qty: stock === '' ? 0 : parseFloat(stock),
        low_stock_threshold: threshold === '' ? 10 : parseFloat(threshold),
      });
      showToast(`${name.trim()} added`);
      params.onSaved?.();
      onClose();
    } catch (e) {
      const code = e?.response?.data?.error || e?.apiError?.message;
      showToast(code === 'item_already_exists' ? 'This item already exists' : 'Could not add — try again');
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Add inventory item" onClose={onClose} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            style={{
              flex: 1, height: 36, borderRadius: 10, fontSize: 13.5, fontWeight: 600,
              background: category === c.id ? 'var(--accent)' : '#fff',
              color: category === c.id ? 'var(--accent-ink)' : 'var(--text-secondary)',
              border: category === c.id ? 'none' : '1px solid var(--border)',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <Row label="Name" first>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Amoxicillin" style={FIELD} autoFocus />
        </Row>
        <Row label="Strength">
          <input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="500mg (optional)" style={FIELD} />
        </Row>
        <Row label="Unit">
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right' }}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Row>
        <Row label="Price per unit">
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>₹</span>
            <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={{ ...FIELD, width: 90 }} />
          </span>
        </Row>
        <Row label="Opening stock">
          <input value={stock} onChange={(e) => setStock(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" style={{ ...FIELD, width: 90 }} />
        </Row>
        <Row label="Low stock alert at">
          <input value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="10" style={{ ...FIELD, width: 90 }} />
        </Row>
      </div>

      <PrimaryButton onClick={save}>{saving ? 'Adding…' : 'Add item'}</PrimaryButton>
    </div>
  );
}
