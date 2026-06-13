'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { SheetHeader, SectionHeader } from '@/components/ui';
import { getLabCase, setLabCaseStatus, STATUS_META, NEXT_STATUSES } from '@/lib/services/lab-case.service';
import { formatDate } from '@/lib/data/utils';

const TRIGGER_LABEL = {
  lab_button: 'Lab tapped a button', case_code_text: 'Lab message (case code)',
  llm_parse: 'AI matched a lab message', reception_manual: 'Updated by reception',
  timeout_job: 'Automated nudge',
};

/**
 * LabCaseDetailSheet — the case file: status + manual move buttons (reception can
 * ALWAYS move a case — the tracker works even if every parser fails), the
 * immutable event timeline, lab messages, and attached photos.
 * params: { id, onChanged? }
 */
export default function LabCaseDetailSheet({ params = {}, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getLabCase(params.id).then(setDetail).catch(() => setDetail(null));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  if (!detail?.case) {
    return (
      <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
        Loading case…
      </div>
    );
  }
  const c = detail.case;
  const meta = STATUS_META[c.status] || {};
  const nextOptions = NEXT_STATUSES[c.status] || [];

  const move = async (status) => {
    if (busy) return;
    setBusy(true);
    try {
      await setLabCaseStatus(c.id, status);
      showToast(`${c.case_code} → ${STATUS_META[status]?.label || status}`);
      params.onChanged?.();
      load();
    } catch (e) {
      showToast(e?.response?.data?.error || 'Could not update status');
    }
    setBusy(false);
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={c.case_code} onClose={onClose} />

      {/* summary */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta.dot }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>{meta.label || c.status}</span>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-secondary)' }}>
            {c.expected_date ? `due ${formatDate(c.expected_date)}` : 'no due date'}
          </span>
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {c.case_type?.replace(/_/g, ' ')}{c.tooth_fdi?.length ? ` · teeth ${c.tooth_fdi.join(', ')}` : ''}
          {c.shade ? ` · shade ${c.shade}` : ''}<br />
          {c.patients?.name || ''}{c.labs?.name ? ` → ${c.labs.name}` : ' · no lab assigned'}
        </div>
        {c.instructions && <div style={{ fontSize: 13.5, marginTop: 8, padding: '8px 10px', background: 'rgba(60,60,67,0.04)', borderRadius: 10 }}>{c.instructions}</div>}
      </div>

      {/* manual move — the unbreakable manual tracker */}
      {nextOptions.length > 0 && (
        <>
          <SectionHeader>Move to</SectionHeader>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {nextOptions.map((s) => (
              <button
                key={s}
                onClick={() => move(s)}
                disabled={busy}
                style={{
                  fontSize: 13.5, fontWeight: 700, borderRadius: 10, padding: '9px 14px',
                  background: s === 'CANCELLED' || s === 'ISSUE_RAISED' ? 'rgba(255,59,48,0.08)' : 'rgba(0,122,255,0.08)',
                  color: s === 'CANCELLED' || s === 'ISSUE_RAISED' ? 'var(--red)' : 'var(--blue)',
                }}
              >
                {STATUS_META[s]?.label || s}
              </button>
            ))}
          </div>
        </>
      )}

      {/* photos */}
      {detail.files?.length > 0 && (
        <>
          <SectionHeader>Photos · {detail.files.length}</SectionHeader>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14 }}>
            {detail.files.map((f) => (
              f.url
                ? <img key={f.id} src={f.url} alt={f.kind} onClick={() => window.open(f.url, '_blank')} style={{ width: 84, height: 84, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                : <div key={f.id} style={{ width: 84, height: 84, borderRadius: 12, background: 'rgba(60,60,67,0.06)', flexShrink: 0 }} />
            ))}
          </div>
        </>
      )}

      {/* timeline */}
      <SectionHeader>Timeline</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
        {(detail.events || []).length === 0 && (
          <div style={{ padding: 14, fontSize: 13.5, color: 'var(--text-tertiary)', textAlign: 'center' }}>No events yet.</div>
        )}
        {(detail.events || []).map((e, i) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_META[e.to_status]?.dot || '#9CA3AF', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {e.to_status === 'NO_CHANGE' ? `Nudge sent (${e.notes})` : `${e.from_status ? STATUS_META[e.from_status]?.label + ' → ' : ''}${STATUS_META[e.to_status]?.label || e.to_status}`}
              </div>
              <div className="t-meta">{TRIGGER_LABEL[e.trigger] || e.trigger} · {formatDate(String(e.created_at).slice(0, 10))}</div>
            </div>
          </div>
        ))}
      </div>

      {/* lab messages on this case */}
      {(detail.messages || []).length > 0 && (
        <>
          <SectionHeader>WhatsApp messages</SectionHeader>
          <div className="card" style={{ overflow: 'hidden' }}>
            {detail.messages.map((m, i) => (
              <div key={m.id} style={{ padding: '9px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ fontSize: 13.5 }}>
                  <span style={{ fontWeight: 700 }}>{m.direction === 'inbound' ? 'Lab' : 'Clinic'}:</span>{' '}
                  {m.body || (m.media_paths?.length ? `[${m.media_paths.length} photo(s)]` : '')}
                </div>
                <div className="t-meta">{m.parse_tier ? `parsed via ${m.parse_tier} · ` : ''}{formatDate(String(m.created_at).slice(0, 10))}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
