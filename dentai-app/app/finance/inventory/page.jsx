'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { NavBar } from '@/components/ui';
import { listInventory } from '@/lib/services/inventory.service';
import { formatCurrency } from '@/lib/data/utils';

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'medicine',   label: 'Medicines' },
  { id: 'consumable', label: 'Consumables' },
  { id: 'low',        label: 'Low stock' },
];

const CATEGORY_BADGE = {
  medicine:   { label: 'Med',  bg: 'rgba(0,122,255,0.10)',  fg: '#0A66C2' },
  consumable: { label: 'Cons', bg: 'rgba(175,82,222,0.10)', fg: '#8E44AD' },
  equipment:  { label: 'Equip', bg: 'rgba(60,60,67,0.08)',  fg: 'var(--text-secondary)' },
};

export default function InventoryPage() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'medicine' || filter === 'consumable') params.category = filter;
      if (filter === 'low') params.low_stock = 'true';
      if (search.trim()) params.search = search.trim();
      setItems(await listInventory(params));
    } catch { setItems([]); }
    setLoading(false);
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  const lowCount = items.filter((i) => Number(i.stock_qty) <= Number(i.low_stock_threshold)).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar
        title="Inventory"
        onBack={() => router.back()}
        right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => openSheet('inventoryVoice', { onSaved: load })} aria-label="Voice" style={{ color: 'var(--blue)', display: 'flex', alignItems: 'center' }}>
              <Icon name="mic" size={20} color="var(--blue)" />
            </button>
            <button
              onClick={() => openSheet('addInventory', { onSaved: load })}
              style={{ color: 'var(--blue)', fontSize: 15, fontWeight: 600 }}
            >
              Add item
            </button>
          </div>
        )}
      />

      <div style={{ padding: '10px 20px 0' }}>
        {/* search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(60,60,67,0.06)', borderRadius: 12, padding: '9px 12px', marginBottom: 10 }}>
          <Icon name="search" size={16} color="var(--text-tertiary)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15 }}
          />
        </div>
        {/* filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                flex: 1, height: 34, borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: filter === f.id ? 'var(--accent)' : '#fff',
                color: filter === f.id ? 'var(--accent-ink)' : 'var(--text-secondary)',
                border: filter === f.id ? 'none' : '1px solid var(--border)',
              }}
            >
              {f.label}{f.id === 'low' && lowCount > 0 && filter !== 'low' ? ` · ${lowCount}` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, padding: '0 20px 28px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>
            No items{filter !== 'all' ? ' for this filter' : ' yet — add your medicine list to see prices at prescribe time'}.
          </div>
        )}
        <div className="card" style={{ overflow: 'hidden' }}>
          {items.map((it, i) => {
            const low = Number(it.stock_qty) <= Number(it.low_stock_threshold);
            const out = Number(it.stock_qty) <= 0;
            const badge = CATEGORY_BADGE[it.category] || CATEGORY_BADGE.equipment;
            return (
              <button
                key={it.id}
                onClick={() => openSheet('inventoryDetail', { item: it, onSaved: load })}
                style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {it.name}
                    {it.strength && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{it.strength}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: badge.bg, color: badge.fg }}>{badge.label}</span>
                  </div>
                  <div className="t-meta">
                    {it.price_per_unit != null ? `${formatCurrency(it.price_per_unit)}/${it.unit}` : 'No price set'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="tnum" style={{ fontSize: 16, fontWeight: 700, color: out ? 'var(--red)' : low ? 'var(--amber)' : 'var(--text-primary)' }}>
                    {Number(it.stock_qty)}
                  </div>
                  <div className="t-meta">{it.unit}{out ? ' · out' : low ? ' · low' : ''}</div>
                </div>
                {low && <Icon name="alert" size={16} color={out ? 'var(--red)' : 'var(--amber)'} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
