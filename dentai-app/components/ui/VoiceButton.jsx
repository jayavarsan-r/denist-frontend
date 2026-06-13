'use client';
import Icon from '@/components/icons';

/**
 * VoiceButton — the single, consistent voice control used by every sheet.
 *
 * One state machine, one set of labels, one look. Callers collapse their internal
 * transcribe/extract steps into a single `processing` phase, so the user always sees
 * the same thing: "Listening…" while recording, "Processing…" while the AI works.
 * (We deliberately do NOT surface provider names like Sarvam/Gemini.)
 *
 * Props:
 *   phase        'idle' | 'recording' | 'processing' | 'done'
 *   seconds      recording timer (number)
 *   onTap        tap handler (start when idle, stop when recording)
 *   idleTitle/idleHint        text for the idle state
 *   recordingHint             small hint shown under the timer while recording
 *   doneTitle/doneHint        text for the done state
 *   disabled     optional — defaults to true while processing
 */
function RecordingWave() {
  const peaks = [4, 8, 14, 6, 20, 10, 24, 16, 22, 12, 24, 10, 20, 8, 16, 6, 18, 10, 14, 8, 6];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, width: '100%' }}>
      {peaks.map((h, i) => (
        <div key={i} style={{
          width: 4, borderRadius: 4, background: 'rgba(255,255,255,0.9)', height: h,
          animation: `wave ${0.5 + (i % 5) * 0.1}s ease-in-out ${i * 0.04}s infinite alternate`,
        }} />
      ))}
    </div>
  );
}

export default function VoiceButton({
  phase = 'idle',
  seconds = 0,
  onTap,
  idleTitle = 'Speak details',
  idleHint = 'Fill the form hands-free',
  recordingHint = '',
  doneTitle = 'All done',
  doneHint = 'Review below',
  disabled,
}) {
  const recording = phase === 'recording';
  const processing = phase === 'processing';
  const done = phase === 'done';
  const isDisabled = disabled != null ? disabled : processing;

  return (
    <button
      onClick={onTap}
      disabled={isDisabled}
      style={{
        width: '100%', borderRadius: 99, border: 'none',
        cursor: isDisabled ? 'default' : 'pointer',
        background: recording ? '#C0392B' : done ? '#16A34A' : 'var(--accent)',
        transition: 'background .25s ease',
        display: 'flex',
        flexDirection: recording ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: recording ? 'center' : 'flex-start',
        gap: recording ? 6 : 14,
        padding: recording ? '18px 20px 14px' : '14px 18px',
      }}
    >
      {recording ? (
        <>
          <RecordingWave />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{seconds}s · Tap to finish</div>
          {recordingHint && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{recordingHint}</div>}
        </>
      ) : (
        <>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {processing
              ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />
              : done
              ? <Icon name="check" size={22} color="#fff" stroke={2.5} />
              : <Icon name="mic" size={22} color="#fff" />}
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
              {processing ? 'Processing…' : done ? doneTitle : idleTitle}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
              {processing ? 'One moment' : done ? doneHint : idleHint}
            </div>
          </div>
        </>
      )}
    </button>
  );
}
