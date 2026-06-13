'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { SheetHeader, SectionHeader, PrimaryButton } from '@/components/ui';
import { createLabCase, listLabs, createLab, LAB_CASE_TYPES } from '@/lib/services/lab-case.service';

const FIELD = { width: '100%', fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right' };

function Row({ label, children, first }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 46, padding: '8px 14px', borderTop: first ? 'none' : '1px solid var(--border-light)' }}>
      <span className="t-meta" style={{ flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

/**
 * NewLabCaseSheet — create a lab case for a patient (params: { patientId }).
 * "Save draft" keeps it local; "Send to lab" moves it to SENT, which fires the
 * WhatsApp template + timeout jobs (when the lab outbound flag is on).
 */
export default function NewLabCaseSheet({ params = {}, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const patients = usePatientStore((s) => s.patients);
  const p = params.patientId && patients.find((x) => x.id === params.patientId);

  const [labs, setLabs] = useState([]);
  const [labId, setLabId] = useState('');
  const [caseType, setCaseType] = useState('crown_pfm');
  const [teeth, setTeeth] = useState('');
  const [shade, setShade] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [addingLab, setAddingLab] = useState(false);
  const [newLabName, setNewLabName] = useState('');
  const [newLabPhone, setNewLabPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { listLabs().then(setLabs).catch(() => {}); }, []);

  const addLab = async () => {
    if (!newLabName.trim() || !newLabPhone.trim()) { showToast('Lab name and phone required'); return; }
    try {
      const lab = await createLab({ name: newLabName.trim(), phoneNumbers: [newLabPhone.trim()], consentLogged: true });
      setLabs((cur) => [...cur, lab]);
      setLabId(lab.id);
      setAddingLab(false);
      showToast(`${lab.name} added`);
    } catch (e) {
      showToast(e?.response?.data?.error === 'lab_already_exists' ? 'Lab already exists' : 'Could not add lab');
    }
  };

  const save = async (sendNow) => {
    if (saving) return;
    if (sendNow && !labId) { showToast('Choose a lab to send to'); return; }
    setSaving(true);
    try {
      const toothFdi = teeth.split(/[,\s]+/).map((t) => parseInt(t, 10)).filter((n) => n >= 11 && n <= 48);
      const created = await createLabCase({
        patientId: params.patientId,
        labId: labId || null,
        caseType,
        toothFdi,
        shade: shade.trim() || null,
        expectedDate: expectedDate || null,
        instructions: instructions.trim() || null,
        sendNow,
      });
      showToast(sendNow ? `${created.case_code} sent to lab` : `${created.case_code} saved as draft`);
      params.onSaved?.();
      onClose();
    } catch {
      showToast('Could not create the case');
      setSaving(false);
    }
  };

  if (!p) return null;

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={`Lab case · ${p.name}`} onClose={onClose} />

      <div className="card" style={{ overflow: 'hidden', marginBottom: 12 }}>
        <Row label="Lab" first>
          {addingLab ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%', justifyContent: 'flex-end' }}>
              <input value={newLabName} onChange={(e) => setNewLabName(e.target.value)} placeholder="Lab name" style={{ ...FIELD, width: 100, textAlign: 'left' }} />
              <input value={newLabPhone} onChange={(e) => setNewLabPhone(e.target.value.replace(/[^\d+]/g, ''))} placeholder="Phone" inputMode="tel" style={{ ...FIELD, width: 110, textAlign: 'left' }} />
              <button onClick={addLab} style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>Add</button>
            </div>
          ) : (
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select value={labId} onChange={(e) => setLabId(e.target.value)} style={{ fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right', maxWidth: 160 }}>
                <option value="">Choose later</option>
                {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button onClick={() => setAddingLab(true)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>+ New</button>
            </span>
          )}
        </Row>
        <Row label="Work type">
          <select value={caseType} onChange={(e) => setCaseType(e.target.value)} style={{ fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent', textAlign: 'right' }}>
            {LAB_CASE_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Row>
        <Row label="Teeth (FDI)">
          <input value={teeth} onChange={(e) => setTeeth(e.target.value)} placeholder="36, 37" inputMode="numeric" style={FIELD} />
        </Row>
        <Row label="Shade">
          <input value={shade} onChange={(e) => setShade(e.target.value)} placeholder="A2 (optional)" style={FIELD} />
        </Row>
        <Row label="Expected by">
          <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} style={{ ...FIELD, width: 150 }} />
        </Row>
      </div>

      <SectionHeader>Instructions to the lab</SectionHeader>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Margins, occlusion notes, material preferences…"
        rows={3}
        style={{ width: '100%', borderRadius: 14, border: '1px solid var(--border)', padding: '10px 14px', fontSize: 14.5, outline: 'none', resize: 'none', marginBottom: 14, background: '#fff', fontFamily: 'inherit' }}
      />

      <PrimaryButton onClick={() => save(true)}>{saving ? 'Saving…' : 'Send to lab'}</PrimaryButton>
      <button onClick={() => save(false)} style={{ width: '100%', marginTop: 10, fontSize: 14.5, fontWeight: 600, color: 'var(--blue)' }}>
        Save as draft
      </button>
    </div>
  );
}
