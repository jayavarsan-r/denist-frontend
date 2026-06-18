'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { Avatar, Chip, StatusChip, SectionHeader, EmptyState, SelectPill } from '@/components/ui';
import { formatCurrency, formatDate, getInitials } from '@/lib/data/utils';
import { hasComplications } from '@/lib/data/utils';

const PATIENT_FILTERS = ['All', 'RCT', 'Extraction', 'Crown', 'Scaling', 'Implant', 'Orthodontics'];

function PatientsScreen() {
  const router = useRouter();
  const patientsFocus = useAppStore(s => s.patientsFocus);
  const clearPatientsFocus = useAppStore(s => s.clearPatientsFocus);
  const openSheet = useAppStore(s => s.openSheet);
  const patients = usePatientStore(s => s.patients);
  const patientsLoading = usePatientStore(s => s.loading);
  const visits = useVisitStore(s => s.visits);
  const procedures = useClinicalStore(s => s.procedures);
  const bills = useClinicalStore(s => s.bills);

  const loadPatients = usePatientStore(s => s.loadPatients);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('All');
  const [sort, setSort] = React.useState('Recent');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (patientsFocus && inputRef.current) { inputRef.current.focus(); clearPatientsFocus(); }
  }, []);

  // Re-fetch when search query changes (debounced)
  React.useEffect(() => {
    const t = setTimeout(() => { loadPatients(query || undefined).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const lastVisit = (pid) => visits.filter(v => v.patientId === pid && v.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastProc = (pid) => {
    const procs = procedures.filter(p => p.patientId === pid);
    return procs.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
  };
  const outstandingFor = (pid) => bills.filter(b => b.patientId === pid).reduce((s, b) => s + b.outstanding, 0);

  let list = patients.filter(p => {
    if (query) {
      const q = query.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchPhone = p.phone.includes(query.replace(/\D/g, ''));
      const matchId = p.displayId && p.displayId.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchId) return false;
    }
    if (filter !== 'All') {
      const procs = procedures.filter(pr => pr.patientId === p.id);
      if (!procs.some(pr => pr.type === filter)) return false;
    }
    return true;
  });
  if (sort === 'Alphabetical') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'Outstanding') list = [...list].sort((a, b) => outstandingFor(b.id) - outstandingFor(a.id));
  else list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rowH = 'standard' === 'compact' ? 60 : 68;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div className="scroll" style={{ flex: 1 }}>
        {/* header */}
        <div style={{ padding: '58px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="t-page-title">Patients</span>
          <button onClick={() => openSheet('newPatient')} style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="plus" size={26} stroke={2.4} /></button>
        </div>

        {/* search */}
        <div style={{ padding: '0 20px' }}>
          <div className="card" style={{ height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
            <Icon name="search" size={18} color="var(--text-secondary)" />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone, or patient ID…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16 }} />
            <Icon name="mic" size={18} color="var(--text-secondary)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => openSheet('filter', { filter, sort, onApply: (f, s) => { setFilter(f); setSort(s); } })} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>
              {filter === 'All' ? 'Filter' : filter + ' · ' + sort}
            </button>
          </div>
        </div>

        {/* list */}
        <div style={{ padding: '8px 20px 16px' }}>
          <SectionHeader>{sort === 'Recent' ? 'Recent patients' : sort + ' order'}</SectionHeader>
          {patientsLoading && patients.length === 0 ? (
            <div className="card" style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
            </div>
          ) : list.length === 0 ? (
            <div className="card"><EmptyState icon="person" title="No patients found" hint="Try a different name or filter" /></div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {list.map((p, i) => {
                const lv = lastVisit(p.id); const lp = lastProc(p.id); const out = outstandingFor(p.id);
                return (
                  <button key={p.id} onClick={() => router.push('/patients/' + p.id)} className="rowtap" style={{ width: '100%', minHeight: rowH, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                    <Avatar name={p.name} size={44} dot={hasComplications(p)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</span>
                        {p.status === 'new'
                          ? <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'rgba(39,201,63,0.15)', color: '#15892D', borderRadius: 99, padding: '2px 7px' }}>New</span>
                          : <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', flexShrink: 0 }} />}
                      </div>
                      <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.phone}{lv ? ' · ' + formatDate(lv.date) : ''}</div>
                      {lp && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{lp.type}{lp.tooth ? ' · Tooth ' + lp.tooth : ''}</div>}
                    </div>
                    {out > 0 && <span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: 'var(--amber)', flexShrink: 0 }}>{formatCurrency(out)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PatientsPage() {
  return <PatientsScreen />;
}
