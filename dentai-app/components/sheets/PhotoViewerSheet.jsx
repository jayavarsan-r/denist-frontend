'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { SheetHeader } from '@/components/ui';
import { deleteXray } from '@/lib/services/xray.service';

export default function PhotoViewerSheet({ params, onClose }) {
  const showToast = useAppStore(s => s.showToast);
  const { photos = [], initialIndex = 0, title = 'Photos', onDelete } = params || {};
  const [idx, setIdx] = useState(Math.min(initialIndex, Math.max(0, photos.length - 1)));
  const [deleting, setDeleting] = useState(false);

  const photo = photos[idx];
  if (!photos.length || !photo) {
    return (
      <div style={{ padding: '0 20px 28px' }}>
        <SheetHeader title={title} onClose={onClose} />
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>No photos</div>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!photo.id) return;
    setDeleting(true);
    try {
      await deleteXray(photo.id);
      showToast('Photo deleted');
      onDelete?.(photo.id);
      if (photos.length === 1) { onClose(); return; }
      setIdx(i => Math.min(i, photos.length - 2));
    } catch {
      showToast('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const label = photo.xrayType || photo.type || photo.label || '';
  const date = photo.date || photo.createdAt || photo.created_at || '';

  return (
    <div style={{ padding: '0 0 28px' }}>
      <div style={{ padding: '0 20px' }}>
        <SheetHeader
          title={title}
          onClose={onClose}
          right={
            photo.id ? (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ color: 'var(--red)', fontSize: 15, fontWeight: 600 }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            ) : null
          }
        />
      </div>

      {/* full-width image */}
      <div style={{ width: '100%', background: '#000', position: 'relative', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={photo.url || photo.preview}
          alt={label || 'Photo'}
          style={{ width: '100%', maxHeight: 380, objectFit: 'contain' }}
        />
        {photos.length > 1 && (
          <>
            {idx > 0 && (
              <button
                onClick={() => setIdx(i => i - 1)}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="chevLeft" size={20} color="#fff" />
              </button>
            )}
            {idx < photos.length - 1 && (
              <button
                onClick={() => setIdx(i => i + 1)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="chevRight" size={20} color="#fff" />
              </button>
            )}
          </>
        )}
      </div>

      {/* meta */}
      <div style={{ padding: '14px 20px 0' }}>
        {label && <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 2 }}>{label}</div>}
        {date && <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{date.slice(0, 10)}</div>}
      </div>

      {/* strip */}
      {photos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '14px 20px 0', overflowX: 'auto' }}>
          {photos.map((ph, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 8, overflow: 'hidden', border: i === idx ? '2px solid var(--accent)' : '2px solid transparent', opacity: i === idx ? 1 : 0.55 }}
            >
              <img src={ph.url || ph.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
