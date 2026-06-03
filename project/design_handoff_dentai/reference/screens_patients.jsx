/* DentWay — Patients list */

function VoiceToolbar({ onClick, label = 'Add voice entry' }) {
  return (
    <button onClick={onClick} className="rowtap" style={{
      flexShrink: 0, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: 'var(--surface)', borderTop: '1px solid var(--border-light)', color: 'var(--text-secondary)',
    }}>
      <Icon name="mic" size={20} />
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
    </button>
  );
}

const PATIENT_FILTERS = ['All', 'RCT', 'Extraction', 'Crown', 'Scaling', 'Implant', 'Orthodontics'];

function PatientsScreen() {
  const app = useApp();
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('All');
  const [sort, setSort] = React.useState('Recent');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (app.patientsFocus && inputRef.current) { inputRef.current.focus(); app.clearPatientsFocus(); }
  }, []);

  const lastVisit = (pid) => app.visits.filter(v => v.patientId === pid && v.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastProc = (pid) => {
    const procs = app.procedures.filter(p => p.patientId === pid);
    return procs.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];
  };
  const outstandingFor = (pid) => app.bills.filter(b => b.patientId === pid).reduce((s, b) => s + b.outstanding, 0);

  let list = app.patients.filter(p => {
    if (query && !(p.name.toLowerCase().includes(query.toLowerCase()) || p.phone.includes(query))) return false;
    if (filter !== 'All') {
      const procs = app.procedures.filter(pr => pr.patientId === p.id);
      if (!procs.some(pr => pr.type === filter)) return false;
    }
    return true;
  });
  if (sort === 'Alphabetical') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'Outstanding') list = [...list].sort((a, b) => outstandingFor(b.id) - outstandingFor(a.id));
  else list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rowH = app.density === 'compact' ? 60 : 68;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="scroll" style={{ flex: 1 }}>
        {/* header */}
        <div style={{ padding: '58px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="t-page-title">Patients</span>
          <button onClick={() => app.openSheet('newPatient')} style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="plus" size={26} stroke={2.4} /></button>
        </div>

        {/* search */}
        <div style={{ padding: '0 20px' }}>
          <div className="card" style={{ height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10 }}>
            <Icon name="search" size={18} color="var(--text-secondary)" />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or phone number" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16 }} />
            <Icon name="mic" size={18} color="var(--text-secondary)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => app.openSheet('filter', { filter, sort, onApply: (f, s) => { setFilter(f); setSort(s); } })} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 500 }}>
              {filter === 'All' ? 'Filter' : filter + ' · ' + sort}
            </button>
          </div>
        </div>

        {/* list */}
        <div style={{ padding: '8px 20px 16px' }}>
          <SectionHeader>{sort === 'Recent' ? 'Recent patients' : sort + ' order'}</SectionHeader>
          {list.length === 0 ? (
            <div className="card"><EmptyState icon="person" title="No patients found" hint="Try a different name or filter" /></div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {list.map((p, i) => {
                const lv = lastVisit(p.id); const lp = lastProc(p.id); const out = outstandingFor(p.id);
                return (
                  <button key={p.id} onClick={() => app.openPatient(p.id)} className="rowtap" style={{ width: '100%', minHeight: rowH, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
                    <Avatar name={p.name} size={44} dot={hasComplications(p)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                      <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.phone}{lv ? ' · ' + formatDate(lv.date) : p.status === 'new' ? ' · New' : ''}</div>
                      {lp && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{lp.type}{lp.tooth ? ' · Tooth ' + lp.tooth : ''}</div>}
                    </div>
                    {out > 0 && <span className="tnum" style={{ fontSize: 15, fontWeight: 600, color: 'var(--orange)', flexShrink: 0 }}>{formatCurrency(out)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <VoiceToolbar onClick={() => app.openSheet('voice', { scope: 'patient-pick' })} />
    </div>
  );
}

/* filter sheet */
function FilterSheet({ params, onClose }) {
  const [filter, setFilter] = React.useState(params.filter || 'All');
  const [sort, setSort] = React.useState(params.sort || 'Recent');
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title="Filter & sort" onClose={onClose} />
      <SectionHeader>Procedure type</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
        {PATIENT_FILTERS.map(f => <SelectPill key={f} label={f} active={filter === f} onClick={() => setFilter(f)} />)}
      </div>
      <SectionHeader>Sort by</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
        {['Recent', 'Alphabetical', 'Outstanding'].map(s => <SelectPill key={s} label={s} active={sort === s} onClick={() => setSort(s)} accentDark={false} />)}
      </div>
      <PrimaryButton onClick={() => { params.onApply(filter, sort); onClose(); }}>Apply</PrimaryButton>
    </div>
  );
}

Object.assign(window, { PatientsScreen, VoiceToolbar, FilterSheet });
