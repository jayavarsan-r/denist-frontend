'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { apiClient } from '@/lib/api/client';
import { updateClinic } from '@/lib/services/clinic.service';
import Icon from '@/components/icons';
import { SheetHeader, Chip } from '@/components/ui';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }}
      />
    </div>
  );
}

function SaveBtn({ onClick, saving }) {
  return (
    <button onClick={onClick} disabled={saving} style={{ width: '100%', background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 12, padding: '12px', fontSize: 15, fontWeight: 700, marginTop: 8, opacity: saving ? 0.6 : 1 }}>
      {saving ? 'Saving…' : 'Save'}
    </button>
  );
}

function Section({ icon, label, open, onToggle, children }) {
  return (
    <div style={{ borderTop: '1px solid var(--border-light)' }}>
      <button className="rowtap" onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left' }}>
        <Icon name={icon} size={18} color="var(--blue)" />
        <span style={{ flex: 1, fontSize: 16 }}>{label}</span>
        <Icon name={open ? 'chevDown' : 'chevRight'} size={16} color="var(--text-tertiary)" />
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  );
}

function ClinicInfoPanel({ showToast }) {
  const clinic = useAppStore(s => s.clinic);
  const updateClinicLocal = useAppStore(s => s.updateClinicLocal);
  const [name, setName] = useState(clinic.clinicName || '');
  const [city, setCity] = useState(clinic.city || '');
  const [address, setAddress] = useState(clinic.address || '');
  const [phone, setPhone] = useState(clinic.phone || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateClinic({ name, city, address, phone });
      updateClinicLocal({ clinicName: name, city, address, phone });
      showToast('Clinic info saved');
    } catch {
      showToast('Failed to save — check connection');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <Field label="Clinic name" value={name} onChange={setName} placeholder="e.g. Smile Care Dental" />
      <Field label="City" value={city} onChange={setCity} placeholder="e.g. Chennai" />
      <Field label="Address" value={address} onChange={setAddress} placeholder="Full clinic address" />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="+91 98765 43210" type="tel" />
      <SaveBtn onClick={save} saving={saving} />
    </div>
  );
}

function WorkingHoursPanel({ showToast }) {
  const clinic = useAppStore(s => s.clinic);
  const updateClinicLocal = useAppStore(s => s.updateClinicLocal);
  const [openT, setOpenT] = useState(clinic.open || '09:00');
  const [closeT, setCloseT] = useState(clinic.close || '18:00');
  const [days, setDays] = useState(clinic.days || [1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);

  const toggleDay = d => setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  const save = async () => {
    setSaving(true);
    try {
      await updateClinic({ openTime: openT, closeTime: closeT, workingDays: days });
      updateClinicLocal({ open: openT, close: closeT, days });
      showToast('Hours saved');
    } catch {
      showToast('Failed to save — check connection');
    } finally { setSaving(false); }
  };

  const timeStyle = { width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, outline: 'none', fontFamily: 'inherit', background: '#fff' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Opens</div>
          <input type="time" value={openT} onChange={e => setOpenT(e.target.value)} style={timeStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Closes</div>
          <input type="time" value={closeT} onChange={e => setCloseT(e.target.value)} style={timeStyle} />
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Working days</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((d, i) => (
          <button key={d} onClick={() => toggleDay(d)} style={{ width: 40, height: 40, borderRadius: '50%', fontSize: 12, fontWeight: 700, background: days.includes(d) ? 'var(--accent)' : '#fff', color: days.includes(d) ? 'var(--accent-ink)' : 'var(--text-secondary)', border: days.includes(d) ? 'none' : '1px solid var(--border)' }}>
            {DAY_LABELS[i]}
          </button>
        ))}
      </div>
      <SaveBtn onClick={save} saving={saving} />
    </div>
  );
}

function MyProfilePanel({ showToast }) {
  const name = useAppStore(s => s.name);
  const updateClinicLocal = useAppStore(s => s.updateClinicLocal);
  const [displayName, setDisplayName] = useState(name || '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get('/api/auth/me').then(r => {
      const s = r.data?.staff || r.data?.dentist;
      if (s?.phone) setPhone(s.phone);
      if (s?.name) setDisplayName(s.name);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put('/api/auth/profile', { name: displayName, phone });
      updateClinicLocal({ doctorName: displayName });
      showToast('Profile saved');
    } catch {
      showToast('Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <Field label="Full name" value={displayName} onChange={setDisplayName} placeholder="Dr. Your Name" />
      <Field label="Mobile number" value={phone} onChange={setPhone} placeholder="10-digit number" type="tel" />
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8, lineHeight: 1.4 }}>
        Changing your number will apply on your next sign-in.
      </div>
      <SaveBtn onClick={save} saving={saving} />
    </div>
  );
}

function StaffPanel() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/api/staff').then(r => setStaff(r.data?.staff || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: 14, padding: '4px 0' }}>Loading…</div>;
  if (staff.length === 0) return <div style={{ color: 'var(--text-tertiary)', fontSize: 14, lineHeight: 1.5 }}>No staff added yet. Share the clinic join code to add staff members.</div>;

  return (
    <div>
      {staff.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-raised, #f4f4f5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {(s.name || 'S')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.role}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const PROCEDURE_TYPES = ['Examination', 'Consultation', 'X-Ray', 'Cleaning / Scaling', 'Filling', 'Root Canal Treatment', 'Extraction', 'Crown', 'Bridge', 'Implant', 'Braces / Orthodontics', 'Teeth Whitening', 'Denture', 'Fluoride Treatment', 'Other'];

function ProceduresPanel() {
  return (
    <div>
      {PROCEDURE_TYPES.map((t, i) => (
        <div key={t} style={{ fontSize: 15, padding: '9px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', color: 'var(--text-primary)' }}>{t}</div>
      ))}
    </div>
  );
}

export default function AccountSettingsSheet({ onClose }) {
  const name = useAppStore(s => s.name);
  const role = useAppStore(s => s.role);
  const clinic = useAppStore(s => s.clinic);
  const updateClinicLocal = useAppStore(s => s.updateClinicLocal);
  const switchRole = useAppStore(s => s.switchRole);
  const signOut = useAppStore(s => s.signOut);
  const openSheet = useAppStore(s => s.openSheet);
  const showToast = useAppStore(s => s.showToast);

  const [openSection, setOpenSection] = useState(null);
  const [joinCode, setJoinCode] = useState(clinic?.joinCode || '');
  const toggle = s => setOpenSection(prev => prev === s ? null : s);

  const clinicName = clinic?.clinicName || '';
  const city = clinic?.city || '';

  // Always fetch fresh clinic data on mount to ensure join code is available
  useEffect(() => {
    apiClient.get('/api/clinic').then(r => {
      const c = r.data?.clinic;
      if (c?.join_code) {
        setJoinCode(c.join_code);
        updateClinicLocal({ joinCode: c.join_code, clinicName: c.name || clinicName, city: c.city || city });
      }
    }).catch(() => {});
  }, []);

  const handleShare = async () => {
    if (!joinCode) return;
    const text = `Join ${clinicName || 'our clinic'} on DentWay!\n\nJoin code: ${joinCode}\n\nDownload DentWay and enter this code to connect.`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: `${clinicName || 'DentWay'} — Join Code`, text }); } catch {}
    } else {
      try { await navigator.clipboard?.writeText(joinCode); showToast('Code copied!'); } catch { showToast(joinCode); }
    }
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={name || 'Account'} onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -6, marginBottom: 16 }}>
        <Chip label={role === 'receptionist' ? 'Receptionist' : 'Doctor'} tone="dark" size="lg" />
        {clinicName && <span className="t-meta">{clinicName}{city ? ' · ' + city : ''}</span>}
      </div>

      <button
        onClick={handleShare}
        className="card"
        style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '14px 16px', marginBottom: 16, gap: 12, textAlign: 'left', border: '2px solid var(--accent)', borderRadius: 16 }}
      >
        <Icon name="share" size={20} color="var(--blue)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 2 }}>Clinic join code</div>
          <div className="tnum" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent)' }}>
            {joinCode || <span style={{ color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 500 }}>Loading…</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Tap to share with staff</div>
        </div>
        <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
      </button>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 16, padding: 0 }}>
        <Section icon="person" label="My profile" open={openSection === 'profile'} onToggle={() => toggle('profile')}>
          <MyProfilePanel showToast={showToast} />
        </Section>
        <Section icon="pencil" label="Clinic name & address" open={openSection === 'clinic'} onToggle={() => toggle('clinic')}>
          <ClinicInfoPanel showToast={showToast} />
        </Section>
        <Section icon="clock" label="Working hours" open={openSection === 'hours'} onToggle={() => toggle('hours')}>
          <WorkingHoursPanel showToast={showToast} />
        </Section>
        <Section icon="user2" label="Staff accounts" open={openSection === 'staff'} onToggle={() => toggle('staff')}>
          <StaffPanel />
        </Section>
        <Section icon="tooth" label="Procedures library" open={openSection === 'procedures'} onToggle={() => toggle('procedures')}>
          <ProceduresPanel />
        </Section>
        <div style={{ borderTop: '1px solid var(--border-light)' }}>
          <button className="rowtap" onClick={() => { onClose(); setTimeout(() => openSheet('prescriptionDesign', {}), 320); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left' }}>
            <Icon name="doc" size={18} color="var(--blue)" />
            <span style={{ flex: 1, fontSize: 16 }}>Prescription design</span>
            <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
          </button>
        </div>
      </div>

      <button onClick={() => { onClose(); switchRole(); }} className="card rowtap" style={{ width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', marginBottom: 16, textAlign: 'left' }}>
        <Icon name="swap" size={20} color="var(--blue)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Switch role</div>
          <div className="t-meta">Try the {role === 'receptionist' ? 'doctor' : 'receptionist'} view</div>
        </div>
        <Icon name="chevRight" size={16} color="var(--text-tertiary)" />
      </button>

      <button onClick={() => { onClose(); signOut(); }} className="card rowtap" style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: 'var(--red)', fontSize: 16, fontWeight: 500 }}>
        <Icon name="logout" size={18} color="var(--red)" />Sign out
      </button>
    </div>
  );
}
