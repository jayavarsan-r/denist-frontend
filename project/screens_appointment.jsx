/* DentWay — Appointment detail + end-of-visit + magic moment */

function StatusStepper({ status }) {
  const steps = ['confirmed', 'arrived', 'done'];
  const labels = { confirmed: 'Confirmed', arrived: 'Arrived', done: 'Done' };
  const curIdx = steps.indexOf(status === 'no_show' ? 'confirmed' : status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
      {steps.map((s, i) => {
        const done = i < curIdx; const current = i === curIdx;
        const filled = done || current;
        return (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: filled ? 'var(--accent)' : '#fff', border: filled ? 'none' : '2px solid rgba(60,60,67,0.22)',
                animation: (current && s === 'done') ? 'donePulse 1.5s infinite' : 'none',
              }}>
                {done ? <Icon name="check" size={14} color="var(--accent-ink)" stroke={3} /> : <span style={{ fontSize: 12, fontWeight: 700, color: filled ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 12, fontWeight: current ? 600 : 500, color: filled ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{labels[s]}</span>
            </div>
            {i < 2 && <div style={{ flex: 1, height: 2, background: i < curIdx ? 'var(--accent)' : 'rgba(60,60,67,0.18)', margin: '0 6px', marginBottom: 22 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AppointmentScreen({ visitId }) {
  const app = useApp();
  const v = app.visits.find(x => x.id === visitId);
  const p = v && app.patients.find(x => x.id === v.patientId);
  const proc = v && app.procedures.find(x => x.id === v.procedureId);
  const [notes, setNotes] = React.useState(v ? v.proceduresDone : '');
  const [next, setNext] = React.useState(v ? v.nextSteps : '');
  if (!v || !p) return null;

  const advance = () => {
    if (v.status === 'confirmed') { app.updateVisit(v.id, { status: 'arrived' }); app.showToast('Marked arrived'); }
    else if (v.status === 'arrived') { app.openSheet('endVisit', { id: v.id }); }
  };

  const Row = ({ k, val }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border-light)' }}>
      <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span>
      <span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{val}</span>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <NavBar title="Appointment" onBack={app.goBack} right={<button onClick={advance}><StatusChip status={v.status} /></button>} />
      <div className="scroll" style={{ flex: 1, padding: '16px 20px 28px' }}>
        {/* patient */}
        <button onClick={() => app.openPatient(p.id)} className="card tap" style={{ width: '100%', padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, textAlign: 'left' }}>
          <Avatar name={p.name} size={44} dot={hasComplications(p)} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 600 }}>{p.name}</div><div className="t-meta">Tap to view profile</div></div>
          <Icon name="chevRight" size={18} color="var(--text-tertiary)" />
        </button>

        {/* status stepper */}
        <div className="card" style={{ padding: '16px 12px 12px', marginBottom: 16 }}>
          <StatusStepper status={v.status} />
          {v.status !== 'done' && <button onClick={advance} className="btn-dark" style={{ height: 44, marginTop: 8, width: '100%' }}>{v.status === 'confirmed' ? 'Mark arrived' : 'Complete visit'}</button>}
        </div>

        {/* procedure context */}
        <div className="card" style={{ padding: '4px 16px 14px', marginBottom: 16 }}>
          <Row k="Procedure" val={proc ? proc.type : 'Consultation'} />
          {proc && proc.tooth && <Row k="Tooth" val={proc.tooth} />}
          <Row k="Visit" val={`${v.visitNumber} of ${v.totalVisits}`} />
          <Row k="Time" val={formatTime(v.startTime).label} />
          <Row k="Duration" val={`${v.durationMinutes} min`} />
        </div>

        {proc && (
          <div style={{ marginBottom: 16, padding: '0 4px' }}>
            <StageDots stages={proc.stages} currentIndex={currentStageIndex(proc)} />
            <div className="t-meta" style={{ marginTop: 8 }}>{proc.type} · Visit {v.visitNumber} of {v.totalVisits}</div>
          </div>
        )}

        {p.chiefComplaint && (
          <div style={{ marginBottom: 16 }}>
            <div className="t-section" style={{ marginBottom: 3 }}>Chief complaint</div>
            <div style={{ fontSize: 15, fontStyle: 'italic', color: 'var(--text-secondary)' }}>{p.chiefComplaint}</div>
          </div>
        )}

        {/* visit notes */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="t-section">Visit notes</span>
            <button onClick={() => app.openSheet('voice', { scope: 'visit', patientId: p.id })} style={{ color: 'var(--text-secondary)', display: 'flex' }}><Icon name="mic" size={18} /></button>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Tap mic or type what was done…" style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', minHeight: 60, fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
          <div className="t-section" style={{ margin: '6px 0 4px' }}>Next steps</div>
          <textarea value={next} onChange={e => setNext(e.target.value)} placeholder="What comes next…" style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', minHeight: 40, fontSize: 15, fontFamily: 'inherit', background: 'transparent' }} />
        </div>

        {/* actions */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <button onClick={() => app.showToast('Reminder sent via WhatsApp')} className="rowtap" style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', textAlign: 'left' }}>
            <Icon name="whatsapp" size={20} color="#1E8E3E" /><span style={{ fontSize: 15 }}>Send appointment reminder</span>
          </button>
          <button onClick={() => { app.updateVisit(v.id, { status: 'no_show' }); app.showToast('Marked as no-show'); }} className="rowtap" style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderTop: '1px solid var(--border-light)', textAlign: 'left' }}>
            <Icon name="x" size={20} color="var(--text-secondary)" /><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Mark as no-show</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* end-of-visit capture sheet */
function EndVisitSheet({ params, onClose }) {
  const app = useApp();
  const v = app.visits.find(x => x.id === params.id);
  const p = v && app.patients.find(x => x.id === v.patientId);
  const [phase, setPhase] = React.useState('capture'); // capture | recording | magic
  const [notes, setNotes] = React.useState('');
  const [next, setNext] = React.useState('');
  if (!v || !p) return null;

  const proc = app.procedures.find(x => x.id === v.procedureId);

  const dictate = () => {
    setPhase('recording');
    setTimeout(() => {
      setNotes('Cleaning & shaping completed on all canals. Calcium hydroxide dressing placed, temporary restoration given.');
      setNext('Obturation next visit. Patient tolerating well.');
      setPhase('capture');
    }, 2600);
  };

  const save = () => {
    app.updateVisit(v.id, { status: 'done', proceduresDone: notes, clinicalNotes: notes, nextSteps: next });
    if (proc) app.advanceProcedure(proc.id);
    setPhase('magic');
  };

  if (phase === 'magic') return <MagicMomentBody app={app} visit={v} patient={p} proc={proc} onClose={onClose} />;

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="What was done?" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0 18px' }}>
        <button onClick={dictate} style={{ width: 84, height: 84, borderRadius: '50%', background: phase === 'recording' ? 'var(--red)' : 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)', animation: phase === 'recording' ? 'donePulse 1.2s infinite' : 'none' }}>
          <Icon name="mic" size={40} color="#fff" />
        </button>
        <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 14 }}>{phase === 'recording' ? 'Listening…' : 'Tap to dictate'}</div>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe this visit…" className="card" style={{ width: '100%', minHeight: 90, padding: 14, fontSize: 15, fontFamily: 'inherit', border: 'none', resize: 'none', outline: 'none', marginBottom: 12 }} />
      <textarea value={next} onChange={e => setNext(e.target.value)} placeholder="Next steps…" className="card" style={{ width: '100%', minHeight: 56, padding: 14, fontSize: 15, fontFamily: 'inherit', border: 'none', resize: 'none', outline: 'none', marginBottom: 18 }} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={onClose} style={{ width: 70, fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500, height: 52 }}>Skip</button>
        <PrimaryButton onClick={save}>Save to history</PrimaryButton>
      </div>
    </div>
  );
}

function MagicMomentBody({ app, visit, patient, proc, onClose }) {
  const items = [];
  items.push({ icon: 'checkCircle', text: `Visit ${visit.visitNumber} of ${visit.totalVisits} marked complete`, color: 'var(--green)' });
  items.push({ icon: 'doc', text: `Note saved to ${patient.name}'s history`, color: 'var(--text-primary)' });
  items.push({ icon: 'calendar', text: 'Next appointment suggested · Thu 5 Jun', color: 'var(--blue)', tap: true });
  if (proc && proc.type === 'RCT') items.push({ icon: 'flask', text: 'Crown procedure now pending — lab order needed', color: 'var(--blue)', tap: true, action: () => { onClose(); app.openSheet('newLab', { patientId: patient.id }); } });
  items.push({ icon: 'rupee', text: 'Payment reminder set', color: 'var(--blue)', tap: true });

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Done. Here's what changed:" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        {items.map((it, i) => (
          <div key={i} className="card" onClick={it.action} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, animation: `cascadeIn .4s ease ${i * 0.08}s both`, cursor: it.tap ? 'pointer' : 'default' }}>
            <Icon name={it.icon} size={20} color={it.color} />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: it.tap ? 'var(--blue)' : 'var(--text-primary)' }}>{it.text}</span>
            {it.tap && <Icon name="chevRight" size={16} color="var(--blue)" />}
          </div>
        ))}
      </div>
      <PrimaryButton onClick={onClose}>Done</PrimaryButton>
    </div>
  );
}

/* schedule appointment peek (bottom sheet) */
function ApptPeekSheet({ params, onClose }) {
  const app = useApp();
  const v = app.visits.find(x => x.id === params.id);
  const p = v && app.patients.find(x => x.id === v.patientId);
  const proc = v && app.procedures.find(x => x.id === v.procedureId);
  if (!v || !p) return null;
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={p.name} onClose={onClose} />
      <div className="t-meta" style={{ marginTop: -6, marginBottom: 14 }}>{proc ? `${proc.type}${proc.tooth ? ' · Tooth ' + proc.tooth : ''}` : 'Consultation'} · {formatTime(v.startTime).label}</div>
      <div className="card" style={{ padding: '16px 12px', marginBottom: 16 }}><StatusStepper status={v.status} /></div>
      <button onClick={() => { onClose(); app.openAppointment(v.id); }} style={{ color: 'var(--blue)', fontSize: 15, fontWeight: 500 }}>Open full page →</button>
    </div>
  );
}

Object.assign(window, { AppointmentScreen, EndVisitSheet, MagicMomentBody, ApptPeekSheet, StatusStepper });
