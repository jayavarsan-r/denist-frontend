/* DentWay shared components */

function Avatar({ name, size = 44, dot = false, ring = false, fontSize }) {
  const fs = fontSize || Math.round(size * 0.36);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
        color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: fs, boxShadow: ring ? '0 0 0 2px #fff, var(--elevation-1)' : 'none',
      }}>{getInitials(name)}</div>
      {dot && <div style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 0 2px #fff' }} />}
    </div>
  );
}

const CHIP_TONES = {
  neutral: { bg: 'rgba(60,60,67,0.08)', fg: 'var(--text-secondary)' },
  dark:    { bg: 'var(--accent)', fg: 'var(--accent-ink)' },
  amber:   { bg: 'rgba(255,159,10,0.14)', fg: '#C77700' },
  green:   { bg: 'rgba(52,199,89,0.14)', fg: '#1E8E3E' },
  orange:  { bg: 'rgba(255,149,0,0.14)', fg: '#C2580A' },
  red:     { bg: 'rgba(255,59,48,0.12)', fg: 'var(--red)' },
  teal:    { bg: 'rgba(50,173,230,0.16)', fg: '#1B86B8' },
  purple:  { bg: 'rgba(191,90,242,0.14)', fg: '#9333C7' },
  blueOutline: { bg: 'transparent', fg: 'var(--blue)', border: '1px solid var(--blue)' },
};
function Chip({ label, tone = 'neutral', size = 'sm', style }) {
  const t = CHIP_TONES[tone] || CHIP_TONES.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: t.bg, color: t.fg, border: t.border || 'none',
      borderRadius: 8, padding: size === 'lg' ? '5px 11px' : '3px 8px',
      fontSize: size === 'lg' ? 13 : 12, fontWeight: 600, whiteSpace: 'nowrap',
      ...style,
    }}>{label}</span>
  );
}

const STATUS_CHIP = {
  confirmed: ['Confirmed', 'neutral'], arrived: ['Arrived', 'amber'], done: ['Done', 'green'],
  no_show: ['No-show', 'red'], late: ['Late', 'red'],
  waiting: ['Waiting', 'neutral'], in_consultation: ['In consult', 'amber'],
  ready_for_checkout: ['Ready', 'teal'], checked_out: ['Checked out', 'green'], urgent: ['Urgent', 'red'],
  planned: ['Planned', 'neutral'], in_progress: ['In progress', 'amber'], completed: ['Completed', 'green'],
  paused: ['Paused', 'neutral'], follow_up: ['Follow-up', 'teal'],
  pending: ['Pending', 'neutral'], sent: ['Sent', 'amber'], received: ['Received', 'teal'],
  active: ['Active', 'amber'], paid: ['Paid', 'green'], partial: ['Partial', 'amber'], unpaid: ['Unpaid', 'orange'],
};
function StatusChip({ status, size }) {
  const [label, tone] = STATUS_CHIP[status] || [status, 'neutral'];
  return <Chip label={label} tone={tone} size={size} />;
}

function SectionHeader({ children, right, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 4px 8px', ...style }}>
      <span className="t-section">{children}</span>
      {right}
    </div>
  );
}

function ToothChip({ tooth }) {
  if (tooth == null) return null;
  return <Chip label={'Tooth ' + tooth} tone="neutral" />;
}

/* progress stepper dots for procedure stages */
function StageDots({ stages, currentIndex }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      {stages.map((s, i) => {
        const done = s.completed;
        const current = i === currentIndex;
        return (
          <React.Fragment key={i}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
              background: done ? 'var(--accent)' : current ? '#fff' : '#fff',
              border: done ? '1.5px solid var(--accent)' : current ? '2px solid var(--blue)' : '1.5px solid rgba(60,60,67,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {current && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--blue)' }} />}
            </div>
            {i < stages.length - 1 && <div style={{ flex: 1, height: 1.5, background: done ? 'var(--accent)' : 'rgba(60,60,67,0.18)' }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* pill toggle for clinical flags */
function PillToggle({ label, active, onClick }) {
  return (
    <button onClick={onClick} className="tap" style={{
      height: 36, padding: '0 14px', borderRadius: 12, fontSize: 14, fontWeight: 500,
      background: active ? 'rgba(255,59,48,0.10)' : '#fff',
      color: active ? 'var(--red)' : 'var(--text-primary)',
      border: active ? '1px solid rgba(255,59,48,0.5)' : '1px solid var(--border)',
    }}>{label}</button>
  );
}

/* generic selectable pill (filter / type) */
function SelectPill({ label, active, onClick, accentDark = true }) {
  return (
    <button onClick={onClick} className="tap" style={{
      height: 34, padding: '0 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
      background: active ? (accentDark ? 'var(--accent)' : 'rgba(0,122,255,0.1)') : '#fff',
      color: active ? (accentDark ? 'var(--accent-ink)' : 'var(--blue)') : 'var(--text-secondary)',
      border: active ? 'none' : '1px solid var(--border)', whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );
}

/* segmented control */
function Segmented({ options, value, onChange, style }) {
  return (
    <div style={{
      display: 'flex', background: '#fff', border: '1px solid var(--border)',
      borderRadius: 9, padding: 2, height: 34, ...style,
    }}>
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const active = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            flex: 1, borderRadius: 7, fontSize: 13, fontWeight: 600,
            background: active ? 'var(--accent)' : 'transparent',
            color: active ? 'var(--accent-ink)' : 'var(--text-secondary)',
            transition: 'all .15s ease',
          }}>{label}</button>
        );
      })}
    </div>
  );
}

/* bottom sheet — renders inside the device (absolute) */
function BottomSheet({ open, onClose, children, dismissable = true, maxHeight = '92%' }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div className="scrim" onClick={dismissable ? onClose : undefined}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)' }} />
      <div className="sheet-anim" style={{
        position: 'relative', background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        maxHeight, display: 'flex', flexDirection: 'column', boxShadow: 'var(--elevation-2)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px', flexShrink: 0 }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'rgba(60,60,67,0.22)' }} />
        </div>
        <div className="scroll" style={{ overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

function SheetHeader({ title, onClose, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 14px' }}>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</span>
      {right || (onClose && <button onClick={onClose} style={{ color: 'var(--text-secondary)', display: 'flex' }}><Icon name="x" size={24} /></button>)}
    </div>
  );
}

/* text field — plain bottom-border style with optional mic */
function Field({ label, value, onChange, placeholder, type = 'text', mic, multiline, minHeight = 80, onMic }) {
  const inputStyle = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: 17, color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'none',
  };
  return (
    <div style={{ marginBottom: 4 }}>
      {label && <div className="t-section" style={{ marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8, gap: 8 }}>
        {multiline
          ? <textarea value={value} placeholder={placeholder} onChange={e => onChange && onChange(e.target.value)} style={{ ...inputStyle, minHeight }} />
          : <input type={type} value={value} placeholder={placeholder} onChange={e => onChange && onChange(e.target.value)} style={inputStyle} />}
        {mic && <button onClick={onMic} style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0, marginTop: multiline ? 2 : 0 }}><Icon name="mic" size={18} /></button>}
      </div>
    </div>
  );
}

/* dark primary button */
function PrimaryButton({ children, onClick, style, full = true, height = 52 }) {
  return (
    <button onClick={onClick} className="btn-dark" style={{ width: full ? '100%' : 'auto', height, padding: full ? 0 : '0 22px', ...style }}>{children}</button>
  );
}

/* toast */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div key={message} style={{
      position: 'absolute', bottom: 96, left: '50%', zIndex: 300,
      background: 'rgba(28,28,30,0.94)', color: '#fff', fontSize: 14, fontWeight: 600,
      padding: '12px 18px', borderRadius: 14, boxShadow: 'var(--elevation-2)',
      animation: 'toastUp 2.4s ease forwards', whiteSpace: 'nowrap',
      backdropFilter: 'blur(10px)', maxWidth: '88%',
    }}>{message}</div>
  );
}

/* empty state */
function EmptyState({ icon = 'calendar', title, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: 6 }}>
      <div style={{ color: 'var(--text-tertiary)', marginBottom: 6 }}><Icon name={icon} size={46} stroke={1.6} /></div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
      {hint && <div className="t-meta">{hint}</div>}
    </div>
  );
}

/* bottom nav */
function BottomNav({ tab, onTab, items }) {
  const navItems = items || [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'patients', icon: 'person', label: 'Patients' },
    { id: 'schedule', icon: 'calendar', label: 'Schedule' },
    { id: 'finance', icon: 'chart', label: 'Finance' },
  ];
  return (
    <div style={{
      flexShrink: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px) saturate(180%)',
      borderTop: '1px solid rgba(0,0,0,0.10)', display: 'flex', paddingBottom: 22, paddingTop: 8,
    }}>
      {navItems.map(it => {
        const active = tab === it.id;
        return (
          <button key={it.id} onClick={() => onTab(it.id)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}>
            <Icon name={it.icon} size={26} stroke={active ? 2.2 : 1.9} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 600 : 500, letterSpacing: '0.01em' }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* top header used on tab roots */
function TopBar({ children, style }) {
  return <div style={{ paddingTop: 56, ...style }}>{children}</div>;
}

/* secondary screen nav bar (back / title / action) */
function NavBar({ title, onBack, right }) {
  return (
    <div style={{
      flexShrink: 0, paddingTop: 56, paddingBottom: 10, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border-light)',
      display: 'flex', alignItems: 'center', padding: '56px 12px 10px',
    }}>
      <button onClick={onBack} style={{ width: 40, height: 32, display: 'flex', alignItems: 'center', color: 'var(--blue)' }}><Icon name="chevLeft" size={26} /></button>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 600 }}>{title}</div>
      <div style={{ width: 40, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
}

Object.assign(window, {
  Avatar, Chip, StatusChip, SectionHeader, ToothChip, StageDots, PillToggle, SelectPill,
  Segmented, BottomSheet, SheetHeader, Field, PrimaryButton, Toast, EmptyState, BottomNav, TopBar, NavBar,
});
