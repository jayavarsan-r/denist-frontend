'use client';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { apiClient } from '@/lib/api/client';
import { updateClinic, updateClinicSettings, uploadClinicLogo } from '@/lib/services/clinic.service';
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
  const [registrationNumber, setRegistrationNumber] = useState(clinic.registrationNumber || '');
  const [logoUrl, setLogoUrl] = useState(clinic.logoUrl || null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef(null);

  const save = async () => {
    setSaving(true);
    try {
      await updateClinic({ name, city, address, phone, registrationNumber });
      updateClinicLocal({ clinicName: name, city, address, phone, registrationNumber });
      showToast('Clinic info saved');
    } catch {
      showToast('Failed to save — check connection');
    } finally { setSaving(false); }
  };

  const onLogoPick = async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    if (!/png|jpe?g/i.test(file.type)) { showToast('Logo must be PNG or JPEG'); return; }
    setLogoUploading(true);
    try {
      const { logoUrl: url } = await uploadClinicLogo(file);
      if (url) { setLogoUrl(url); updateClinicLocal({ logoUrl: url }); }
      showToast('Logo updated');
    } catch {
      showToast('Logo upload failed — try again');
    } finally { setLogoUploading(false); }
  };

  return (
    <div>
      {/* Logo — shown on every clinic PDF (case sheet, prescription, statement, lab) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(60,60,67,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {logoUrl ? <img src={logoUrl} alt="Clinic logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Icon name="image" size={22} color="var(--text-tertiary)" />}
        </div>
        <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={onLogoPick} />
        <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading} style={{ height: 36, padding: '0 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 14, fontWeight: 600, color: 'var(--blue)' }}>
          {logoUploading ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
        </button>
      </div>
      <Field label="Clinic name" value={name} onChange={setName} placeholder="e.g. Smile Care Dental" />
      <Field label="City" value={city} onChange={setCity} placeholder="e.g. Chennai" />
      <Field label="Address" value={address} onChange={setAddress} placeholder="Full clinic address" />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="+91 98765 43210" type="tel" />
      <Field label="Registration number" value={registrationNumber} onChange={setRegistrationNumber} placeholder="Clinic / council reg. no." />
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

// Doctor-managed staff permissions. First toggle: let receptionists add medicines.
function PermissionsPanel({ showToast }) {
  const clinic = useAppStore(s => s.clinic);
  const updateClinicLocal = useAppStore(s => s.updateClinicLocal);
  const [on, setOn] = useState(!!clinic?.settings?.receptionistCanAddMedicines);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !on;
    setOn(next); setSaving(true);
    try {
      await updateClinicSettings({ receptionistCanAddMedicines: next });
      updateClinicLocal({ settings: { ...(clinic?.settings || {}), receptionistCanAddMedicines: next } });
      showToast(next ? 'Receptionists can now add medicines' : 'Receptionist medicine access off');
    } catch (e) {
      setOn(!next);
      showToast(e?.apiError?.message || 'Could not save — run migration 009 if this persists');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <button onClick={toggle} disabled={saving} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', textAlign: 'left', opacity: saving ? 0.6 : 1 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Receptionists can add medicines</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Lets front-desk staff add to a patient's prescription</div>
        </div>
        <div style={{ width: 46, height: 28, borderRadius: 99, background: on ? 'var(--accent)' : 'rgba(60,60,67,0.2)', padding: 3, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', transition: 'background .2s', flexShrink: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </div>
      </button>
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
      if (!c) return;
      if (c.join_code) setJoinCode(c.join_code);
      updateClinicLocal({ joinCode: c.join_code || joinCode, clinicName: c.name || clinicName, city: c.city || city, settings: c.settings || {} });
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
        {role !== 'receptionist' && (
          <Section icon="userCheck" label="Permissions" open={openSection === 'perms'} onToggle={() => toggle('perms')}>
            <PermissionsPanel showToast={showToast} />
          </Section>
        )}
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
