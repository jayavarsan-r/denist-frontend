'use client';
import { useAppStore } from '@/store/useAppStore';
import { useQueueStore } from '@/store/useQueueStore';
import { SheetHeader } from '@/components/ui';

export default function RemoveQueueSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const removeFromQueue = useQueueStore((s) => s.removeFromQueue);
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Remove from queue?" onClose={onClose} />
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: -4 }}>{params.name} will be taken out of today's waiting queue. You can check them in again later.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
        <button onClick={onClose} style={{ flex: 1, height: 52, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', fontSize: 16, fontWeight: 600 }}>Cancel</button>
        <button onClick={() => { removeFromQueue(params.id); showToast('Removed from queue'); onClose(); }} style={{ flex: 1, height: 52, borderRadius: 14, background: 'var(--red)', color: '#fff', fontSize: 16, fontWeight: 600 }}>Remove</button>
      </div>
    </div>
  );
}
