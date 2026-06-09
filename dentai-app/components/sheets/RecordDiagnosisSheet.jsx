'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Avatar, PrimaryButton } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/utils';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { useGenerateNote } from '@/lib/hooks/useGenerateNote';
import { extractPrescription } from '@/lib/services/ai.service';

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

function MealTiming({ slots }) {
  const cells = [['B', slots?.breakfast], ['L', slots?.lunch], ['D', slots?.dinner]];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cells.map(([k, on]) => (
        <div key={k} style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: on ? 'var(--accent)' : 'rgba(60,60,67,0.06)', color: on ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>{k}</div>
      ))}
    </div>
  );
}

// Mirror the backend: sessions 2..N are auto-scheduled one week apart.
function buildAppointmentPreview(totalSittings, procedure) {
  const n = Math.max(1, parseInt(totalSittings, 10) || 1);
  if (n <= 1) return [];
  const out = [];
  for (let i = 2; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + (i - 1) * 7);
    out.push({
      session: i,
      date: d.toISOString().split('T')[0],
      purpose: `${procedure || 'Treatment'} — Session ${i}`,
    });
  }
  return out;
}

export default function RecordDiagnosisSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const queue = useQueueStore((s) => s.queue);
  const completeConsult = useQueueStore((s) => s.completeConsult);
  const patients = usePatientStore((s) => s.patients);
  const entry = queue.find(e => e.id === params.id);
  const p = entry && patients.find(x => x.id === entry.patientId);

  const [phase, setPhase] = useState('idle'); // idle | recording | processing | review | done
  const [extraction, setExtraction] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [fixPhase, setFixPhase] = useState('idle'); // idle | recording | processing (correction-by-voice)

  const recorder = useAudioRecorder();
  const { transcribe, loading: transcribing } = useTranscription('diagnosis');
  const { generateFromTranscript, loading: generating } = useGenerateNote();

  if (!entry || !p) return null;

  const handleStartRecording = async () => {
    setAiError(null);
    try {
      await recorder.startRecording();
      setPhase('recording');
    } catch (e) {
      showToast(e.message || 'Could not start recording');
    }
  };

  const handleStop = async () => {
    setPhase('processing');
    try {
      const blob = await recorder.stopRecording();
      const { text: transcript, warning } = await transcribe(blob);
      if (!transcript) {
        setAiError(warning || "Couldn't transcribe — try again or type notes manually");
        setPhase('idle');
        return;
      }
      const note = await generateFromTranscript(transcript);

      // generate-note returns medications as free text, not structured — so also
      // run prescription extraction to populate the medicines preview.
      let medicines = note.medicines || [];
      try {
        const rx = await extractPrescription(transcript);
        if (Array.isArray(rx.medicines) && rx.medicines.length) {
          medicines = rx.medicines.map((m) => ({
            name: m.name || '',
            dose: m.dose || m.dosage || '',
            frequency: m.frequency || '',
            duration: m.duration || '',
            slots: m.meal_timing_slots || m.slots,
            uncertain: m.uncertain || false,
          }));
        }
      } catch { /* prescription is optional — keep going */ }

      // Preview the auto-scheduled future sittings (sessions 2..N, weekly),
      // mirroring the backend so the doctor sees them before saving.
      const appointments = buildAppointmentPreview(note.totalSittings, note.procedure);

      setExtraction({ ...note, medicines, appointments, transcript });
      setPhase('review');
    } catch (e) {
      setAiError(e.message || 'AI processing failed. Please try again.');
      setPhase('idle');
      showToast('Recording failed — check your connection');
    }
  };

  // Fix by voice: dictate a correction; Gemini merges it onto the current note,
  // changing only the fields mentioned and keeping everything else.
  const handleFixByVoice = async () => {
    if (fixPhase === 'recording') {
      setFixPhase('processing');
      setAiError(null);
      try {
        const blob = await recorder.stopRecording();
        const { text: transcript, warning } = await transcribe(blob);
        if (!transcript) { setAiError(warning || "Couldn't hear the correction — try again"); setFixPhase('idle'); return; }
        const merged = await generateFromTranscript(transcript, extraction?._raw || null);
        const appointments = buildAppointmentPreview(merged.totalSittings, merged.procedure);
        setExtraction((prev) => ({
          ...merged,
          medicines: prev?.medicines?.length ? prev.medicines : (merged.medicines || []),
          appointments,
          transcript: prev?.transcript || transcript,
        }));
        setFixPhase('idle');
        showToast('Correction applied');
      } catch (e) {
        setAiError(e.message || 'Could not apply correction');
        setFixPhase('idle');
      }
      return;
    }
    setAiError(null);
    try { await recorder.startRecording(); setFixPhase('recording'); }
    catch (e) { showToast(e.message || 'Could not start recording'); }
  };

  const handleCreate = () => {
    setPhase('done');
  };

  const handleFinish = async () => {
    try {
      await completeConsult(entry.id, {
        ...extraction,
        transcript: extraction?.transcript || '',
      });
      onClose();
    } catch (e) {
      showToast('Failed to save — try again');
    }
  };

  const ex = extraction;

  if (phase === 'done' && ex) {
    const items = [
      { icon: 'checkCircle', text: 'Diagnosis saved to ' + p.name.split(' ')[0] + "'s history", color: 'var(--green)' },
      { icon: 'layers', text: `Treatment plan created · ${ex.procedure}, ${ex.totalSittings} sittings`, color: 'var(--text-primary)' },
      { icon: 'calendar', text: `${(ex.appointments || []).length} future visits auto-scheduled`, color: 'var(--text-primary)' },
      { icon: 'pill', text: `Prescription ready · ${(ex.medicines || []).length} medicines`, color: 'var(--text-primary)' },
      { icon: 'card', text: 'Sent to front desk for checkout', color: '#1B86B8' },
    ];
    return (
      <div style={{ padding: '0 20px 28px' }}>
        <SheetHeader title="Done. Patient checked out." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {items.map((it, i) => (
            <div key={i} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, animation: `cascadeIn .4s ease ${i * 0.09}s both` }}>
              <Icon name={it.icon} size={20} color={it.color} />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{it.text}</span>
            </div>
          ))}
        </div>
        <PrimaryButton onClick={handleFinish}>Next patient</PrimaryButton>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px 28px', minHeight: 300 }}>
      <SheetHeader
        title="Record diagnosis"
        onClose={phase === 'idle' ? onClose : undefined}
        right={phase === 'recording' ? <button onClick={handleStop} style={{ color: 'var(--blue)', fontSize: 16, fontWeight: 600 }}>Stop</button> : null}
      />
      <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={p.name} size={36} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
          <div className="t-meta">Token #{entry.tokenNumber}</div>
        </div>
      </div>

      {phase === 'idle' && (
        <>
          {aiError && (
            <div style={{ background: 'rgba(255,59,48,0.08)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--red)' }}>
              {aiError}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 22px' }}>
            <button
              onClick={handleStartRecording}
              style={{ width: 92, height: 92, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}
            >
              <Icon name="mic" size={42} color="#fff" />
            </button>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>Tap to start recording</div>
            <div className="t-meta" style={{ textAlign: 'center', marginTop: 4, maxWidth: 240 }}>
              e.g. "Deep caries tooth 36, root canal, four sittings, six thousand rupees, amoxicillin and ibuprofen…"
            </div>
          </div>
        </>
      )}

      {phase === 'recording' && (
        <>
          <div style={{ padding: '20px 0 10px' }}><Waveform color="var(--red)" /></div>
          <div className="tnum" style={{ textAlign: 'center', fontSize: 22, fontWeight: 700 }}>
            0:{String(recorder.seconds).padStart(2, '0')}
          </div>
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button onClick={handleStop} style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}>
              <Icon name="stop" size={26} color="#fff" />
            </button>
          </div>
        </>
      )}

      {phase === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '54px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            {transcribing ? 'Transcribing audio…' : generating ? 'Extracting diagnosis…' : 'Processing…'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}
          </div>
        </div>
      )}

      {phase === 'review' && ex && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Here's what I understood</span>
            <button onClick={() => { setPhase('idle'); setExtraction(null); setFixPhase('idle'); }} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Re-record</button>
          </div>

          {/* Fix by voice — dictate a correction; only the mentioned fields change */}
          <button
            onClick={handleFixByVoice}
            disabled={fixPhase === 'processing'}
            style={{
              width: '100%', marginBottom: 12, borderRadius: 14, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
              background: fixPhase === 'recording' ? '#C0392B' : 'rgba(60,60,67,0.06)',
              color: fixPhase === 'recording' ? '#fff' : 'var(--text-primary)',
              border: fixPhase === 'recording' ? 'none' : '1px solid var(--border)',
              cursor: fixPhase === 'processing' ? 'default' : 'pointer',
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: fixPhase === 'recording' ? 'rgba(255,255,255,0.2)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {fixPhase === 'processing'
                ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />
                : <Icon name="mic" size={18} color={fixPhase === 'recording' ? '#fff' : 'var(--accent-ink)'} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                {fixPhase === 'recording' ? 'Tap to apply correction' : fixPhase === 'processing' ? 'Applying…' : 'Fix by voice'}
              </div>
              <div style={{ fontSize: 12.5, opacity: 0.8 }}>
                {fixPhase === 'recording' ? `${recorder.seconds}s · speak the change` : 'Say just the change — e.g. "3 sittings, ₹4500"'}
              </div>
            </div>
          </button>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
            {[
              ['Diagnosis', ex.diagnosis],
              ['Procedure', ex.procedure + (
                ex.teeth && ex.teeth.length > 1 ? ' · Teeth ' + ex.teeth.join(', ')
                : ex.tooth ? ' · Tooth ' + ex.tooth : ''
              )],
              ['Sittings', ex.totalSittings + ' visits'],
              ['Est. cost', formatCurrency(ex.estimatedCost)],
              ...(ex.followUp
                ? [['Next visit', /^\d{4}-\d{2}-\d{2}/.test(ex.followUp) ? formatDate(ex.followUp) : ex.followUp]]
                : []),
            ].map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <span className="t-meta">{k}</span>
                <span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', maxWidth: 200 }}>{v}</span>
              </div>
            ))}
          </div>
          <SectionHeader>Prescription · {(ex.medicines || []).length}</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
            {(ex.medicines || []).map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: m.uncertain ? 'rgba(255,159,10,0.04)' : 'transparent' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.name}
                    <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>{m.dose}</span>
                    {m.uncertain && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}
                  </div>
                  <div className="t-meta">{m.frequency} · {m.duration}</div>
                </div>
                <MealTiming slots={m.slots} />
              </div>
            ))}
          </div>
          {(ex.appointments || []).length > 0 && (
            <>
              <SectionHeader>Upcoming visits · {ex.appointments.length}</SectionHeader>
              <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
                {ex.appointments.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{a.purpose}</span>
                    <span className="t-meta">{/^\d{4}-\d{2}-\d{2}/.test(a.date) ? formatDate(a.date) : a.date}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <PrimaryButton onClick={handleCreate}>Create plan & prescription</PrimaryButton>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 10 }}>
            Amber dot = please double-check before saving
          </div>
        </>
      )}
    </div>
  );
}
