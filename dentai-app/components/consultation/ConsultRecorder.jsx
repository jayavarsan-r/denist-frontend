'use client';
import Icon from '@/components/icons';

/**
 * ConsultRecorder — the shared record screen for BOTH consultation entry points
 * (the queue consult page and the patient-profile "Start consultation"). One source
 * of truth for the ready → recording → processing UI so the two flows look identical.
 *
 * Presentational only: all state (which view, elapsed seconds) and actions come in as
 * props. The review/summary step is ConsultReview.
 */

function Waveform({ color = 'var(--accent)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 56 }}>
      {Array.from({ length: 22 }, (_, i) => {
        const peak = 10 + Math.round(Math.abs(Math.sin(i * 1.7)) * 30);
        return <div key={i} style={{ width: 3, borderRadius: 3, background: color, height: peak, animation: `wave ${0.4 + (i % 5) * 0.14}s ease-in-out ${i * 0.04}s infinite` }} />;
      })}
    </div>
  );
}

export default function ConsultRecorder({
  patientName,
  headerSub,
  view,            // 'ready' | 'recording' | 'processing'
  seconds = 0,
  onStart,
  onStop,
  onManual,
  processingLabel = 'Understanding…',
}) {
  const first = (patientName || 'Patient').split(' ')[0];

  return (
    <div style={{ paddingBottom: 28, minHeight: 280 }}>
      {/* patient header — identical across both flows */}
      <div className="card" style={{ margin: '0 20px 16px', padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(patientName || 'P')[0]}</div>
        <div><div style={{ fontSize: 15, fontWeight: 700 }}>{patientName}</div>{headerSub && <div className="t-meta">{headerSub}</div>}</div>
      </div>

      {view === 'ready' && (
        <div style={{ padding: '8px 24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button onClick={onStart} className="tap" style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}>
            <Icon name="mic" size={42} color="var(--accent-ink)" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 18 }}>Tap to record</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 4, lineHeight: 1.4, maxWidth: 280 }}>
            Speak your findings — the plan, prescription and next visits file themselves.
          </div>
          {onManual && (
            <button onClick={onManual} style={{ marginTop: 22, fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>or fill in manually ›</button>
          )}
        </div>
      )}

      {view === 'recording' && (
        <div style={{ padding: '8px 24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--red)' }}>Recording for {first}</div>
          <div style={{ padding: '18px 0 6px', width: '100%' }}><Waveform color="var(--red)" /></div>
          <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</div>
          {/* Big red stop button — same prominent control as the check-in page */}
          <button onClick={onStop} className="tap" aria-label="Stop recording" style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)', border: 'none' }}>
            <Icon name="stop" size={28} color="#fff" />
          </button>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12 }}>Tap to stop</div>
          {seconds >= 25 && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
              Long note — it'll transcribe in parts. No 30-second limit, no error.
            </div>
          )}
        </div>
      )}

      {view === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '54px 0' }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>{processingLabel}</div>
          <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}</div>
        </div>
      )}
    </div>
  );
}
