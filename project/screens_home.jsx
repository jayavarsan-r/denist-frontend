/* DentAI — Home: the clinic operating surface.
   Calm, typography-led. Priority order: search · start consult · continue · today.
   Color carries meaning only (red medical · orange payment · blue action · green done). */

const APPT_DOT = { confirmed: 'var(--blue)', arrived: 'var(--orange)', done: 'var(--green)', no_show: 'var(--red)' };
const APPT_WORD = { confirmed: 'Confirmed', arrived: 'In chair', done: 'Done', no_show: 'No-show' };

/* faint eyebrow label that sets a section without a box */
function Eyebrow({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 10px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{children}</span>
      {action}
    </div>
  );
}

function HomeScreen() {
  const app = useApp();
  const today = DATA.TODAY;
  const pById = id => app.patients.find(p => p.id === id);
  const procById = id => app.procedures.find(p => p.id === id);
  const todays = app.visits.filter(v => v.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const ongoing = app.procedures.filter(p => p.status === 'in_progress');
  const waiting = app.queue.filter(e => e.status === 'waiting').length;
  const inChair = app.queue.some(e => e.status === 'in_consultation');
  const queueCount = waiting + (inChair ? 1 : 0);

  // urgent alerts — medical flags on today's patients + outstanding balances
  const alerts = [];
  todays.forEach(v => { const p = pById(v.patientId); if (p && hasComplications(p) && !alerts.some(a => a.pid === p.id)) alerts.push({ pid: p.id, kind: 'medical', text: clinicianFlags(p)[0], name: p.name }); });
  app.bills.filter(b => b.outstanding > 0).forEach(b => { if (!alerts.some(a => a.pid === b.patientId && a.kind === 'pay')) alerts.push({ pid: b.patientId, kind: 'pay', text: formatCurrency(b.outstanding) + ' pending', name: b.patientName }); });

  const firstName = (app.clinic.doctorName || 'Doctor').replace(/^Dr\.?\s*/i, 'Dr. ');

  return (
    <div className="scroll" style={{ flex: 1, background: 'var(--surface)' }}>
      {/* greeting */}
      <div style={{ padding: '58px 22px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 500 }}>Good morning</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.08, marginTop: 1 }}>{firstName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 3 }}>{app.clinic.clinicName}</div>
        </div>
        <button onClick={() => app.openSheet('account')} style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(60,60,67,0.07)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{DATA.STAFF.doctor.initials}</button>
      </div>

      {/* search — the hero entry point */}
      <div style={{ padding: '0 22px' }}>
        <button onClick={() => app.goToPatients(true)} className="tap" style={{ width: '100%', height: 56, borderRadius: 16, background: 'var(--bg)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
          <Icon name="search" size={20} color="var(--text-secondary)" />
          <span style={{ flex: 1, textAlign: 'left', fontSize: 16.5, color: 'var(--text-tertiary)' }}>Search a patient…</span>
          <Icon name="mic" size={19} color="var(--text-secondary)" />
        </button>
      </div>

      {/* start consultation — the single primary action */}
      <div style={{ padding: '14px 22px 0' }}>
        <button onClick={() => app.enterConsult()} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 16, padding: '16px 18px', textAlign: 'left' }}>
          <Icon name="stethoscope" size={24} color="var(--accent-ink)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Start consultation</div>
            <div style={{ fontSize: 13.5, opacity: 0.85 }}>{queueCount > 0 ? `${queueCount} in the queue${inChair ? ' · 1 in chair' : ''}` : 'Queue is clear'}</div>
          </div>
          <Icon name="arrowRight" size={20} color="var(--accent-ink)" />
        </button>
      </div>

      {/* four main actions — gently color-coded so they're instantly distinguishable */}
      <div style={{ padding: '20px 22px 0' }}>
        <Eyebrow>Quick actions</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { icon: 'personPlus', label: 'New patient', sub: 'Register someone new', bg: '#EAF2FE', fg: '#1A73E8', fn: () => app.openSheet('newPatient') },
            { icon: 'plus', label: 'Walk-in', sub: "Add to today", bg: '#E8F6EE', fg: '#1E8E3E', fn: () => app.openSheet('walkin') },
            { icon: 'rupee', label: 'Bills', sub: 'Payments & dues', bg: '#FCF1E2', fg: '#C2580A', fn: () => app.setTab('finance') },
            { icon: 'flask', label: 'Lab', sub: 'Crowns & orders', bg: '#E9F4FB', fg: '#1B86B8', fn: () => app.openLab() },
          ].map(a => (
            <button key={a.label} onClick={a.fn} className="tap" style={{ background: a.bg, borderRadius: 18, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, textAlign: 'left' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={a.icon} size={24} color={a.fg} stroke={2} />
              </div>
              <div>
                <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{a.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 1 }}>{a.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* urgent alerts — only when present, plain semantic rows */}
      {alerts.length > 0 && (
        <div style={{ padding: '26px 22px 0' }}>
          <Eyebrow>Needs attention</Eyebrow>
          <div>
            {alerts.slice(0, 3).map((a, i) => {
              const c = a.kind === 'medical' ? 'var(--red)' : 'var(--orange)';
              return (
                <button key={i} onClick={() => app.openPatient(a.pid, a.kind === 'pay' ? 'Billing' : 'Overview')} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{a.name}</span>
                  <span style={{ fontSize: 14, color: c, fontWeight: 600 }}>{a.text}</span>
                  <Icon name="chevRight" size={15} color="var(--text-tertiary)" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* continue treatment — ongoing procedures (longitudinal) */}
      {ongoing.length > 0 && (
        <div style={{ padding: '26px 22px 0' }}>
          <Eyebrow>Continue treatment</Eyebrow>
          <div>
            {ongoing.map((pr, i) => {
              const p = pById(pr.patientId); if (!p) return null;
              const pct = Math.round((pr.completedVisits / pr.estimatedVisits) * 100);
              return (
                <button key={pr.id} onClick={() => app.openPatient(p.id)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 1 }}>{pr.type}{pr.tooth ? ' · Tooth ' + pr.tooth : ''} — {pr.currentStage}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(60,60,67,0.10)', overflow: 'hidden', maxWidth: 160 }}><div style={{ width: pct + '%', height: '100%', background: 'var(--accent)' }} /></div>
                      <span className="tnum" style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontWeight: 600 }}>Visit {pr.completedVisits} of {pr.estimatedVisits}</span>
                    </div>
                  </div>
                  <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* today */}
      <div style={{ padding: '26px 22px 0' }}>
        <Eyebrow action={<button onClick={() => app.setTab('schedule')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>Schedule</button>}>Today · {todays.length}</Eyebrow>
        {todays.length === 0 ? (
          <div style={{ padding: '20px 0', color: 'var(--text-tertiary)', fontSize: 15 }}>No appointments scheduled.</div>
        ) : (
          <div>
            {todays.map((v, i) => {
              const p = pById(v.patientId); const proc = procById(v.procedureId); const t = formatTime(v.startTime);
              return (
                <button key={v.id} onClick={() => app.openAppointment(v.id)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                  <div style={{ width: 52, flexShrink: 0 }}>
                    <div className="tnum" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.05 }}>{t.h12}:{String(t.m).padStart(2, '0')}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600 }}>{t.ampm}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 600 }}>{p ? p.name : 'Patient'}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proc ? `${proc.type}${proc.tooth ? ' · Tooth ' + proc.tooth : ''}` : 'Consultation'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: APPT_DOT[v.status] || 'var(--text-tertiary)' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>{APPT_WORD[v.status] || ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* tail spacing */}
      <div style={{ height: 24 }} />
    </div>
  );
}

Object.assign(window, { HomeScreen, Eyebrow });
