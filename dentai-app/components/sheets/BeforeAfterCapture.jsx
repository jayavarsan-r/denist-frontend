'use client';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import Icon from '@/components/icons';
import { SectionHeader } from '@/components/ui';
import { getPatientXrays, uploadPatientPhoto } from '@/lib/services/xray.service';

// Per-case before/after capture. Photos upload tagged with this visit's id so the
// Media tab can group them case-wise. Used in the case detail (VisitRecordSheet) and
// directly in the Cases tab.
export default function BeforeAfterCapture({ patientId, visitId, title = 'Before / After' }) {
  const showToast = useAppStore((s) => s.showToast);
  const refreshPatientData = useAppStore((s) => s.refreshPatientData);
  const patientDataVersion = useAppStore((s) => s.patientDataVersion);
  const [photos, setPhotos] = useState({ before: null, after: null });
  const [busy, setBusy] = useState(null);
  const beforeRef = useRef(null);
  const afterRef = useRef(null);

  useEffect(() => {
    if (!patientId || !visitId) return;
    getPatientXrays(patientId).then((data) => {
      const all = Array.isArray(data) ? data : (data?.xrays || []);
      const next = { before: null, after: null };
      all.forEach((x) => {
        const t = (x.xray_type || x.xrayType || '').toLowerCase();
        if ((x.visit_id === visitId) && (t === 'before' || t === 'after')) next[t] = { id: x.id, url: x.url };
      });
      setPhotos(next);
    }).catch(() => {});
  }, [patientId, visitId, patientDataVersion]);

  const upload = async (file, type) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setBusy(type);
    setPhotos((prev) => ({ ...prev, [type]: { preview } }));
    try {
      const res = await uploadPatientPhoto(file, patientId, type, visitId);
      setPhotos((prev) => ({ ...prev, [type]: { id: res.id || res.xray?.id, url: res.url || res.xray?.url || preview } }));
      showToast(type === 'before' ? 'Before photo saved' : 'After photo saved');
      refreshPatientData();
    } catch {
      showToast('Saved locally — will sync when online');
    } finally {
      setBusy(null);
    }
  };

  const slot = (label, type, fileRef) => {
    const photo = photos[type];
    const accent = label === 'Before' ? 'var(--amber)' : 'var(--green)';
    return (
      <div style={{ flex: 1 }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { upload(e.target.files[0], type); e.target.value = ''; }} />
        <button onClick={() => fileRef.current?.click()} className="tap" style={{ width: '100%', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', border: photo ? 'none' : `1.5px dashed ${accent}`, background: photo ? '#000' : (label === 'Before' ? 'rgba(245,158,11,0.05)' : 'rgba(34,197,94,0.05)'), display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          {photo ? (
            <img src={photo.url || photo.preview} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: accent }}>
              <Icon name="camera" size={24} color={accent} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{busy === type ? 'Saving…' : 'Add'}</span>
            </div>
          )}
        </button>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: accent, marginTop: 4, textAlign: 'center' }}>{label}</div>
      </div>
    );
  };

  return (
    <div style={{ marginBottom: title ? 16 : 0 }}>
      {title && <SectionHeader>{title}</SectionHeader>}
      <div style={{ display: 'flex', gap: 10 }}>
        {slot('Before', 'before', beforeRef)}
        {slot('After', 'after', afterRef)}
      </div>
    </div>
  );
}
