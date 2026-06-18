'use client';
import { useState } from 'react';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader } from '@/components/ui';
import { formatDate } from '@/lib/data/utils';
import BeforeAfterCapture from '@/components/sheets/BeforeAfterCapture';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', width: 110, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 15, color: 'var(--text-primary)', flex: 1 }}>{value}</span>
    </div>
  );
}

function MedsList({ meds }) {
  if (!meds || meds.length === 0) return null;
  const list = typeof meds === 'string' ? (() => { try { return JSON.parse(meds); } catch { return [{ name: meds }]; } })() : meds;
  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader>Medicines</SectionHeader>
      <div className="card" style={{ overflow: 'hidden' }}>
        {list.map((m, i) => (
          <div key={i} style={{ padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{m.name || m}</div>
            {(m.dosage || m.frequency || m.duration) && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                {[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Render structured prescription(s) recorded for this visit (medicines jsonb from the
// prescriptions table) — the per-case detail the flat visit row never carried. Each
// `rx` is a raw backend prescription row: { medicines:[{name,dose,frequency,duration,
// instructions}], instructions }.
function PrescriptionBlock({ prescriptions }) {
  const list = (prescriptions || []).filter(rx => (rx.medicines || []).length || rx.instructions);
  if (!list.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <SectionHeader>Prescription</SectionHeader>
      <div className="card" style={{ overflow: 'hidden' }}>
        {list.flatMap((rx, ri) =>
          (rx.medicines || []).map((m, mi) => (
            <div key={`${ri}-${mi}`} style={{ padding: '10px 14px', borderTop: (ri + mi) ? '1px solid var(--border-light)' : 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{m.name || '—'}</div>
              {(m.dose || m.dosage || m.frequency || m.duration) && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {[m.dose || m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ')}
                </div>
              )}
              {(m.instructions || m.notes) && (
                <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 2 }}>{m.instructions || m.notes}</div>
              )}
            </div>
          ))
        )}
        {list.map((rx, ri) => rx.instructions && (
          <div key={`note-${ri}`} style={{ padding: '10px 14px', borderTop: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Instructions</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{rx.instructions}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VisitRecordSheet({ params, onClose }) {
  const patients = usePatientStore((s) => s.patients);
  const clinicalVisits = useVisitStore((s) => s.clinicalVisits);
  const visits = useVisitStore((s) => s.visits);

  const cv = clinicalVisits.find(x => x.id === params.id);
  const appt = !cv && visits.find(x => x.id === params.id);
  const record = cv || appt;
  if (!record) return null;

  // Diagnosis + structured Rx for this specific visit, passed in from the case sheet
  // (the flat visit store row doesn't carry them). Diagnosis falls back to the linked
  // treatment plan's diagnosis when the visit's own notes are empty.
  const prescriptions = params.prescriptions || [];
  const diagnosis = record.notes || params.planDiagnosis || '';

  const p = patients.find(x => x.id === record.patientId);
  const isConsult = record.type === 'consultation';
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div style={{ padding: '0 20px 36px' }}>
      <SheetHeader title={p ? p.name : 'Patient'} onClose={onClose} />
      <div style={{ marginTop: -10, marginBottom: 14, paddingLeft: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: isConsult ? 'var(--blue)' : 'var(--green)', background: isConsult ? 'rgba(59,130,246,0.1)' : 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: 99 }}>
          {isConsult ? 'Consultation' : 'Appointment'}
        </span>
      </div>

      {/* patient meta */}
      {p && (
        <div className="card" style={{ padding: '12px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
            {(p.age || p.gender) && <div className="t-meta">{[p.age, p.gender, p.bloodGroup].filter(Boolean).join(' · ')}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{formatDate(record.date)}</div>
            {record.startTime && <div className="t-meta">{record.startTime}</div>}
          </div>
        </div>
      )}

      {/* clinical details */}
      <div className="card" style={{ marginBottom: 16 }}>
        <Row label="Procedure" value={record.procedureName || record.purpose} />
        <Row label="Tooth" value={record.toothNumber ? `Tooth ${record.toothNumber}` : null} />
        <Row label="Notes / Diagnosis" value={diagnosis} />
        <Row label="Next steps" value={record.nextSteps} />
        <Row label="Follow-up" value={record.followUpDate ? formatDate(record.followUpDate) : null} />
        {record.cost != null && <Row label="Cost" value={`${record.currency || 'INR'} ${record.cost}`} />}
        <Row label="Status" value={record.status ? record.status.replace(/_/g, ' ') : null} />
      </div>

      {/* Before / After for this case */}
      {isConsult && record.id && <BeforeAfterCapture patientId={record.patientId} visitId={record.id} />}

      {/* Structured prescription recorded for this visit (from the prescriptions table).
          Falls back to the one-line medications summary on the visit row when no
          structured Rx is linked. */}
      {prescriptions.length
        ? <PrescriptionBlock prescriptions={prescriptions} />
        : <MedsList meds={record.medications} />}

      {/* The structured details above are the overview. The raw (often Tamil) transcript
          is secondary — collapsed by default so it doesn't replace the summary. */}
      {record.rawTranscript && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setShowTranscript(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600 }}>
            <Icon name={showTranscript ? 'chevDown' : 'chevRight'} size={14} color="var(--text-tertiary)" />
            {showTranscript ? 'Hide original transcript' : 'Show original transcript'}
          </button>
          {showTranscript && (
            <div className="card" style={{ padding: '12px 14px', marginTop: 8 }}>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>{record.rawTranscript}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
