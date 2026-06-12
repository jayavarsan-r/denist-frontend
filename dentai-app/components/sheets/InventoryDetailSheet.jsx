'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { SheetHeader, SectionHeader, PrimaryButton } from '@/components/ui';
import { updateInventoryItem, stockIn, adjustStock, getMovements } from '@/lib/services/inventory.service';
import { formatCurrency, formatDate } from '@/lib/data/utils';

const REASON_LABEL = {
  purchase: 'Restock', dispensed_checkout: 'Dispensed', expired: 'Expired',
  adjustment: 'Adjustment', return: 'Return',
};

export default function InventoryDetailSheet({ params = {}, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const [item, setItem] = useState(params.item || null);
  const [mode, setMode] = useState('view'); // view | restock | adjust | edit | history
  const [qty, setQty] = useState('');
  const [direction, setDirection] = useState('out');
  const [price, setPrice] = useState(String(params.item?.price_per_unit ?? ''));
  const [threshold, setThreshold] = useState(String(params.item?.low_stock_threshold ?? ''));
  const [movements, setMovements] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'history' && movements === null && item) {
      getMovements(item.id).then(setMovements).catch(() => setMovements([]));
    }
  }, [mode, movements, item]);

  if (!item) return null;
  const low = Number(item.stock_qty) <= Number(item.low_stock_threshold);
  const out = Number(item.stock_qty) <= 0;

  const done = (patch) => {
    if (patch) setItem((cur) => ({ ...cur, ...patch }));
    setMode('view'); setQty(''); setMovements(null);
    params.onSaved?.();
  };

  const doRestock = async () => {
    const n = parseFloat(qty);
    if (!n || n <= 0 || busy) return;
    setBusy(true);
    try {
      const { new_qty } = await stockIn(item.id, n);
      showToast(`Restocked — now ${new_qty} ${item.unit}`);
      done({ stock_qty: new_qty });
    } catch { showToast('Restock failed'); }
    setBusy(false);
  };

  const doAdjust = async () => {
    const n = parseFloat(qty);
    if (!n || n <= 0 || busy) return;
    setBusy(true);
    try {
      const { new_qty } = await adjustStock(item.id, { qty: n, direction, reason: 'adjustment' });
      showToast(`Adjusted — now ${new_qty} ${item.unit}`);
      done({ stock_qty: new_qty });
    } catch (e) {
      const code = e?.response?.data?.error;
      showToast(code === 'insufficient_stock' ? 'Not enough stock for that adjustment' : 'Adjustment failed');
    }
    setBusy(false);
  };

  const doEdit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await updateInventoryItem(item.id, {
        price_per_unit: price === '' ? null : parseFloat(price),
        low_stock_threshold: threshold === '' ? undefined : parseFloat(threshold),
      });
      showToast('Saved');
      done(updated);
    } catch { showToast('Could not save'); }
    setBusy(false);
  };

  const deactivate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateInventoryItem(item.id, { active: false });
      showToast(`${item.name} deactivated`);
      params.onSaved?.();
      onClose();
    } catch { showToast('Could not deactivate'); setBusy(false); }
  };

  const QtyInput = (
    <input
      value={qty} autoFocus inputMode="decimal" placeholder="0"
      onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))}
      className="tnum"
      style={{ flex: 1, fontSize: 22, fontWeight: 700, border: 'none', outline: 'none', background: 'transparent' }}
    />
  );

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={`${item.name}${item.strength ? ' ' + item.strength : ''}`} onClose={onClose} />

      {/* stock + price summary */}
      <div className="card" style={{ padding: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div className="tnum" style={{ fontSize: 26, fontWeight: 800, color: out ? 'var(--red)' : low ? 'var(--amber)' : 'var(--text-primary)' }}>
            {Number(item.stock_qty)} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{item.unit}</span>
          </div>
          <div className="t-meta">{out ? 'Out of stock' : low ? `Low — alert at ${Number(item.low_stock_threshold)}` : `Alert at ${Number(item.low_stock_threshold)}`}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="tnum" style={{ fontSize: 18, fontWeight: 700 }}>{item.price_per_unit != null ? formatCurrency(item.price_per_unit) : '—'}</div>
          <div className="t-meta">per {item.unit}</div>
        </div>
      </div>

      {mode === 'view' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PrimaryButton onClick={() => setMode('restock')}>Restock</PrimaryButton>
            {[['adjust', 'Adjust stock'], ['edit', 'Edit price / alert level'], ['history', 'Movement history']].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className="card tap" style={{ width: '100%', height: 46, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                {label}
              </button>
            ))}
            <button onClick={deactivate} style={{ width: '100%', height: 44, fontSize: 14.5, fontWeight: 600, color: 'var(--red)' }}>
              Deactivate item
            </button>
          </div>
        </>
      )}

      {mode === 'restock' && (
        <>
          <SectionHeader>Add stock ({item.unit})</SectionHeader>
          <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--green, #1E8E3E)' }}>+</span>{QtyInput}
          </div>
          <PrimaryButton onClick={doRestock}>{busy ? 'Saving…' : 'Add to stock'}</PrimaryButton>
          <button onClick={() => setMode('view')} style={{ width: '100%', marginTop: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Cancel</button>
        </>
      )}

      {mode === 'adjust' && (
        <>
          <SectionHeader>Manual adjustment ({item.unit})</SectionHeader>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {[['out', 'Remove (− out)'], ['in', 'Add (+ in)']].map(([d, label]) => (
              <button key={d} onClick={() => setDirection(d)} style={{ flex: 1, height: 36, borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: direction === d ? 'var(--accent)' : '#fff', color: direction === d ? 'var(--accent-ink)' : 'var(--text-secondary)', border: direction === d ? 'none' : '1px solid var(--border)' }}>{label}</button>
            ))}
          </div>
          <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>{QtyInput}</div>
          <PrimaryButton onClick={doAdjust}>{busy ? 'Saving…' : 'Apply adjustment'}</PrimaryButton>
          <button onClick={() => setMode('view')} style={{ width: '100%', marginTop: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Cancel</button>
        </>
      )}

      {mode === 'edit' && (
        <>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px' }}>
              <span className="t-meta">Price per {item.unit}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>₹</span>
                <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="tnum" style={{ width: 90, textAlign: 'right', fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent' }} />
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: '1px solid var(--border-light)' }}>
              <span className="t-meta">Low stock alert at</span>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="tnum" style={{ width: 90, textAlign: 'right', fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent' }} />
            </div>
          </div>
          <PrimaryButton onClick={doEdit}>{busy ? 'Saving…' : 'Save'}</PrimaryButton>
          <button onClick={() => setMode('view')} style={{ width: '100%', marginTop: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Cancel</button>
        </>
      )}

      {mode === 'history' && (
        <>
          <SectionHeader>Last {Math.min(20, movements?.length ?? 0)} movements</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
            {movements === null && <div style={{ padding: 16, fontSize: 13.5, color: 'var(--text-tertiary)', textAlign: 'center' }}>Loading…</div>}
            {movements?.length === 0 && <div style={{ padding: 16, fontSize: 13.5, color: 'var(--text-tertiary)', textAlign: 'center' }}>No movements yet.</div>}
            {(movements || []).slice(0, 20).map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: m.direction === 'in' ? '#1E8E3E' : 'var(--red)', width: 52 }}>
                  {m.direction === 'in' ? '+' : '−'}{Number(m.qty)}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{REASON_LABEL[m.reason] || m.reason}</div>
                  <div className="t-meta">{m.staff?.name ? `${m.staff.name} · ` : ''}{formatDate(String(m.created_at).slice(0, 10))}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setMode('view')} style={{ width: '100%', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Back</button>
        </>
      )}
    </div>
  );
}
