/* DentWay — core sheets */

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

function VoiceSheet({ params, onClose }) {
  const app = useApp();
  const [state, setState] = React.useState('recording');
  const [sec, setSec] = React.useState(0);
  const [showT, setShowT] = React.useState(false);
  const patient = params.patientId && app.patients.find(p => p.id === params.patientId);

  React.useEffect(() => {
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
          <PrimaryButton onClick={() => { app.showToast('Saved'); onClose(); }}>Confirm & save</PrimaryButton>
        </div>
      </>}
    </div>
  );
}

const FLAG_DEFS = [
  ['isOnBloodThinners', 'Blood thinner'], ['hasDiabetes', 'Diabetes'], ['hasHeartCondition', 'Heart condition'],
  ['isPregnant', 'Pregnancy'], ['hasHypertension', 'Hypertension'], ['penicillin', 'Penicillin allergy'], ['latex', 'Latex allergy'],
];

function NewPatientSheet({ onClose }) {
  const app = useApp();
  const [name, setName] = React.useState(''); const [phone, setPhone] = React.useState('');
  const [complaint, setComplaint] = React.useState(''); const [notes, setNotes] = React.useState('');
  const [flags, setFlags] = React.useState({});
  const [voiceDone, setVoiceDone] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [extracted, setExtracted] = React.useState(null);

  const doVoice = () => { setRecording(true); setTimeout(() => { setRecording(false); setVoiceDone(true); setExtracted([['Age', '34', false], ['Gender', 'Female', false], ['Blood group', 'O+', true], ['Conditions', 'None', false]]); }, 2600); };
  const toggle = (k) => setFlags(f => ({ ...f, [k]: !f[k] }));
  const create = () => {
    if (!name) { app.showToast('Add a name first'); return; }
    const allergies = []; if (flags.penicillin) allergies.push('Penicillin'); if (flags.latex) allergies.push('Latex');
    app.addPatient({ id: 'p' + Date.now(), name, phone, age: extracted ? 34 : 30, gender: 'Female', bloodGroup: 'O+', hasDiabetes: !!flags.hasDiabetes, hasHypertension: !!flags.hasHypertension, hasHeartCondition: !!flags.hasHeartCondition, isPregnant: !!flags.isPregnant, isOnBloodThinners: !!flags.isOnBloodThinners, allergies, currentMedications: [], clinicalNotes: notes, chiefComplaint: complaint, status: 'new', createdAt: DATA.TODAY, teeth: {} });
    app.showToast('Patient created'); onClose();
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="New patient" onClose={onClose} />
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <Field value={name} onChange={setName} placeholder="Full name" />
        <div style={{ height: 14 }} />
        <Field value={phone} onChange={setPhone} placeholder="Phone number" type="tel" />
      </div>

      <SectionHeader>Clinical info</SectionHeader>
      {!voiceDone ? (
        <button onClick={doVoice} style={{ width: '100%', border: '1.5px dashed var(--border)', borderRadius: 12, padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.5)', marginBottom: 18 }}>
          <Icon name="mic" size={recording ? 30 : 30} color={recording ? 'var(--red)' : 'var(--accent)'} style={recording ? { animation: 'donePulse 1.2s infinite', borderRadius: '50%' } : {}} />
          <span style={{ fontSize: 17, fontWeight: 600 }}>{recording ? 'Listening…' : 'Say patient details'}</span>
          <span className="t-meta" style={{ textAlign: 'center' }}>age, gender, blood group, conditions, allergies, medications</span>
        </button>
      ) : (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          {extracted.map(([k, val, unc], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: unc ? 'rgba(255,159,10,0.04)' : 'transparent' }}>
              <span className="t-meta">{k}</span><div style={{ display: 'flex', gap: 7, alignItems: 'center' }}><span style={{ fontSize: 15, fontWeight: 600 }}>{val}</span>{unc && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div>
            </div>
          ))}
        </div>
      )}

      <Field label="Chief complaint" multiline value={complaint} onChange={setComplaint} placeholder="Why is this patient here?" mic minHeight={44} onMic={() => app.showToast('Listening…')} />

      <div style={{ height: 18 }} />
      <SectionHeader>Clinical flags</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {FLAG_DEFS.map(([k, label]) => <PillToggle key={k} label={label} active={!!flags[k]} onClick={() => toggle(k)} />)}
      </div>

      <Field label="Notes" multiline value={notes} onChange={setNotes} placeholder="Add clinical notes…" mic minHeight={44} onMic={() => app.showToast('Listening…')} />

      <div style={{ height: 22 }} />
      <PrimaryButton onClick={create}>Create patient</PrimaryButton>
    </div>
  );
}

const TOOTH_STATES = ['healthy', 'filling', 'rct', 'crown', 'implant', 'extraction', 'infection', 'scheduled'];
const TOOTH_STATE_LABEL = { healthy: 'Healthy', filling: 'Filling', rct: 'Root canal', crown: 'Crown', implant: 'Implant', extraction: 'Extraction', infection: 'Infection', scheduled: 'Scheduled' };

function ToothDetailSheet({ params, onClose }) {
  const app = useApp();
  const [state, setState] = React.useState(params.state || 'healthy');
  const [notes, setNotes] = React.useState('');
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={`Tooth ${params.tooth}`} onClose={onClose} />
      <SectionHeader>State</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {TOOTH_STATES.map(s => {
          const active = state === s; const c = TOOTH_STATE_STYLE[s];
          return <button key={s} onClick={() => setState(s)} style={{ height: 36, padding: '0 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, border: active ? `1.5px solid ${c.stroke}` : '1px solid var(--border)', background: active ? c.fill : '#fff', color: active ? (s === 'rct' ? 'var(--text-primary)' : c.num) : 'var(--text-secondary)' }}>{TOOTH_STATE_LABEL[s]}</button>;
        })}
      </div>
      <Field label="Notes" multiline value={notes} onChange={setNotes} placeholder="Clinical notes for this tooth…" mic minHeight={50} onMic={() => app.showToast('Listening…')} />
      <div style={{ height: 22 }} />
      <PrimaryButton onClick={() => { app.updateToothState(params.patientId, params.tooth, state); app.showToast(`Tooth ${params.tooth} updated`); onClose(); }}>Save</PrimaryButton>
    </div>
  );
}

function ProcedureDetailSheet({ params, onClose }) {
  const app = useApp();
  const proc = app.procedures.find(x => x.id === params.id);
  if (!proc) return null;
  const procVisits = app.visits.filter(v => v.procedureId === proc.id).sort((a, b) => (a.date).localeCompare(b.date));
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={proc.type + (proc.tooth ? ' · Tooth ' + proc.tooth : '')} onClose={onClose} right={<StatusChip status={proc.status} />} />
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <StageDots stages={proc.stages} currentIndex={currentStageIndex(proc)} />
        <div className="t-meta" style={{ marginTop: 10 }}>{proc.completedVisits} of {proc.estimatedVisits} visits · {formatCurrency(proc.estimatedCost)} estimated</div>
      </div>
      <SectionHeader>Stages</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        {proc.stages.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.completed ? 'var(--accent)' : '#fff', border: s.completed ? 'none' : '1.5px solid rgba(60,60,67,0.25)' }}>{s.completed && <Icon name="check" size={12} color="var(--accent-ink)" stroke={3} />}</div>
            <span style={{ fontSize: 15, fontWeight: i === currentStageIndex(proc) ? 600 : 400, color: s.completed ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{s.name}</span>
          </div>
        ))}
      </div>
      <SectionHeader>Visits</SectionHeader>
      {procVisits.length === 0 ? <div className="card"><EmptyState icon="calendar" title="No visits logged" /></div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {procVisits.map((v, i) => (
            <button key={v.id} onClick={() => { onClose(); app.openAppointment(v.id); }} className="rowtap" style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
              <span className="t-meta" style={{ width: 56 }}>{formatDate(v.date)}</span>
              <span style={{ flex: 1, fontSize: 14 }}>Visit {v.visitNumber} of {v.totalVisits}</span>
              <StatusChip status={v.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WalkInSheet({ onClose }) {
  const app = useApp();
  const [pid, setPid] = React.useState(null);
  const [type, setType] = React.useState('Scaling');
  const [dur, setDur] = React.useState(30);
  const add = () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`;
    app.addVisit({ id: 'v' + Date.now(), patientId: pid, procedureId: null, date: DATA.TODAY, startTime: time, durationMinutes: dur, status: 'arrived', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] });
    onClose(); app.showToast('Added to schedule');
  };
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Walk-in patient" onClose={onClose} />
      <SectionHeader right={<button onClick={() => { onClose(); app.openSheet('newPatient'); }} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 500 }}>Or create new →</button>}>Patient</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
        {app.patients.map((p, i) => (
          <button key={p.id} onClick={() => setPid(p.id)} className="rowtap" style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
            <Avatar name={p.name} size={36} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{p.name}</span>
            {pid === p.id && <Icon name="check" size={20} color="var(--blue)" stroke={2.6} />}
          </button>
        ))}
      </div>
      <SectionHeader>Procedure</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{['RCT', 'Extraction', 'Scaling', 'Crown', 'Implant', 'Other'].map(t => <SelectPill key={t} label={t} active={type === t} onClick={() => setType(t)} />)}</div>
      <SectionHeader>Duration</SectionHeader>
      <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>{[30, 45, 60, 90].map(d => <SelectPill key={d} label={d + ' min'} active={dur === d} onClick={() => setDur(d)} accentDark={false} />)}</div>
      <PrimaryButton onClick={() => pid ? add() : app.showToast('Pick a patient')}>Add to schedule</PrimaryButton>
    </div>
  );
}

function NewVisitSheet({ onClose }) {
  const app = useApp();
  const [pid, setPid] = React.useState(app.patients[0].id);
  const [type, setType] = React.useState('RCT');
  const [time, setTime] = React.useState('10:00');
  const [dur, setDur] = React.useState(45);
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="New appointment" onClose={onClose} />
      <SectionHeader>Patient</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{app.patients.map(p => <SelectPill key={p.id} label={p.name.split(' ')[0]} active={pid === p.id} onClick={() => setPid(p.id)} />)}</div>
      <SectionHeader>Procedure</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>{['RCT', 'Extraction', 'Scaling', 'Crown', 'Implant'].map(t => <SelectPill key={t} label={t} active={type === t} onClick={() => setType(t)} />)}</div>
      <SectionHeader>Time & duration</SectionHeader>
      <div style={{ display: 'flex', gap: 10, marginBottom: 22, alignItems: 'center' }}>
        <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 6 }}>{[30, 45, 60].map(d => <SelectPill key={d} label={d + 'm'} active={dur === d} onClick={() => setDur(d)} accentDark={false} />)}</div>
      </div>
      <PrimaryButton onClick={() => { app.addVisit({ id: 'v' + Date.now(), patientId: pid, procedureId: null, date: DATA.TODAY, startTime: time, durationMinutes: dur, status: 'confirmed', visitNumber: 1, totalVisits: 1, clinicalNotes: '', proceduresDone: '', nextSteps: '', medications: [] }); onClose(); app.showToast('Appointment scheduled'); }}>Schedule</PrimaryButton>
    </div>
  );
}

function NewLabSheet({ params, onClose }) {
  const app = useApp();
  const [labName, setLabName] = React.useState(''); const [work, setWork] = React.useState('');
  const [shade, setShade] = React.useState('A2'); const [cost, setCost] = React.useState(''); const [charged, setCharged] = React.useState('');
  const patient = params.patientId && app.patients.find(p => p.id === params.patientId);
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="New lab order" onClose={onClose} />
      {patient && <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={patient.name} size={36} /><span style={{ fontSize: 15, fontWeight: 600 }}>{patient.name}</span></div>}
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Lab name" value={labName} onChange={setLabName} placeholder="e.g. City Dental Lab" mic onMic={() => app.showToast('Listening…')} />
        <Field label="Work description" value={work} onChange={setWork} placeholder="e.g. PFM crown, tooth 36" mic onMic={() => app.showToast('Listening…')} />
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}><Field label="Shade" value={shade} onChange={setShade} /></div>
          <div style={{ flex: 1 }}><Field label="Lab cost ₹" value={cost} onChange={setCost} type="tel" /></div>
        </div>
        <Field label="Charged to patient ₹" value={charged} onChange={setCharged} type="tel" />
      </div>
      <PrimaryButton onClick={() => { app.addLabOrder({ id: 'lab' + Date.now(), patientId: params.patientId || 'p1', patientName: patient ? patient.name : 'Patient', procedureId: null, procedureType: 'Crown', toothNumber: null, labName: labName || 'New Lab', workDescription: work, sentDate: DATA.TODAY, expectedReturnDate: DATA.TODAY, actualReturnDate: null, status: 'sent', costToClinic: parseInt(cost) || 0, chargedToPatient: parseInt(charged) || 0, notes: '', shade, impressionType: 'Digital scan' }); onClose(); app.showToast('Lab order created'); }}>Create order</PrimaryButton>
    </div>
  );
}

function LabDetailSheet({ params, onClose }) {
  const app = useApp();
  const o = app.labOrders.find(x => x.id === params.id);
  if (!o) return null;
  const margin = o.chargedToPatient - o.costToClinic;
  const Row = ({ k, v }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--border-light)' }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span><span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{v}</span></div>;
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={o.labName} onClose={onClose} right={<StatusChip status={o.status} />} />
      <div className="t-meta" style={{ marginTop: -6, marginBottom: 14 }}>{o.patientName}{o.toothNumber ? ' · Tooth ' + o.toothNumber : ''}</div>
      <div className="card" style={{ padding: '4px 16px', marginBottom: 16 }}>
        <Row k="Work" v={o.workDescription} /><Row k="Shade" v={o.shade} /><Row k="Impression" v={o.impressionType} />
        <Row k="Sent" v={formatDate(o.sentDate)} /><Row k="Expected" v={formatDate(o.expectedReturnDate)} />
        <Row k="Lab cost" v={formatCurrency(o.costToClinic)} /><Row k="Patient billed" v={formatCurrency(o.chargedToPatient)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--border-light)' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Margin</span><span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: '#1E8E3E' }}>{formatCurrency(margin)}</span></div>
      </div>
      {o.status === 'sent' && <PrimaryButton onClick={() => { app.markLabReceived(o.id); onClose(); app.showToast('Marked received'); }}>Mark received</PrimaryButton>}
    </div>
  );
}

function AddEntrySheet({ onClose }) {
  const app = useApp();
  const [type, setType] = React.useState('income');
  const [amount, setAmount] = React.useState(''); const [desc, setDesc] = React.useState(''); const [cat, setCat] = React.useState('Treatment');
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Add entry" onClose={onClose} />
      <Segmented options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }]} value={type} onChange={setType} style={{ marginBottom: 18 }} />
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Amount ₹" value={amount} onChange={setAmount} type="tel" placeholder="0" />
        <Field label="Description" value={desc} onChange={setDesc} placeholder="What was this for?" mic onMic={() => app.showToast('Listening…')} />
        <div>
          <div className="t-section" style={{ marginBottom: 8 }}>Category</div>
          <div className="noscroll-x" style={{ display: 'flex', gap: 8 }}>{(type === 'income' ? ['Treatment', 'Consultation', 'Other'] : ['Lab', 'Supplies', 'Rent', 'Salary', 'Other']).map(c => <SelectPill key={c} label={c} active={cat === c} onClick={() => setCat(c)} />)}</div>
        </div>
      </div>
      <PrimaryButton onClick={() => { app.addAccount({ id: 'a' + Date.now(), date: DATA.TODAY, type, category: cat, description: desc || cat, amount: parseInt(amount) || 0, patientId: null, labOrderId: null }); onClose(); app.showToast('Entry added'); }}>Add {type === 'income' ? 'income' : 'expense'}</PrimaryButton>
    </div>
  );
}

function AccountSettingsSheet({ onClose }) {
  const app = useApp();
  const staff = app.role === 'receptionist' ? DATA.STAFF.receptionist : DATA.STAFF.doctor;
  const rows = ['Clinic name', 'Clinic address', 'Working hours', 'Staff accounts', 'Procedures library'];
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={staff.name} onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -6, marginBottom: 16 }}>
        <Chip label={app.role === 'receptionist' ? 'Receptionist' : 'Doctor'} tone="dark" size="lg" />
        <span className="t-meta">{DATA.CLINIC.name} · {DATA.CLINIC.city}</span>
      </div>
      <button onClick={() => { onClose(); app.switchRole(); }} className="card rowtap" style={{ width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', marginBottom: 16, textAlign: 'left' }}>
        <Icon name="swap" size={20} color="var(--blue)" />
        <div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 600 }}>Switch role</div><div className="t-meta">Try the {app.role === 'receptionist' ? 'doctor' : 'receptionist'} view</div></div>
        <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
      </button>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        {rows.map((r, i) => (
          <button key={r} className="rowtap" style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', padding: '0 16px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
            <span style={{ flex: 1, fontSize: 16 }}>{r}</span><Icon name="chevRight" size={16} color="var(--text-tertiary)" />
          </button>
        ))}
      </div>
      <button onClick={() => { onClose(); app.signOut(); }} className="card rowtap" style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--red)', fontSize: 16, fontWeight: 500 }}><Icon name="logout" size={18} color="var(--red)" />Sign out</button>
    </div>
  );
}

function EditPatientSheet({ params, onClose }) {
  const app = useApp();
  const p = app.patients.find(x => x.id === params.id);
  const [form, setForm] = React.useState({ ...p });
  const [flags, setFlags] = React.useState({ hasDiabetes: p.hasDiabetes, hasHypertension: p.hasHypertension, hasHeartCondition: p.hasHeartCondition, isPregnant: p.isPregnant, isOnBloodThinners: p.isOnBloodThinners, penicillin: p.allergies.includes('Penicillin'), latex: p.allergies.includes('Latex') });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    const allergies = []; if (flags.penicillin) allergies.push('Penicillin'); if (flags.latex) allergies.push('Latex');
    app.updatePatient(p.id, { ...form, ...flags, allergies });
    app.showToast('Saved'); onClose();
  };
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Edit patient" onClose={onClose} right={<button onClick={save} className="btn-dark" style={{ height: 34, padding: '0 16px', borderRadius: 10, fontSize: 14 }}>Save</button>} />
      <SectionHeader>Identity</SectionHeader>
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name" value={form.name} onChange={v => set('name', v)} />
        <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} type="tel" />
      </div>
      <SectionHeader>Demographics</SectionHeader>
      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><div className="t-section" style={{ marginBottom: 8 }}>Gender</div><Segmented options={['Male', 'Female', 'Other']} value={form.gender} onChange={v => set('gender', v)} /></div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}><Field label="Age" value={String(form.age)} onChange={v => set('age', parseInt(v) || 0)} type="tel" /></div>
          <div style={{ flex: 1 }}><Field label="Blood group" value={form.bloodGroup} onChange={v => set('bloodGroup', v)} /></div>
        </div>
      </div>
      <Field label="Chief complaint" multiline value={form.chiefComplaint} onChange={v => set('chiefComplaint', v)} mic minHeight={44} onMic={() => app.showToast('Listening…')} />
      <div style={{ height: 18 }} />
      <SectionHeader>Clinical flags</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>{FLAG_DEFS.map(([k, label]) => <PillToggle key={k} label={label} active={!!flags[k]} onClick={() => setFlags(f => ({ ...f, [k]: !f[k] }))} />)}</div>
      <Field label="Clinical notes" multiline value={form.clinicalNotes} onChange={v => set('clinicalNotes', v)} mic minHeight={60} onMic={() => app.showToast('Listening…')} />
      <div style={{ height: 22 }} />
      <PrimaryButton onClick={save}>Save changes</PrimaryButton>
    </div>
  );
}

Object.assign(window, {
  Waveform, VoiceSheet, NewPatientSheet, ToothDetailSheet, ProcedureDetailSheet,
  WalkInSheet, NewVisitSheet, NewLabSheet, LabDetailSheet, AddEntrySheet, AccountSettingsSheet, EditPatientSheet,
});
