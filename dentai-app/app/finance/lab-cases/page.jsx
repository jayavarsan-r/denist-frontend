'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { NavBar } from '@/components/ui';
import {
  listLabCases, getReceptionInbox, resolveInboxItem,
  STATUS_META,
} from '@/lib/services/lab-case.service';
import { formatDate } from '@/lib/data/utils';

const TABS = [
  { id: 'open',  label: 'Open' },
  { id: 'all',   label: 'All' },
  { id: 'inbox', label: 'Inbox' },
];

function StatusChip({ status }) {
  const meta = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(60,60,67,0.06)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.dot }} />
      {meta.label}
    </span>
  );
}

/**
 * Lab Case Tracker (Phase 4). WhatsApp is the transport, the DB is the truth —
 * this board reflects lab_cases (live via the 5s refresh; Realtime publication
 * exists for a push upgrade). The Inbox tab is the unbreakable floor: anything
 * the inbound parser couldn't resolve waits here for a human.
 */
export default function LabCasesPage() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const showToast = useAppStore((s) => s.showToast);
  const [tab, setTab] = useState('open');
  const [cases, setCases] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [caseRows, inboxRows] = await Promise.all([
        listLabCases(tab === 'open' ? { open: 'true' } : {}),
        getReceptionInbox(),
      ]);
      setCases(caseRows);
      setInbox(inboxRows);
    } catch { /* keep last view */ }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
    // Lab-case board has no realtime channel; a 15s poll is ample (cases move on the
    // order of minutes/hours) and cuts this screen's request load 3× vs the old 5s.
    const poll = setInterval(load, 15000);
    return () => clearInterval(poll);
  }, [load]);

  const resolveItem = async (item) => {
    try {
      await resolveInboxItem(item.id);
      showToast('Marked handled');
      load();
    } catch { showToast('Could not resolve'); }
  };

  const labAlertLabel = {
    unresolved_lab_message: 'Lab message needs attention',
    patient_message: 'Patient message',
    unknown_sender: 'Unknown sender',
    lab_due_tomorrow: 'Lab case due tomorrow',
    lab_overdue: 'Lab case OVERDUE',
    lab_issue_stale: 'Lab issue unresolved 24h+',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar
        title="Lab cases"
        onBack={() => router.back()}
        right={(
          <button
            onClick={() => openSheet('patientPicker', { next: 'newLabCase', title: 'New lab case — for whom?' })}
            style={{ color: 'var(--blue)', fontSize: 15, fontWeight: 600 }}
          >
            New case
          </button>
        )}
      />

      <div style={{ display: 'flex', gap: 6, padding: '10px 20px 12px' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, height: 34, borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: tab === t.id ? 'var(--accent)' : '#fff',
              color: tab === t.id ? 'var(--accent-ink)' : 'var(--text-secondary)',
              border: tab === t.id ? 'none' : '1px solid var(--border)',
            }}
          >
            {t.label}{t.id === 'inbox' && inbox.length ? ` · ${inbox.length}` : ''}
          </button>
        ))}
      </div>

      <div className="scroll" style={{ flex: 1, padding: '0 20px 28px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>Loading…</div>}

        {!loading && tab !== 'inbox' && (
          <div className="card" style={{ overflow: 'hidden' }}>
            {cases.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)' }}>
                No lab cases{tab === 'open' ? ' open' : ''} yet.
              </div>
            )}
            {cases.map((c, i) => (
              <button
                key={c.id}
                onClick={() => openSheet('labCaseDetail', { id: c.id, onChanged: load })}
                style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {c.case_code}
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{c.case_type?.replace(/_/g, ' ')}</span>
                  </div>
                  <div className="t-meta">
                    {c.patients?.name || '—'}{c.tooth_fdi?.length ? ` · teeth ${c.tooth_fdi.join(',')}` : ''}
                    {c.labs?.name ? ` · ${c.labs.name}` : ' · no lab yet'}
                    {c.expected_date ? ` · due ${formatDate(c.expected_date)}` : ''}
                  </div>
                </div>
                <StatusChip status={c.status} />
              </button>
            ))}
          </div>
        )}

        {!loading && tab === 'inbox' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inbox.length === 0 && (
              <div className="card" style={{ padding: 24, textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)' }}>
                Inbox clear — automation is keeping up.
              </div>
            )}
            {inbox.map((item) => (
              <div key={item.id} className="card" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="alert" size={15} color={item.type === 'lab_overdue' ? 'var(--red)' : 'var(--amber)'} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{labAlertLabel[item.type] || item.type}</span>
                  <span className="t-meta">{formatDate(String(item.created_at).slice(0, 10))}</span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>
                  {item.payload?.labName ? `${item.payload.labName}: ` : ''}
                  {item.payload?.preview || item.payload?.body || item.payload?.caseCode || ''}
                  {item.payload?.patient?.name ? `${item.payload.patient.name} (${item.payload.patient.phone})` : ''}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {item.payload?.caseId && (
                    <button
                      onClick={() => openSheet('labCaseDetail', { id: item.payload.caseId, onChanged: load })}
                      style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', background: 'rgba(0,122,255,0.08)', borderRadius: 9, padding: '7px 12px' }}
                    >
                      Open case
                    </button>
                  )}
                  <button
                    onClick={() => resolveItem(item)}
                    style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', background: 'rgba(60,60,67,0.06)', borderRadius: 9, padding: '7px 12px' }}
                  >
                    Mark handled
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
