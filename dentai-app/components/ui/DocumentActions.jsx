'use client';
import { useState } from 'react';
import Icon from '@/components/icons';
import { useAppStore } from '@/store/useAppStore';
import { fetchDocBlob, viewDocument, shareDocument, docFilename } from '@/lib/documents/export';
import { DOCUMENTS } from '@/lib/documents/registry';

// Consistent top-right PDF + Share actions for every document screen.
// Props: { docType, id, patientName, patientPhone, disabled }
export default function DocumentActions({ docType, id, patientName, patientPhone, disabled }) {
  const showToast = useAppStore((s) => s.showToast);
  const [busy, setBusy] = useState(null); // 'view' | 'share' | null
  const def = DOCUMENTS[docType];

  const run = async (kind) => {
    if (busy || disabled) return;
    if (!id) { showToast('Still generating…'); return; }
    setBusy(kind);
    try {
      const blob = await fetchDocBlob(docType, id);
      const filename = docFilename(docType, patientName);
      if (kind === 'view') await viewDocument(blob, filename);
      else await shareDocument({
        blob, filename,
        title: def?.title || 'Document',
        text: `${def?.title || 'Document'}${patientName ? ' — ' + patientName : ''}`,
        fallbackPhone: patientPhone,
      });
    } catch (e) {
      if (e?.name !== 'AbortError') showToast(kind === 'view' ? "Couldn't open the PDF" : "Couldn't share");
    } finally { setBusy(null); }
  };

  const Btn = ({ kind, name }) => (
    <button
      onClick={() => run(kind)}
      disabled={!!busy || disabled}
      aria-label={kind === 'view' ? 'View PDF' : 'Share'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 10,
        background: 'rgba(60,60,67,0.06)', color: 'var(--accent)',
        opacity: busy && busy !== kind ? 0.4 : 1, border: 'none',
      }}
    >
      {busy === kind
        ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.2)', borderTopColor: 'var(--accent)', animation: 'spin .7s linear infinite' }} />
        : <Icon name={name} size={19} />}
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Btn kind="view" name="doc" />
      <Btn kind="share" name="share" />
    </div>
  );
}
