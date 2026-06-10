'use client';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { SheetHeader, Avatar } from '@/components/ui';
import Icon from '@/components/icons';

/**
 * PatientPickerSheet — resolves the "for which patient?" step before a patient-scoped
 * action (prescription, lab order, collect payment). params:
 *   { next: 'rx' | 'newLab' | 'bill', title?, sub? }
 * On selection it opens the target sheet with { patientId }.
 */
export default function PatientPickerSheet({ params, onClose }) {
  const openSheet = useAppStore((s) => s.openSheet);
  const patients = usePatientStore((s) => s.patients);
  const loadPatients = usePatientStore((s) => s.loadPatients);
  const [query, setQuery] = useState('');

  useEffect(() => { loadPatients(); }, []);
  // Debounced server search.
  useEffect(() => {
    const t = setTimeout(() => { loadPatients(query.trim() || undefined); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = query.trim().toLowerCase();
  const list = q
    ? patients.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.phone || '').includes(q))
    : patients;

  const pick = (p) => openSheet(params.next, { patientId: p.id });

  return (
    <div style={{ padding: '0 20px 24px' }}>
      <SheetHeader title={params.title || 'Choose patient'} onClose={onClose} />

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', borderRadius: 14, background: 'var(--bg)', marginBottom: 14 }}>
        <Icon name="search" size={18} color="var(--text-tertiary)" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, color: 'var(--text-primary)', fontFamily: 'inherit' }}
        />
        {query && <button onClick={() => setQuery('')} style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Icon name="x" size={16} /></button>}
      </div>

      {/* New patient shortcut */}
      <button
        onClick={() => openSheet('newPatient')}
        className="tap"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: '1px dashed var(--border)', background: 'transparent', marginBottom: 14, textAlign: 'left' }}
      >
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(48,209,88,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="personPlus" size={18} color="#1E8E3E" />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600 }}>New patient</span>
      </button>

      {/* Results */}
      <div className="scroll" style={{ maxHeight: 360, overflowY: 'auto' }}>
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14.5, padding: '24px 0' }}>
            {q ? 'No patients match.' : 'No patients yet.'}
          </div>
        ) : list.map((p, i) => (
          <button
            key={p.id}
            onClick={() => pick(p)}
            className="rowtap"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}
          >
            <Avatar name={p.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{[p.phone, p.age && `${p.age} yrs`].filter(Boolean).join(' · ')}</div>
            </div>
            <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
          </button>
        ))}
      </div>
    </div>
  );
}
