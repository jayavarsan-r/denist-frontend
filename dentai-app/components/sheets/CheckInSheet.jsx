'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Avatar, PrimaryButton, SelectPill, Segmented, Chip, Field } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';
import { XRAY_TYPES } from '@/lib/data/queue';
import { hasComplications } from '@/lib/data/utils';

export default function CheckInSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const addPatient = usePatientStore((s) => s.addPatient);
  const queue = useQueueStore((s) => s.queue);
  const addToQueue = useQueueStore((s) => s.addToQueue);
  const [step, setStep] = useState(0); // 0 patient, 1 complaint, 2 xray, 3 confirm
  const [mode, setMode] = useState('existing');
  const [pid, setPid] = useState(null);
  const [query, setQuery] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [complaint, setComplaint] = useState('');
  const [recording, setRecording] = useState(false);
  const [priority, setPriority] = useState('normal');
  const [xrays, setXrays] = useState([]);

  const patient = pid && patients.find(p => p.id === pid);
  const list = patients.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.phone.includes(query));

  const dictate = () => { setRecording(true); setTimeout(() => { setComplaint('Throbbing pain in the upper right molar since two days, worse with hot food.'); setRecording(false); }, 2400); };

  const stepValid = step === 0 ? (mode === 'existing' ? !!pid : (name && phone)) : true;
  const titles = ['Who is this for?', 'Chief complaint', 'X-rays & reports', 'Add to queue'];

  const finish = () => {
    let patientId = pid;
    if (mode === 'new') {
      patientId = 'p' + Date.now();
      addPatient({ id: patientId, name, phone, age: 30, gender: 'Female', bloodGroup: '—', hasDiabetes: false, hasHypertension: false, hasHeartCondition: false, isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: [], clinicalNotes: '', chiefComplaint: complaint, status: 'new', createdAt: TODAY, teeth: {} });
    }
    addToQueue({ patientId, chiefComplaint: complaint || 'General consultation', priority, xrays });
    showToast('Added to queue');
    onClose();
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={titles[step]} onClose={onClose} right={<span className="t-meta">Step {step + 1} of 4</span>} />
      {/* progress */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 18 }}>
        {[0, 1, 2, 3].map(i => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'rgba(60,60,67,0.15)' }} />)}
      </div>

      {step === 0 && <>
        <Segmented options={[{ value: 'existing', label: 'Existing patient' }, { value: 'new', label: 'New patient' }]} value={mode} onChange={setMode} style={{ marginBottom: 16, height: 38 }} />
        {mode === 'existing' ? <>
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
          </div>
        </> : (
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field value={name} onChange={setName} placeholder="Full name" />
            <Field value={phone} onChange={setPhone} placeholder="Phone number" type="tel" />
            <div className="t-meta">Full medical details can be added later by the doctor.</div>
          </div>
        )}
      </>}

      {step === 1 && <>
        {patient && <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={patient.name} size={36} /><span style={{ fontSize: 15, fontWeight: 600 }}>{patient.name}</span></div>}
        <button onClick={dictate} style={{ width: '100%', border: '1.5px dashed var(--border)', borderRadius: 14, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: recording ? 'var(--red)' : 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: recording ? 'donePulse 1.2s infinite' : 'none' }}><Icon name="mic" size={28} color="#fff" /></div>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{recording ? 'Listening…' : 'Record complaint'}</span>
          <span className="t-meta">Speak in Tamil or English — we'll clean it up</span>
        </button>
        <Field label="Complaint" multiline value={complaint} onChange={setComplaint} placeholder="Or type the chief complaint…" minHeight={56} />
        <div style={{ height: 16 }} />
        <SectionHeader>Priority</SectionHeader>
        <div style={{ display: 'flex', gap: 8 }}>
          <SelectPill label="Normal" active={priority === 'normal'} onClick={() => setPriority('normal')} />
          <SelectPill label="Urgent" active={priority === 'urgent'} onClick={() => setPriority('urgent')} />
        </div>
      </>}

      {step === 2 && <>
        <div className="t-meta" style={{ marginBottom: 14 }}>Attach any X-rays or referral reports the patient brought. Optional.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {XRAY_TYPES.map(t => {
            const on = xrays.some(x => x.type === t);
            return <SelectPill key={t} label={t} active={on} onClick={() => setXrays(on ? xrays.filter(x => x.type !== t) : [...xrays, { type: t }])} />;
          })}
        </div>
        <button onClick={() => setXrays([...xrays, { type: 'OPG' }])} className="card tap" style={{ width: '100%', padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, border: '1.5px dashed var(--border)', background: 'rgba(255,255,255,0.5)' }}>
          <Icon name="image" size={30} color="var(--text-tertiary)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Upload image</span>
          <span className="t-meta">Drag & drop or tap to browse</span>
        </button>
        {xrays.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {xrays.map((x, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(60,60,67,0.06)', borderRadius: 10, padding: '8px 10px' }}>
                <Icon name="image" size={16} color="var(--text-secondary)" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{x.type}</span>
                <button onClick={() => setXrays(xrays.filter((_, j) => j !== i))} style={{ display: 'flex', color: 'var(--text-tertiary)' }}><Icon name="x" size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </>}

      {step === 3 && patient !== undefined && <>
        <div className="card" style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Avatar name={mode === 'new' ? name : patient.name} size={48} />
            <div><div style={{ fontSize: 18, fontWeight: 700 }}>{mode === 'new' ? name : patient.name}</div><div className="t-meta">{mode === 'new' ? phone : patient.phone}</div></div>
            {priority === 'urgent' && <div style={{ marginLeft: 'auto' }}><Chip label="Urgent" tone="red" size="lg" /></div>}
          </div>
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
            <div className="t-section" style={{ marginBottom: 4 }}>Complaint</div>
            <div style={{ fontSize: 15, lineHeight: 1.4 }}>{complaint || 'General consultation'}</div>
            {xrays.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>{xrays.map((x, i) => <Chip key={i} label={x.type} tone="teal" />)}</div>}
          </div>
        </div>
        <div className="t-meta" style={{ textAlign: 'center', marginBottom: 14 }}>Next token: <span className="tnum" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{queue.length + 1}</span></div>
      </>}

      <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
        {step > 0 && <button onClick={() => setStep(s => s - 1)} style={{ width: 88, height: 52, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', fontSize: 15, fontWeight: 600 }}>Back</button>}
        {step < 3
          ? <PrimaryButton onClick={() => stepValid ? setStep(s => s + 1) : showToast('Pick a patient first')}>{step === 2 && xrays.length === 0 ? 'Skip' : 'Continue'}</PrimaryButton>
          : <PrimaryButton onClick={finish}>Add to queue</PrimaryButton>}
      </div>
    </div>
  );
}
