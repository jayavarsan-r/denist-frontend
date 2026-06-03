'use client';
import { useState } from 'react';
import { SheetHeader, SectionHeader, PrimaryButton, SelectPill } from '@/components/ui';

const PATIENT_FILTERS = ['All', 'RCT', 'Extraction', 'Crown', 'Scaling', 'Implant', 'Orthodontics'];

export default function FilterSheet({ params, onClose }) {
  const [filter, setFilter] = useState(params.filter || 'All');
  const [sort, setSort] = useState(params.sort || 'Recent');
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Filter & sort" onClose={onClose} />
      <SectionHeader>Procedure type</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        {PATIENT_FILTERS.map(f => <SelectPill key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>
      <SectionHeader>Sort by</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
        {['Recent', 'Alphabetical', 'Outstanding'].map(s => <SelectPill key={s} label={s} active={sort === s} onClick={() => setSort(s)} accentDark={false} />)}
      </div>
      <PrimaryButton onClick={() => { params.onApply(filter, sort); onClose(); }}>Apply</PrimaryButton>
    </div>
  );
}
