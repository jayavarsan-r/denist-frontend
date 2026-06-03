'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import Icon from '@/components/icons';
import { PrimaryButton } from '@/components/ui';

function Waveform({ bars = 22, color = 'var(--accent)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 56 }}>
      {Array.from({ length: bars }, (_, i) => {
        const peak = 10 + Math.round(Math.abs(Math.sin(i * 1.7)) * 30);
        return <div key={i} style={{ width: 3, borderRadius: 3, background: color, '--peak': peak + 'px', height: peak, animation: `wave ${0.4 + (i % 5) * 0.14}s ease-in-out ${i * 0.04}s infinite` }} />;
      })}
    </div>
  );
}

export default function VoiceSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const [state, setState] = useState('recording');
  const [sec, setSec] = useState(0);
  const [showT, setShowT] = useState(false);
  const patient = params.patientId && patients.find(p => p.id === params.patientId);

  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setSec(s => s + 1), 1000);
    const done = setTimeout(() => { setState('processing'); setTimeout(() => setState('review'), 1100); }, 3000);
    return () => { clearInterval(t); clearTimeout(done); };
  }, [state]);

  const fields = params.scope === 'visit'
    ? [['Procedure', 'RCT · Tooth 36', false], ['Done today', 'Cleaning & shaping', false], ['Next visit', 'Obturation', true], ['Prescribed', 'Ibuprofen 400mg BD', false]]
    : [['Age', '42', false], ['Conditions', 'None reported', true], ['Allergies', 'None', false], ['Chief complaint', 'Pain lower left molar', false]];

  return (
    <div style={{ padding: '0 20px 28px', minHeight: 260 }}>
      {state === 'recording' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 4px' }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Recording{patient ? ' for ' + patient.name : ''}</span>
          <button onClick={() => setState('processing') || setTimeout(() => setState('review'), 1000)} style={{ color: 'var(--blue)', fontSize: 16, fontWeight: 600 }}>Stop</button>
        </div>
        <div style={{ padding: '24px 0 8px' }}><Waveform /></div>
        <div className="tnum" style={{ textAlign: 'center', fontSize: 20, fontWeight: 600 }}>0:{String(sec).padStart(2, '0')}</div>
      </>}

      {state === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 0' }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>Understanding…</div>
          <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}</div>
        </div>
      )}

      {state === 'review' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 4px' }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>Here's what I understood</span>
          <button style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Edit all</button>
        </div>
        <button onClick={() => setShowT(!showT)} style={{ color: 'var(--blue)', fontSize: 14, padding: '4px 0 12px' }}>{showT ? 'Hide transcript' : 'Show transcript'}</button>
        {showT && <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>"{params.scope === 'visit' ? 'Did cleaning and shaping on tooth 36, next visit obturation, gave ibuprofen 400 twice daily.' : 'Forty two year old, no major conditions, complaining of pain in the lower left molar.'}"</div>}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          {fields.map(([k, val, uncertain], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: uncertain ? 'rgba(255,159,10,0.04)' : 'transparent' }}>
              <span className="t-meta">{k}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ fontSize: 15, fontWeight: 600 }}>{val}</span>{uncertain && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => { setSec(0); setState('recording'); }} style={{ flex: '0 0 auto', height: 52, padding: '0 20px', borderRadius: 14, border: '1px solid var(--border)', fontSize: 15, fontWeight: 600, background: '#fff' }}>Re-record</button>
          <PrimaryButton onClick={() => { showToast('Saved'); onClose(); }}>Confirm & save</PrimaryButton>
        </div>
      </>}
    </div>
  );
}
