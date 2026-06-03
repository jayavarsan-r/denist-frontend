/* DentWay — app context, router, tweaks, mount */

const AppContext = React.createContext(null);
function useApp() { return React.useContext(AppContext); }
window.useApp = useApp;

const ACCENTS = {
  '#1C1C1E': '#FFFFFF', '#007AFF': '#FFFFFF', '#1B86B8': '#FFFFFF', '#1E8E3E': '#FFFFFF', '#7A3DB8': '#FFFFFF',
};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#1C1C1E",
  "density": "standard",
  "font": "Plus Jakarta Sans"
}/*EDITMODE-END*/;

const SHEETS = {
  account: AccountSettingsSheet, walkin: WalkInSheet, newPatient: NewPatientSheet, filter: FilterSheet,
  voice: VoiceSheet, procedure: ProcedureDetailSheet, tooth: ToothDetailSheet, bill: BillSheet, rx: PrescriptionSheet,
  newLab: NewLabSheet, labDetail: LabDetailSheet, addEntry: AddEntrySheet, newVisit: NewVisitSheet,
  editPatient: EditPatientSheet, apptPeek: ApptPeekSheet, endVisit: EndVisitSheet,
  checkin: CheckInSheet, removeQueue: RemoveQueueSheet, recordDiagnosis: RecordDiagnosisSheet, queueActions: QueueActionsSheet,
};

const DOCTOR_NAV = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'patients', icon: 'person', label: 'Patients' },
  { id: 'consult', icon: 'stethoscope', label: 'Consult' },
  { id: 'schedule', icon: 'calendar', label: 'Schedule' },
  { id: 'finance', icon: 'chart', label: 'Finance' },
];
const RECEPTION_NAV = [
  { id: 'queue', icon: 'queue', label: 'Queue' },
  { id: 'patients', icon: 'person', label: 'Patients' },
  { id: 'schedule', icon: 'calendar', label: 'Schedule' },
  { id: 'finance', icon: 'chart', label: 'Finance' },
];

function App({ density }) {
  // data state
  const [patients, setPatients] = React.useState(DATA.patients);
  const [visits, setVisits] = React.useState(DATA.visits);
  const [procedures, setProcedures] = React.useState(DATA.procedures);
  const [labOrders, setLabOrders] = React.useState(DATA.labOrders);
  const [bills, setBills] = React.useState(DATA.bills);
  const [prescriptions, setPrescriptions] = React.useState(DATA.prescriptions);
  const [clinicAccounts, setClinicAccounts] = React.useState(DATA.clinicAccounts);

  // nav state
  const [started, setStarted] = React.useState(false);
  const [role, setRole] = React.useState(null); // 'doctor' | 'receptionist'
  const [consultMode, setConsultMode] = React.useState(false);
  const [tab, setTabState] = React.useState('home');
  const [stack, setStack] = React.useState([]);
  const [sheet, setSheet] = React.useState(null);
  const [scheduleView, setScheduleView] = React.useState('Week');
  const [patientsFocus, setPatientsFocus] = React.useState(false);
  const [toast, setToast] = React.useState('');
  const toastT = React.useRef(null);

  // queue / workflow state
  const [queue, setQueue] = React.useState(DATA.queueEntries);
  const [checkoutsToday, setCheckouts] = React.useState(DATA.checkoutsToday);

  // clinic profile + doctor first-run setup
  const [clinic, setClinic] = React.useState({ doctorName: DATA.STAFF.doctor.name, specialty: 'General Dentistry', clinicName: DATA.CLINIC.name, city: DATA.CLINIC.city, address: '', days: [1, 2, 3, 4, 5, 6], open: '09:00', close: '18:00', slot: 30 });
  const [doctorSetupDone, setDoctorSetupDone] = React.useState(false);

  const showToast = (msg) => { setToast(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2400); };
  const setTab = (id) => { setStack([]); setTabState(id); };
  const push = (name, params) => setStack(s => [...s, { name, params: params || {} }]);
  const goBack = () => setStack(s => s.slice(0, -1));
  const openPatient = (id, initialTab) => push('patient', { id, initialTab });
  const openAppointment = (id) => push('appointment', { id });
  const openLab = () => push('lab', {});
  const openCheckout = (id) => push('checkout', { id });
  const openSheet = (name, params) => setSheet({ name, params: params || {} });
  const closeSheet = () => setSheet(null);
  const goToPatients = (focus) => { setStack([]); setTabState('patients'); setPatientsFocus(!!focus); };
  const pickRole = (r) => { setRole(r); setConsultMode(false); setStack([]); setTabState(r === 'receptionist' ? 'queue' : 'home'); };

  const app = {
    patients, visits, procedures, treatmentPlans: DATA.treatmentPlans, labOrders, bills, prescriptions, clinicAccounts,
    queue, checkoutsToday, role, consultMode, clinic,
    density, tab, scheduleView, patientsFocus,
    setTab, goBack, openPatient, openAppointment, openLab, openCheckout, openSheet, closeSheet, showToast,
    goToPatients, clearPatientsFocus: () => setPatientsFocus(false), setScheduleView,
    pickRole, switchRole: () => { setConsultMode(false); setStack([]); setRole(null); },
    saveClinic: (c) => { setClinic(c); setDoctorSetupDone(true); },
    enterConsult: () => { setStack([]); setConsultMode(true); },
    exitConsult: () => setConsultMode(false),
    signOut: () => { setStarted(false); setRole(null); setConsultMode(false); setDoctorSetupDone(false); setTabState('home'); setStack([]); },
    // queue actions
    callIn: (id) => setQueue(qs => {
      if (qs.some(e => e.status === 'in_consultation')) { showToast('Finish the current consult first'); return qs; }
      return qs.map(e => e.id === id ? { ...e, status: 'in_consultation', calledInAt: DATA.NOW_TIME } : e);
    }),
    completeConsult: (id, consult) => setQueue(qs => {
      let next = qs.map(e => e.id === id ? { ...e, status: 'ready_for_checkout', outcome: 'treatment_done', readyAt: DATA.NOW_TIME, consult } : e);
      const waiting = next.filter(e => e.status === 'waiting').sort((a, b) => a.tokenNumber - b.tokenNumber);
      if (waiting[0]) next = next.map(e => e.id === waiting[0].id ? { ...e, status: 'in_consultation', calledInAt: DATA.NOW_TIME } : e);
      return next;
    }),
    checkout: (id, summary) => { setQueue(qs => qs.map(e => e.id === id ? { ...e, status: 'checked_out' } : e)); setCheckouts(cs => [{ ...summary, time: DATA.NOW_TIME }, ...cs]); },
    addToQueue: ({ patientId, chiefComplaint, priority, xrays }) => setQueue(qs => [...qs, { id: 'q' + Date.now(), patientId, tokenNumber: (Math.max(0, ...qs.map(e => e.tokenNumber)) + 1), status: 'waiting', chiefComplaint, priority: priority || 'normal', checkedInAt: DATA.NOW_TIME, calledInAt: null, readyAt: null, assignedDoctor: 's1', xrays: xrays || [], outcome: null, consult: null, transcript: '' }]),
    removeFromQueue: (id) => setQueue(qs => qs.filter(e => e.id !== id)),
    updateVisit: (id, patch) => setVisits(vs => vs.map(v => v.id === id ? { ...v, ...patch } : v)),
    moveVisit: (id, date, startTime) => setVisits(vs => vs.map(v => v.id === id ? { ...v, date, startTime } : v)),
    addVisit: (v) => setVisits(vs => [...vs, v]),
    addPatient: (p) => setPatients(ps => [p, ...ps]),
    updatePatient: (id, patch) => setPatients(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p)),
    updateToothState: (pid, tooth, state) => setPatients(ps => ps.map(p => p.id === pid ? { ...p, teeth: { ...p.teeth, [tooth]: state } } : p)),
    advanceProcedure: (id) => setProcedures(prs => prs.map(pr => {
      if (pr.id !== id) return pr;
      const idx = pr.stages.findIndex(s => !s.completed);
      const stages = pr.stages.map((s, i) => i === idx ? { ...s, completed: true, date: DATA.TODAY } : s);
      const completedVisits = Math.min(pr.estimatedVisits, pr.completedVisits + 1);
      const allDone = stages.every(s => s.completed);
      return { ...pr, stages, completedVisits, currentStage: (stages.find(s => !s.completed) || stages[stages.length - 1]).name, status: allDone ? 'completed' : 'in_progress' };
    })),
    markLabReceived: (id) => setLabOrders(ls => ls.map(l => l.id === id ? { ...l, status: 'received', actualReturnDate: DATA.TODAY } : l)),
    addLabOrder: (l) => setLabOrders(ls => [l, ...ls]),
    saveBill: (b) => setBills(bs => bs.some(x => x.id === b.id) ? bs.map(x => x.id === b.id ? b : x) : [b, ...bs]),
    saveRx: (r) => setPrescriptions(rs => rs.some(x => x.id === r.id) ? rs.map(x => x.id === r.id ? r : x) : [r, ...rs]),
    addAccount: (a) => setClinicAccounts(as => [a, ...as]),
  };

  // ---- render screen ----
  let screen;
  if (stack.length) {
    const top = stack[stack.length - 1];
    if (top.name === 'patient') screen = <PatientProfile key={top.params.id} patientId={top.params.id} initialTab={top.params.initialTab} />;
    else if (top.name === 'appointment') screen = <AppointmentScreen key={top.params.id} visitId={top.params.id} />;
    else if (top.name === 'lab') screen = <LabScreen />;
    else if (top.name === 'checkout') screen = <CheckoutScreen key={top.params.id} entryId={top.params.id} />;
  } else if (consultMode) {
    screen = <ConsultModeScreen />;
  } else if (role === 'receptionist') {
    if (tab === 'queue') screen = <ReceptionScreen />;
    else if (tab === 'patients') screen = <PatientsScreen />;
    else if (tab === 'schedule') screen = <ScheduleScreen />;
    else if (tab === 'finance') screen = <FinanceScreen />;
    else screen = <ReceptionScreen />;
  } else {
    if (tab === 'home') screen = <HomeScreen />;
    else if (tab === 'patients') screen = <PatientsScreen />;
    else if (tab === 'schedule') screen = <ScheduleScreen />;
    else if (tab === 'finance') screen = <FinanceScreen />;
    else screen = <HomeScreen />;
  }

  const showNav = !consultMode;
  const navItems = role === 'receptionist' ? RECEPTION_NAV : DOCTOR_NAV;
  const onNav = (id) => { if (id === 'consult') enterConsult(); else setTab(id); };
  const navTab = consultMode ? 'consult' : tab;

  const SheetComp = sheet && SHEETS[sheet.name];

  return (
    <AppContext.Provider value={app}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!started ? (
          <Onboarding onDone={() => setStarted(true)} />
        ) : !role ? (
          <RoleSelect onPick={pickRole} />
        ) : role === 'doctor' && !doctorSetupDone ? (
          <DoctorSetup clinic={clinic} onDone={(c) => { setClinic(c); setDoctorSetupDone(true); }} />
        ) : (
          <>
            <div key={(consultMode ? 'consult' : '') + (stack.length ? stack[stack.length - 1].name + (stack[stack.length - 1].params.id || '') : tab)} className={stack.length ? 'slide-in' : ''} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {screen}
            </div>
            {showNav && <BottomNav tab={navTab} onTab={onNav} items={navItems} />}
          </>
        )}
        {SheetComp && (
          <BottomSheet open onClose={closeSheet} dismissable={sheet.name !== 'endVisit'}>
            <SheetComp params={sheet.params} onClose={closeSheet} />
          </BottomSheet>
        )}
        <Toast message={toast} />
      </div>
    </AppContext.Provider>
  );
}

/* ---- root: owns tweaks + scaling stage ---- */
function Root() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--accent', t.accent);
    r.style.setProperty('--accent-ink', ACCENTS[t.accent] || '#fff');
    document.body.style.fontFamily = `'${t.font}', -apple-system, system-ui, sans-serif`;
  }, [t.accent, t.font]);

  React.useEffect(() => {
    const fit = () => {
      const s = Math.min((window.innerWidth - 24) / 402, (window.innerHeight - 24) / 874, 1);
      window.__dwScale = s; setScale(s);
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
          <IOSDevice width={402} height={874}>
            <App density={t.density} />
          </IOSDevice>
        </div>
      </div>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Brand" />
        <TweakColor label="Accent" value={t.accent} options={Object.keys(ACCENTS)} onChange={v => setTweak('accent', v)} />
        <TweakSection label="Typography" />
        <TweakRadio label="Font" value={t.font} options={['Plus Jakarta Sans', 'Manrope', 'DM Sans']} onChange={v => setTweak('font', v)} />
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={['standard', 'compact']} onChange={v => setTweak('density', v)} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
