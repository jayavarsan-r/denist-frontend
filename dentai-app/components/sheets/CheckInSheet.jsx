'use client';
import { useState, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Avatar, PrimaryButton, SelectPill, Segmented, Chip, Field } from '@/components/ui';
import { XRAY_TYPES } from '@/lib/data/queue';
import { hasComplications } from '@/lib/data/utils';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { extractComplaint as apiExtractComplaint, extractPatientInfo } from '@/lib/services/ai.service';
import { uploadXray } from '@/lib/services/xray.service';

function RecordingWave() {
  const peaks = [4, 8, 14, 6, 20, 10, 24, 16, 22, 12, 24, 10, 20, 8, 16, 6, 18, 10, 14, 8, 6];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, height: 32, width: '100%' }}>
      {peaks.map((h, i) => (
        <div key={i} style={{ width: 4, borderRadius: 4, background: 'rgba(255,255,255,0.9)', height: h, animation: `wave ${0.5 + (i % 5) * 0.1}s ease-in-out ${i * 0.04}s infinite alternate` }} />
      ))}
    </div>
  );
}

export default function CheckInSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const addPatient = usePatientStore((s) => s.addPatient);
  const queue = useQueueStore((s) => s.queue);
  const addToQueue = useQueueStore((s) => s.addToQueue);

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('existing');
  const [pid, setPid] = useState(null);
  const [query, setQuery] = useState('');
  const [age, setAge] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [complaint, setComplaint] = useState('');
  const [priority, setPriority] = useState('normal');
  const [xrays, setXrays] = useState([]); // [{type, file?, preview?, uploaded?}]
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription();
  // idle | recording | transcribing | extracting | done
  const [complaintPhase, setComplaintPhase] = useState('idle');
  const [voiceError, setVoiceError] = useState('');
  // voice state for new-patient step
  const [patientPhase, setPatientPhase] = useState('idle'); // idle | recording | transcribing | extracting | done
  const [patientVoiceError, setPatientVoiceError] = useState('');

  const patient = pid && patients.find(p => p.id === pid);
  const list = patients.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.phone.includes(query));

  /* ─── Voice complaint: record → Sarvam → Gemini ─── */
  const handleDictate = async () => {
    if (complaintPhase === 'recording') {
      setComplaintPhase('transcribing');
      setVoiceError('');
      try {
        const blob = await recorder.stopRecording();
        const { text: transcript, warning } = await transcribe(blob);
        if (!transcript) {
          setVoiceError(warning || "Couldn't hear — try again or type below");
          setComplaintPhase('idle');
          return;
        }
        setComplaintPhase('extracting');
        try {
          const result = await apiExtractComplaint(transcript);
          setComplaint(result?.complaint || result?.chief_complaint || transcript);
        } catch {
          setComplaint(transcript);
        }
        setComplaintPhase('idle');
      } catch (e) {
        setVoiceError('Recording failed — try again');
        setComplaintPhase('idle');
      }
      return;
    }
    if (complaintPhase !== 'idle') return;
    setVoiceError('');
    try {
      await recorder.startRecording();
      setComplaintPhase('recording');
    } catch (e) {
      setVoiceError(e.message || 'Microphone unavailable');
    }
  };

  const recording = complaintPhase === 'recording';
  const processing = complaintPhase === 'transcribing' || complaintPhase === 'extracting';

  /* ─── Voice: fill new-patient name + phone ─── */
  const handlePatientDictate = async () => {
    if (patientPhase === 'recording') {
      setPatientPhase('transcribing');
      setPatientVoiceError('');
      try {
        const blob = await recorder.stopRecording();
        const { text: transcript, warning } = await transcribe(blob);
        if (!transcript) {
          setPatientVoiceError(warning || "Couldn't hear — try again or type below");
          setPatientPhase('idle');
          return;
        }
        setPatientPhase('extracting');
        let complaintCaptured = false;
        try {
          const result = await extractPatientInfo(transcript);
          if (result.name) setName(result.name);
          if (result.phone) setPhone(result.phone);
          if (result.age) setAge(String(result.age));
          if (result.bloodGroup || result.blood_group) setBloodGroup(result.bloodGroup || result.blood_group);
          const c = result.chiefComplaint || result.chief_complaint || result.complaint;
          if (c) { setComplaint(c); complaintCaptured = true; }
        } catch {
          // extraction failed — keep whatever was typed
        }
        setPatientPhase('done');
        setTimeout(() => setPatientPhase('idle'), 1500);
      } catch {
        setPatientVoiceError('Recording failed — try again');
        setPatientPhase('idle');
      }
      return;
    }
    if (patientPhase !== 'idle') return;
    setPatientVoiceError('');
    try {
      await recorder.startRecording();
      setPatientPhase('recording');
    } catch (e) {
      setPatientVoiceError(e.message || 'Microphone unavailable');
    }
  };

  const patientRecording = patientPhase === 'recording';
  const patientProcessing = patientPhase === 'transcribing' || patientPhase === 'extracting';
  // Either voice flow mid-transcription → block step navigation so extracted fields
  // don't land on the wrong step.
  const voiceBusy = processing || patientProcessing;

  /* ─── File picker for xrays ─── */
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const preview = URL.createObjectURL(file);
      setXrays((prev) => [...prev, { type: 'OPG', file, preview, uploaded: false }]);
    });
    e.target.value = '';
  };

  const removeXray = (idx) => {
    setXrays((prev) => {
      const item = prev[idx];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const toggleXrayType = (type) => {
    const exists = xrays.some(x => x.type === type && !x.file);
    if (exists) {
      setXrays(xrays.filter(x => !(x.type === type && !x.file)));
    } else {
      setXrays([...xrays, { type }]);
    }
  };

  /* ─── Validation ─── */
  const stepValid = step === 0 ? (mode === 'existing' ? !!pid : (name && phone)) : true;
  const titles = ['Who is this for?', 'Chief complaint', 'X-rays & reports', 'Add to queue'];

  /* ─── Finish: create patient if new, upload xrays, add to queue ─── */
  const finish = async () => {
    setLoading(true);
    try {
      let patientId = pid;

      // Create new patient
      if (mode === 'new') {
        const newPatient = await addPatient({
          name, phone,
          age: age ? parseInt(age) : null,
          blood_group: bloodGroup || null,
          bloodGroup: bloodGroup || null,
          status: 'new',
        });
        patientId = newPatient.id;
      }

      // Upload any file xrays
      const uploadedXrays = [];
      for (const x of xrays) {
        if (x.file) {
          try {
            const res = await uploadXray(x.file, patientId, x.type);
            uploadedXrays.push({ type: x.type, xrayId: res.id || res.xray_id });
          } catch {
            showToast('X-ray upload failed — continuing without it');
          }
        } else {
          uploadedXrays.push({ type: x.type });
        }
      }

      await addToQueue({
        patientId,
        chiefComplaint: complaint || 'General consultation',
        priority,
        xrays: uploadedXrays,
      });

      showToast('Added to queue');
      onClose();
    } catch (e) {
      // Surface the REAL reason — the backend envelope nests it under error.message,
      // which the old `e.response.data.message` path never read (so every failure looked
      // like a generic "try again").
      showToast(e?.apiError?.message || e?.message || 'Check-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={titles[step]} onClose={onClose} right={<span className="t-meta">Step {step + 1} of 4</span>} />
      {/* progress */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
        {[0, 1, 2, 3].map(i => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'rgba(60,60,67,0.15)' }} />)}
      </div>

      {step === 0 && (
        <>
          <Segmented options={[{ value: 'existing', label: 'Existing patient' }, { value: 'new', label: 'New patient' }]} value={mode} onChange={setMode} style={{ marginBottom: 16, height: 38 }} />
          {mode === 'existing' ? (
            <>
              <div className="card" style={{ height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, marginBottom: 12 }}>
                <Icon name="search" size={18} color="var(--text-secondary)" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or phone" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16 }} />
              </div>
              <div className="card" style={{ overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                {list.map((p, i) => (
                  <button key={p.id} onClick={() => setPid(p.id)} className="rowtap" style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                    <Avatar name={p.name} size={40} dot={hasComplications(p)} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div><div className="t-meta">{p.phone}</div></div>
                    {pid === p.id && <Icon name="check" size={20} color="var(--blue)" stroke={2.6} />}
                  </button>
                ))}
                {list.length === 0 && query.length > 1 && (
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div className="t-meta">No patients found for "{query}"</div>
                    <button
                      onClick={() => { setMode('new'); setName(query); }}
                      style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)', background: 'rgba(0,122,255,0.08)', borderRadius: 99, padding: '8px 18px' }}
                    >
                      + Register as new patient
                    </button>
                  </div>
                )}
                {list.length === 0 && query.length <= 1 && <div style={{ padding: 20, textAlign: 'center' }} className="t-meta">Search name or phone number</div>}
              </div>
            </>
          ) : (
            <>
              {/* Voice fill button */}
              <button
                onClick={handlePatientDictate}
                disabled={patientProcessing}
                style={{
                  width: '100%', borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: patientRecording ? '#C0392B' : patientPhase === 'done' ? '#16A34A' : 'var(--accent)',
                  transition: 'background .25s',
                  display: 'flex',
                  flexDirection: patientRecording ? 'column' : 'row',
                  alignItems: 'center',
                  justifyContent: patientRecording ? 'center' : 'flex-start',
                  gap: patientRecording ? 6 : 14,
                  padding: patientRecording ? '18px 20px 14px' : '14px 18px',
                  marginBottom: 14,
                }}
              >
                {patientRecording ? (
                  <>
                    <RecordingWave />
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Tap to finish</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Name · phone number · reason for visit</div>
                  </>
                ) : (
                  <>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {patientProcessing
                        ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />
                        : patientPhase === 'done'
                        ? <Icon name="check" size={22} color="#fff" stroke={2.5} />
                        : <Icon name="mic" size={22} color="#fff" />}
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                        {patientProcessing ? (patientPhase === 'transcribing' ? 'Transcribing…' : 'Filling details…') : patientPhase === 'done' ? 'All done!' : 'Speak patient details'}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
                        {patientPhase === 'done' ? 'Moving to next step…' : 'Name · phone · complaint — one go'}
                      </div>
                    </div>
                  </>
                )}
              </button>
              {patientVoiceError && <p style={{ fontSize: 12, color: 'var(--red)', margin: '-8px 0 10px 2px' }}>{patientVoiceError}</p>}
              <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field value={name} onChange={setName} placeholder="Full name" />
                <Field value={phone} onChange={setPhone} placeholder="Phone number" type="tel" />
                <Field value={complaint} onChange={setComplaint} placeholder="Chief complaint (e.g. tooth pain)" />
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}><Field value={age} onChange={setAge} placeholder="Age" type="number" /></div>
                  <div style={{ flex: 1 }}><Field value={bloodGroup} onChange={setBloodGroup} placeholder="Blood group (opt.)" /></div>
                </div>
              </div>
              {(name || complaint) && (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '6px 0 0', textAlign: 'center' }}>
                  Dictate again to update only what you mention
                </p>
              )}
            </>
          )}
        </>
      )}

      {step === 1 && (
        <>
          {patient && <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={patient.name} size={36} /><span style={{ fontSize: 15, fontWeight: 600 }}>{patient.name}</span></div>}
          <button
            onClick={handleDictate}
            style={{
              width: '100%',
              border: `1.5px dashed ${recording ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 14, padding: '20px 16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              background: recording ? 'rgba(255,59,48,0.04)' : 'rgba(255,255,255,0.5)',
              marginBottom: 16, transition: 'border-color .2s ease, background .2s ease',
            }}
          >
            {processing ? (
              <>
                <div style={{ display: 'flex', gap: 6, height: 44, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}
                </div>
                <span style={{ fontSize: 16, fontWeight: 600 }}>
                  {complaintPhase === 'transcribing' ? 'Sarvam is transcribing…' : 'Gemini is cleaning…'}
                </span>
                <span className="t-meta">
                  {complaintPhase === 'transcribing' ? 'Speech-to-text in progress' : 'Extracting clean complaint'}
                </span>
              </>
            ) : recording ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 44 }}>
                  {[5, 9, 14, 8, 18, 11, 20, 13, 16, 9, 18, 7, 12, 8, 5].map((h, i) => (
                    <div key={i} style={{ width: 3, borderRadius: 3, background: 'var(--red)', height: h, animation: `wave ${0.5 + (i % 4) * 0.12}s ease-in-out ${i * 0.05}s infinite alternate` }} />
                  ))}
                </div>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--red)' }}>
                  {recorder.seconds}s · Tap to stop
                </span>
                <span className="t-meta">Speak in Tamil or English</span>
              </>
            ) : (
              <>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="mic" size={28} color="#fff" />
                </div>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Record complaint</span>
                <span className="t-meta">Speak in Tamil or English — we'll clean it up</span>
              </>
            )}
          </button>
          {voiceError && <p style={{ fontSize: 12, color: 'var(--red)', margin: '-8px 0 10px 2px' }}>{voiceError}</p>}
          <Field label="Complaint" multiline value={complaint} onChange={setComplaint} placeholder="Or type the chief complaint…" minHeight={56} />
          <div style={{ height: 16 }} />
          <SectionHeader>Priority</SectionHeader>
          <div style={{ display: 'flex', gap: 8 }}>
            <SelectPill label="Normal" active={priority === 'normal'} onClick={() => setPriority('normal')} />
            <SelectPill label="Urgent" active={priority === 'urgent'} onClick={() => setPriority('urgent')} />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="t-meta" style={{ marginBottom: 14 }}>Attach any X-rays or referral reports the patient brought. Optional.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {XRAY_TYPES.map(t => {
              const on = xrays.some(x => x.type === t && !x.file);
              return <SelectPill key={t} label={t} active={on} onClick={() => toggleXrayType(t)} />;
            })}
          </div>

          {/* file upload */}
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
          <button onClick={() => fileInputRef.current?.click()} className="card tap" style={{ width: '100%', padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, border: '1.5px dashed var(--border)', background: 'rgba(255,255,255,0.5)' }}>
            <Icon name="image" size={30} color="var(--text-tertiary)" />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Upload image</span>
            <span className="t-meta">Tap to browse or capture from camera</span>
          </button>

          {xrays.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {xrays.map((x, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(60,60,67,0.06)', borderRadius: 10, padding: '8px 10px' }}>
                  {x.preview
                    ? <img src={x.preview} alt={x.type} style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
                    : <Icon name="image" size={16} color="var(--text-secondary)" />}
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{x.type}</span>
                  <button onClick={() => removeXray(i)} style={{ display: 'flex', color: 'var(--text-tertiary)' }}><Icon name="x" size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <div className="card" style={{ padding: 18, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Avatar name={mode === 'new' ? name : patient?.name || '?'} size={48} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{mode === 'new' ? name : patient?.name}</div>
                <div className="t-meta">{mode === 'new' ? phone : patient?.phone}</div>
              </div>
              {priority === 'urgent' && <div style={{ marginLeft: 'auto' }}><Chip label="Urgent" tone="red" size="lg" /></div>}
            </div>
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
              <div className="t-section" style={{ marginBottom: 4 }}>Complaint</div>
              <div style={{ fontSize: 15, lineHeight: 1.4 }}>{complaint || 'General consultation'}</div>
              {xrays.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>{xrays.map((x, i) => <Chip key={i} label={x.type} tone="teal" />)}</div>}
            </div>
          </div>
          <div className="t-meta" style={{ textAlign: 'center', marginBottom: 14 }}>
            Next token: <span className="tnum" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{queue.length + 1}</span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
        {step > 0 && <button disabled={voiceBusy} onClick={() => { if (voiceBusy) return; if (step === 2 && complaint.trim()) { setStep(0); return; } setStep(s => s - 1); }} style={{ width: 88, height: 52, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', fontSize: 15, fontWeight: 600, opacity: voiceBusy ? 0.5 : 1 }}>Back</button>}
        {step < 3
          ? <PrimaryButton onClick={() => {
              // Block navigation while voice is still transcribing/extracting — advancing
              // mid-transcription lands the extracted fields on the wrong step.
              if (voiceBusy) { showToast('Hold on — still transcribing'); return; }
              if (!stepValid) { showToast('Pick a patient first'); return; }
              // Skip step 1 (complaint) if already filled from step 0
              if (step === 0 && complaint.trim()) { setStep(2); return; }
              setStep(s => s + 1);
            }} style={{ opacity: voiceBusy ? 0.5 : 1 }}>{voiceBusy ? 'Transcribing…' : (step === 2 && xrays.length === 0 ? 'Skip' : 'Continue')}</PrimaryButton>
          : <PrimaryButton onClick={finish} style={{ opacity: loading ? 0.6 : 1 }}>{loading ? 'Adding…' : 'Add to queue'}</PrimaryButton>
        }
      </div>
    </div>
  );
}
