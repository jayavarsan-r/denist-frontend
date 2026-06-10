'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { SheetHeader, SectionHeader, PrimaryButton, Field } from '@/components/ui';
import { TOOTH_STATE_STYLE } from '@/lib/data/procedures';
import { formatDate } from '@/lib/data/utils';
import { createVisit } from '@/lib/services/visit.service';

const TOOTH_STATES = ['healthy', 'filling', 'rct', 'crown', 'implant', 'extraction', 'infection', 'scheduled'];
const TOOTH_STATE_LABEL = { healthy: 'Healthy', filling: 'Filling', rct: 'Root canal', crown: 'Crown', implant: 'Implant', extraction: 'Extraction', infection: 'Infection', scheduled: 'Scheduled' };
// Tooth state is derived from visits, so charting a tooth records a visit with that
// procedure. 'healthy' has nothing to record (it's a reset) and 'scheduled' is a plan.
const STATE_TO_PROCEDURE = { filling: 'Filling', rct: 'Root Canal Treatment', crown: 'Crown', implant: 'Implant', extraction: 'Extraction', infection: 'Infection management', scheduled: 'Scheduled treatment' };

export default function ToothDetailSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const refreshPatientData = useAppStore((s) => s.refreshPatientData);
  const updateToothState = usePatientStore((s) => s.updateToothState);
  const [state, setState] = useState(params.state || 'healthy');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const toothData = params.toothData || null;

  const save = async () => {
    setSaving(true);
    // Optimistic tint for instant feedback (reconciled by tooth-history refetch).
    updateToothState(params.patientId, params.tooth, state);
    try {
      // Persist by recording a visit on this tooth — the tooth map reads tooth_number
      // from visits, so this is what makes a manual chart edit stick. ALSO record when
      // there are findings/notes even if the state is left 'healthy' (the doctor is just
      // documenting), otherwise those findings would be silently dropped.
      const treated = state && state !== 'healthy';
      if (treated || notes.trim()) {
        await createVisit({
          patientId: params.patientId,
          procedureName: treated ? (STATE_TO_PROCEDURE[state] || 'Charting') : 'Examination',
          toothNumber: String(params.tooth),
          notes: notes.trim() || `Charted ${TOOTH_STATE_LABEL[state]} · tooth ${params.tooth}`,
          status: state === 'scheduled' ? 'planned' : 'completed',
        });
      }
      refreshPatientData();
      showToast(`Tooth ${params.tooth} updated`);
      onClose();
    } catch (e) {
      showToast('Could not save — try again');
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={`Tooth ${params.tooth}`} onClose={onClose} />
      <SectionHeader>State</SectionHeader>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {TOOTH_STATES.map(s => {
          const active = state === s; const c = TOOTH_STATE_STYLE[s];
          return <button key={s} onClick={() => setState(s)} style={{ height: 36, padding: '0 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, border: active ? `1.5px solid ${c.stroke}` : '1px solid var(--border)', background: active ? c.fill : '#fff', color: active ? (s === 'rct' ? 'var(--text-primary)' : c.num) : 'var(--text-secondary)' }}>{TOOTH_STATE_LABEL[s]}</button>;
        })}
      </div>
      <Field label="Notes" multiline value={notes} onChange={setNotes} placeholder="Clinical notes for this tooth…" mic minHeight={50} onMic={() => showToast('Listening…')} />

      {toothData && toothData.completedProcedures?.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <SectionHeader>Procedure history</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            {toothData.completedProcedures.map((proc, i) => (
              <div key={proc.visitId || i} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{proc.procedure}</div>
                  {proc.cost != null && (
                    <span className="tnum" style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)', flexShrink: 0, marginLeft: 8 }}>₹{Math.round(proc.cost).toLocaleString('en-IN')}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{proc.date ? formatDate(proc.date) : ''}</div>
                {/* Other teeth covered in this same procedure (multi-tooth) */}
                {Array.isArray(proc.teeth) && proc.teeth.filter(t => String(t) !== String(params.tooth)).length > 0 && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Same procedure also on: {proc.teeth.filter(t => String(t) !== String(params.tooth)).join(', ')}
                  </div>
                )}
                {proc.notes && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>{proc.notes}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {toothData && toothData.labOrders?.length > 0 && (
        <>
          <SectionHeader>Lab work</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            {toothData.labOrders.map((lo, i) => (
              <div key={lo.id || i} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{lo.procedureType || lo.workDescription || 'Lab work'}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'capitalize', flexShrink: 0, marginLeft: 8 }}>{lo.status}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {[lo.labName, lo.shade && `Shade ${lo.shade}`, lo.chargedToPatient != null && `₹${Math.round(lo.chargedToPatient).toLocaleString('en-IN')}`].filter(Boolean).join(' · ')}
                </div>
                {(lo.sentDate || lo.expectedReturnDate) && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                    {lo.sentDate ? `Sent ${formatDate(lo.sentDate)}` : ''}{lo.expectedReturnDate ? ` · Expected ${formatDate(lo.expectedReturnDate)}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {toothData && toothData.upcomingAppointments?.length > 0 && (
        <>
          <SectionHeader>Upcoming</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
            {toothData.upcomingAppointments.map((appt, i) => (
              <div key={appt.appointmentId || i} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{appt.purpose || 'Appointment'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{appt.date} {appt.time ? '· ' + appt.time : ''}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 22 }} />
      <PrimaryButton onClick={save} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</PrimaryButton>
    </div>
  );
}
