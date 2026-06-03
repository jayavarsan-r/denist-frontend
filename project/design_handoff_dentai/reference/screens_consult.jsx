/* DentAI — Doctor: Consult Mode (full-screen) + Record Diagnosis */

function ConsultModeScreen() {
  const app = useApp();
  const q = app.queue;
  const pById = id => app.patients.find(p => p.id === id);
  const current = q.find(e => e.status === 'in_consultation');
  const waiting = q.filter(e => e.status === 'waiting');
  const p = current && pById(current.patientId);

  const lastVisit = p && app.visits.filter(v => v.patientId === p.id && v.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
  const activeProc = p && app.procedures.filter(x => x.patientId === p.id && (x.status === 'in_progress' || x.status === 'planned')).sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
  const hasRx = p && app.prescriptions.some(r => r.patientId === p.id);
  const flags = p ? clinicianFlags(p) : [];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      {/* slim top bar — Exit lives top-left (where leaving always is); Live signals the mode */}
      <div style={{ flexShrink: 0, paddingTop: 54, padding: '54px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={app.exitConsult} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 16px 0 12px', borderRadius: 19, background: 'rgba(60,60,67,0.07)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
          <Icon name="chevLeft" size={20} color="var(--text-primary)" /> Exit
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', animation: 'donePulse 1.5s infinite' }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--orange)', textTransform: 'uppercase' }}>Live</span>
        </div>
      </div>

      {!current ? (
        <div className="scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px 60px' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', marginBottom: 24 }}>
            <Icon name="userCheck" size={48} stroke={1.6} />
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 12 }}>The chair is empty</div>
          </div>
          {waiting.length > 0 ? (
            <button onClick={() => app.callIn(waiting[0].id)} className="tap" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 20, padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left' }}>
              <Icon name="arrowRight" size={28} color="var(--accent-ink)" />
              <div><div style={{ fontSize: 20, fontWeight: 700 }}>Call in {pById(waiting[0].patientId)?.name.split(' ')[0]}</div><div style={{ fontSize: 14, opacity: 0.85 }}>Token {waiting[0].tokenNumber} · {waiting.length} waiting</div></div>
            </button>
          ) : <div style={{ textAlign: 'center', fontSize: 15, color: 'var(--text-tertiary)' }}>No one is waiting.</div>}
        </div>
      ) : (
        <div className="scroll" style={{ flex: 1 }}>
          {/* patient focus — flows on the surface, no box */}
          <div style={{ padding: '20px 24px 0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--orange)', marginBottom: 8 }}>Now treating · Token {current.tokenNumber}</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{p.name}</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginTop: 3 }}>{p.age} · {p.gender} · {p.bloodGroup}</div>

            {/* medical risk — the one thing that must never be missed */}
            {flags.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,59,48,0.07)', borderRadius: 12, padding: '11px 14px', marginTop: 14 }}>
                <Icon name="alert" size={17} color="var(--red)" /><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{flags.join(' · ')}</span>
              </div>
            )}

            {/* complaint — the clinical anchor */}
            <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.35, color: 'var(--text-primary)', margin: '18px 0 0', textWrap: 'pretty' }}>“{current.chiefComplaint}”</div>

            {/* quiet ongoing context */}
            {activeProc && (
              <div style={{ fontSize: 14.5, color: 'var(--text-secondary)', marginTop: 12 }}>
                Ongoing: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeProc.type}{activeProc.tooth ? ' · Tooth ' + activeProc.tooth : ''}</span> — {activeProc.currentStage}{activeProc.status === 'in_progress' ? ` · visit ${activeProc.completedVisits + 1} of ${activeProc.estimatedVisits}` : ''}
              </div>
            )}

            {/* reference links — reachable without leaving the flow */}
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => app.openPatient(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 14.5, fontWeight: 600 }}><Icon name="clock" size={15} color="var(--blue)" />History{lastVisit ? ' · ' + formatDate(lastVisit.date) : ''}</button>
              {hasRx && <button onClick={() => app.openPatient(p.id, 'Billing')} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 14.5, fontWeight: 600 }}><Icon name="pill" size={15} color="var(--blue)" />Previous Rx</button>}
              {current.xrays && current.xrays.length > 0 && <button onClick={() => app.showToast('Opening ' + current.xrays[0].type)} style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--blue)', fontSize: 14.5, fontWeight: 600 }}><Icon name="image" size={15} color="var(--blue)" />{current.xrays[0].type}</button>}
            </div>
          </div>

          {/* THE dominant action */}
          <div style={{ padding: '26px 24px 0' }}>
            <button onClick={() => app.openSheet('recordDiagnosis', { id: current.id })} className="tap" style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 22, padding: '24px', display: 'flex', alignItems: 'center', gap: 18, textAlign: 'left', boxShadow: 'var(--elevation-2)' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="mic" size={32} color="var(--accent-ink)" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>Record diagnosis</div>
                <div style={{ fontSize: 14, opacity: 0.85, marginTop: 2, lineHeight: 1.35 }}>Speak your findings — the plan, prescription and next visits file themselves.</div>
              </div>
            </button>
          </div>

          {/* queue — quiet, human language */}
          {waiting.length > 0 && (
            <div style={{ padding: '30px 24px 32px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>Next patient</div>
              {waiting.map((e, i) => {
                const wp = pById(e.patientId); if (!wp) return null;
                const longWait = minutesAgo(e.checkedInAt) > 25;
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 16.5, fontWeight: 600 }}>{wp.name}</span>
                        {i === 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>· up next</span>}
                        {e.priority === 'urgent' && <Chip label="Urgent" tone="red" />}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.chiefComplaint}</div>
                    </div>
                    {longWait && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', flexShrink: 0 }}>waiting {waitLabel(e.checkedInAt)}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Record Diagnosis sheet ---------- */
function RecordDiagnosisSheet({ params, onClose }) {
  const app = useApp();
  const entry = app.queue.find(e => e.id === params.id);
  const p = entry && app.patients.find(x => x.id === entry.patientId);
  const [phase, setPhase] = React.useState('idle'); // idle | recording | processing | review | done
  const [sec, setSec] = React.useState(0);
  const ex = DATA.SAMPLE_EXTRACTION;
  if (!entry || !p) return null;

  React.useEffect(() => {
    if (phase !== 'recording') return;
    const t = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const stop = () => { setPhase('processing'); setTimeout(() => setPhase('review'), 1300); };
  const create = () => {
    setPhase('done');
  };
  const finish = () => {
    app.completeConsult(entry.id, {
      diagnosis: ex.diagnosis, procedure: ex.procedure, tooth: ex.tooth, totalSittings: ex.totalSittings,
      sittingDone: 1, estimatedCost: ex.estimatedCost, medicines: ex.medicines, instructions: ex.instructions,
      followUp: ex.followUp, appointments: ex.appointments,
    });
    onClose();
  };

  if (phase === 'done') {
    const items = [
      { icon: 'checkCircle', text: 'Diagnosis saved to ' + p.name.split(' ')[0] + "'s history", color: 'var(--green)' },
      { icon: 'layers', text: `Treatment plan created · ${ex.procedure}, ${ex.totalSittings} sittings`, color: 'var(--text-primary)' },
      { icon: 'calendar', text: `${ex.appointments.length} future visits auto-scheduled`, color: 'var(--text-primary)' },
      { icon: 'pill', text: `Prescription ready · ${ex.medicines.length} medicines`, color: 'var(--text-primary)' },
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
        <PrimaryButton onClick={finish}>Next patient</PrimaryButton>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px 28px', minHeight: 300 }}>
      <SheetHeader title="Record diagnosis" onClose={phase === 'idle' ? onClose : undefined} right={phase === 'recording' ? <button onClick={stop} style={{ color: 'var(--blue)', fontSize: 16, fontWeight: 600 }}>Stop</button> : null} />
      <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={p.name} size={36} /><div><div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div><div className="t-meta">Token #{entry.tokenNumber}</div></div>
      </div>

      {phase === 'idle' && <>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0 22px' }}>
          <button onClick={() => { setSec(0); setPhase('recording'); }} style={{ width: 92, height: 92, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}><Icon name="mic" size={42} color="#fff" /></button>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>Tap to start recording</div>
          <div className="t-meta" style={{ textAlign: 'center', marginTop: 4, maxWidth: 240 }}>e.g. "Deep caries tooth 36, root canal, four sittings, six thousand rupees, amoxicillin and ibuprofen…"</div>
        </div>
      </>}

      {phase === 'recording' && <>
        <div style={{ padding: '20px 0 10px' }}><Waveform color="var(--red)" /></div>
        <div className="tnum" style={{ textAlign: 'center', fontSize: 22, fontWeight: 700 }}>0:{String(sec).padStart(2, '0')}</div>
        <div style={{ textAlign: 'center', marginTop: 18 }}><button onClick={stop} style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--red)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elevation-2)' }}><Icon name="stop" size={26} color="#fff" /></button></div>
      </>}

      {phase === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '54px 0' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Extracting diagnosis…</div>
          <div style={{ display: 'flex', gap: 6 }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', animation: `dots 1.2s ease-in-out ${i * 0.18}s infinite` }} />)}</div>
        </div>
      )}

      {phase === 'review' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Here's what I understood</span>
          <button onClick={() => { setSec(0); setPhase('recording'); }} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>Re-record</button>
        </div>
        <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
          {[['Diagnosis', ex.diagnosis], ['Procedure', ex.procedure + (ex.tooth ? ' · Tooth ' + ex.tooth : '')], ['Sittings', ex.totalSittings + ' visits'], ['Est. cost', formatCurrency(ex.estimatedCost)]].map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
              <span className="t-meta">{k}</span><span style={{ fontSize: 15, fontWeight: 600, textAlign: 'right', maxWidth: 200 }}>{v}</span>
            </div>
          ))}
        </div>
        <SectionHeader>Prescription · {ex.medicines.length}</SectionHeader>
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          {ex.medicines.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', background: m.uncertain ? 'rgba(255,159,10,0.04)' : 'transparent' }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{m.name} <span style={{ fontWeight: 500, color: 'var(--text-secondary)', fontSize: 13 }}>{m.dose}</span>{m.uncertain && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}</div><div className="t-meta">{m.frequency} · {m.duration}</div></div>
              <MealTiming slots={m.slots} />
            </div>
          ))}
        </div>
        <PrimaryButton onClick={create}>Create plan & prescription</PrimaryButton>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 10 }}>Amber dot = please double-check before saving</div>
      </>}
    </div>
  );
}

Object.assign(window, { ConsultModeScreen, RecordDiagnosisSheet });
