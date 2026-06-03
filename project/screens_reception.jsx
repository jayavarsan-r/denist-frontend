/* DentAI — Receptionist: Queue dashboard + check-in */

function QueueStatChip({ icon, value, label, color }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={16} stroke={2} color={color || 'var(--text-secondary)'} />
        <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function TokenBadge({ n, tone }) {
  const c = tone === 'amber' ? { bg: 'rgba(255,159,10,0.16)', fg: '#C77700' } : tone === 'teal' ? { bg: 'rgba(50,173,230,0.16)', fg: '#1B86B8' } : { bg: 'rgba(60,60,67,0.08)', fg: 'var(--text-secondary)' };
  return (
    <div style={{ width: 38, height: 38, borderRadius: 11, background: c.bg, color: c.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
      <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em' }}>TOK</span>
      <span className="tnum" style={{ fontSize: 16, fontWeight: 700 }}>{n}</span>
    </div>
  );
}

function ReceptionScreen() {
  const app = useApp();
  const q = app.queue;
  const pById = id => app.patients.find(p => p.id === id);
  const waiting = q.filter(e => e.status === 'waiting');
  const inConsult = q.filter(e => e.status === 'in_consultation');
  const ready = q.filter(e => e.status === 'ready_for_checkout');

  const d = parseDate(DATA.TODAY);
  const dateLabel = `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ padding: '56px 20px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>Front desk · {DATA.CLINIC.name}</div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 1 }}>Today's Queue</div>
            <div className="t-meta" style={{ marginTop: 2 }}>{dateLabel}</div>
          </div>
          <button onClick={() => app.openSheet('account')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(50,173,230,0.16)', color: '#1B86B8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{DATA.STAFF.receptionist.initials}</button>
        </div>
        <div style={{ display: 'flex', padding: '4px 20px 14px', gap: 8 }}>
          <QueueStatChip icon="clock" value={waiting.length} label="waiting" />
          <QueueStatChip icon="stethoscope" value={inConsult.length} label="in consult" color={inConsult.length ? '#C77700' : undefined} />
          <QueueStatChip icon="card" value={ready.length} label="to checkout" color={ready.length ? '#1B86B8' : undefined} />
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, padding: '16px 20px 24px' }}>
        {/* primary CTA */}
        <button onClick={() => app.openSheet('checkin')} className="btn-dark tap" style={{ width: '100%', height: 56, borderRadius: 16, gap: 9, marginBottom: 22 }}>
          <Icon name="personPlus" size={22} color="var(--accent-ink)" /> Check in a patient
        </button>

        {/* ready for checkout */}
        {ready.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SectionHeader>Ready for checkout · {ready.length}</SectionHeader>
            {ready.map(e => {
              const p = pById(e.patientId); if (!p) return null;
              return (
                <button key={e.id} onClick={() => app.openCheckout(e.id)} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(50,173,230,0.07)', border: '1px solid rgba(50,173,230,0.28)', borderRadius: 16, padding: '14px 16px', textAlign: 'left', marginBottom: 10 }}>
                  <TokenBadge n={e.tokenNumber} tone="teal" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 13.5, color: '#1B86B8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.consult ? `${e.consult.procedure}${e.consult.tooth ? ' · Tooth ' + e.consult.tooth : ''} · ${formatCurrency(e.consult.estimatedCost)}` : 'Consultation done'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1B86B8', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>Checkout <Icon name="chevRight" size={16} color="#1B86B8" /></div>
                </button>
              );
            })}
          </div>
        )}

        {/* in consultation */}
        {inConsult.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SectionHeader>In consultation</SectionHeader>
            {inConsult.map(e => {
              const p = pById(e.patientId); if (!p) return null;
              return (
                <div key={e.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderLeft: '3px solid var(--amber)' }}>
                  <TokenBadge n={e.tokenNumber} tone="amber" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                    <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>With {DATA.STAFF.doctor.name} · since {formatTime(e.calledInAt).label}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#C77700' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF9F0A', animation: 'donePulse 1.4s infinite' }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Live</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* waiting */}
        <SectionHeader>Waiting · {waiting.length}</SectionHeader>
        {waiting.length === 0 ? (
          <div className="card"><EmptyState icon="queue" title="Queue is clear" hint="Check in a patient to add them" /></div>
        ) : (
          <>
            {inConsult.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(255,159,10,0.10)', borderRadius: 12, padding: '11px 14px', marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF9F0A', flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#C77700', lineHeight: 1.35 }}>Doctor is in consultation. Call in the next patient when the chair is free.</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {waiting.map((e, idx) => {
                const p = pById(e.patientId); if (!p) return null;
                const free = inConsult.length === 0;
                const isNext = idx === 0;
                return (
                  <button key={e.id} onClick={() => free ? app.callIn(e.id) : app.openSheet('queueActions', { id: e.id })} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 16, padding: '14px', textAlign: 'left', boxShadow: 'var(--elevation-1)', border: e.priority === 'urgent' ? '1px solid rgba(255,59,48,0.30)' : 'none' }}>
                    <TokenBadge n={e.tokenNumber} tone={e.priority === 'urgent' ? 'amber' : 'neutral'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 16.5, fontWeight: 600 }}>{p.name}</span>
                        {e.priority === 'urgent' && <Chip label="Urgent" tone="red" />}
                        {hasComplications(p) && <span title="Medical flag" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{e.chiefComplaint}</div>
                      <div className="tnum" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, color: minutesAgo(e.checkedInAt) > 25 ? 'var(--orange)' : 'var(--text-tertiary)' }}>Waiting {waitLabel(e.checkedInAt)}{!free && isNext ? ' · next up' : ''}</div>
                    </div>
                    {free ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--accent)', color: 'var(--accent-ink)', height: 38, padding: '0 14px 0 16px', borderRadius: 20, fontSize: 15, fontWeight: 700, flexShrink: 0 }}>Call in<Icon name="chevRight" size={16} color="var(--accent-ink)" /></span>
                    ) : (
                      <span onClick={(ev) => { ev.stopPropagation(); app.openSheet('queueActions', { id: e.id }); }} style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexShrink: 0 }}><Icon name="dots" size={20} /></span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* done today */}
        {app.checkoutsToday.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <SectionHeader>Checked out today · {app.checkoutsToday.length}</SectionHeader>
            <div className="card" style={{ overflow: 'hidden' }}>
              {app.checkoutsToday.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                  <Icon name="checkCircle" size={20} color="var(--green)" />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{c.patientName}</div><div className="t-meta">{c.procedure}</div></div>
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: '#1E8E3E' }}>{formatCurrency(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Check-in flow (multi-step sheet) ---------- */
function CheckInSheet({ onClose }) {
  const app = useApp();
  const [step, setStep] = React.useState(0); // 0 patient, 1 complaint, 2 xray, 3 confirm
  const [mode, setMode] = React.useState('existing');
  const [pid, setPid] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [name, setName] = React.useState(''); const [phone, setPhone] = React.useState('');
  const [complaint, setComplaint] = React.useState('');
  const [recording, setRecording] = React.useState(false);
  const [priority, setPriority] = React.useState('normal');
  const [xrays, setXrays] = React.useState([]);

  const patient = pid && app.patients.find(p => p.id === pid);
  const list = app.patients.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()) || p.phone.includes(query));

  const dictate = () => { setRecording(true); setTimeout(() => { setComplaint('Throbbing pain in the upper right molar since two days, worse with hot food.'); setRecording(false); }, 2400); };

  const stepValid = step === 0 ? (mode === 'existing' ? !!pid : (name && phone)) : true;
  const titles = ['Who is this for?', 'Chief complaint', 'X-rays & reports', 'Add to queue'];

  const finish = () => {
    let patientId = pid;
    if (mode === 'new') {
      patientId = 'p' + Date.now();
      app.addPatient({ id: patientId, name, phone, age: 30, gender: 'Female', bloodGroup: '—', hasDiabetes: false, hasHypertension: false, hasHeartCondition: false, isPregnant: false, isOnBloodThinners: false, allergies: [], currentMedications: [], clinicalNotes: '', chiefComplaint: complaint, status: 'new', createdAt: DATA.TODAY, teeth: {} });
    }
    app.addToQueue({ patientId, chiefComplaint: complaint || 'General consultation', priority, xrays });
    app.showToast('Added to queue');
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
          {DATA.XRAY_TYPES.map(t => {
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
        <div className="t-meta" style={{ textAlign: 'center', marginBottom: 14 }}>Next token: <span className="tnum" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{app.queue.length + 1}</span></div>
      </>}

      <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
        {step > 0 && <button onClick={() => setStep(s => s - 1)} style={{ width: 88, height: 52, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', fontSize: 15, fontWeight: 600 }}>Back</button>}
        {step < 3
          ? <PrimaryButton onClick={() => stepValid ? setStep(s => s + 1) : app.showToast('Pick a patient first')}>{step === 2 && xrays.length === 0 ? 'Skip' : 'Continue'}</PrimaryButton>
          : <PrimaryButton onClick={finish}>Add to queue</PrimaryButton>}
      </div>
    </div>
  );
}

function QueueActionsSheet({ params, onClose }) {
  const app = useApp();
  const e = app.queue.find(x => x.id === params.id);
  const p = e && app.patients.find(x => x.id === e.patientId);
  if (!e || !p) return null;
  const free = !app.queue.some(x => x.status === 'in_consultation');
  const Action = ({ icon, label, hint, color, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 16, background: 'var(--surface)', boxShadow: 'var(--elevation-1)', textAlign: 'left', opacity: disabled ? 0.45 : 1, marginBottom: 10 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: color === 'var(--red)' ? 'rgba(255,59,48,0.10)' : color === 'var(--accent)' ? 'var(--accent)' : 'rgba(60,60,67,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={22} color={color === 'var(--accent)' ? 'var(--accent-ink)' : color} stroke={2} />
      </div>
      <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 600, color: color === 'var(--red)' ? 'var(--red)' : 'var(--text-primary)' }}>{label}</div>{hint && <div className="t-meta">{hint}</div>}</div>
    </button>
  );
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={p.name} onClose={onClose} right={<TokenBadge n={e.tokenNumber} tone={e.priority === 'urgent' ? 'amber' : 'neutral'} />} />
      <div className="t-meta" style={{ marginTop: -6, marginBottom: 16 }}>{e.chiefComplaint}</div>
      <Action icon="chevRight" label="Call in now" hint={free ? 'Send to the doctor' : 'Doctor is busy — finish current consult first'} color="var(--accent)" disabled={!free} onClick={() => { app.callIn(e.id); onClose(); }} />
      <Action icon="person" label="View profile" hint="History, teeth, billing" color="var(--text-primary)" onClick={() => { onClose(); app.openPatient(p.id); }} />
      <Action icon="x" label="Remove from queue" hint="Take out of today's list" color="var(--red)" onClick={() => { onClose(); app.openSheet('removeQueue', { id: e.id, name: p.name }); }} />
    </div>
  );
}

function RemoveQueueSheet({ params, onClose }) {
  const app = useApp();
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Remove from queue?" onClose={onClose} />
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: -4 }}>{params.name} will be taken out of today's waiting queue. You can check them in again later.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
        <button onClick={onClose} style={{ flex: 1, height: 52, borderRadius: 14, border: '1px solid var(--border)', background: '#fff', fontSize: 16, fontWeight: 600 }}>Cancel</button>
        <button onClick={() => { app.removeFromQueue(params.id); app.showToast('Removed from queue'); onClose(); }} style={{ flex: 1, height: 52, borderRadius: 14, background: 'var(--red)', color: '#fff', fontSize: 16, fontWeight: 600 }}>Remove</button>
      </div>
    </div>
  );
}

Object.assign(window, { ReceptionScreen, CheckInSheet, RemoveQueueSheet, QueueActionsSheet, TokenBadge });
