'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { SheetHeader, SectionHeader, PrimaryButton, SelectPill } from '@/components/ui';
import Icon from '@/components/icons';
import { findFreeSlots, findNextAvailable, friendlyDate } from '@/lib/data/slotFinder';

const PROCEDURES = ['RCT', 'Extraction', 'Scaling', 'Crown', 'Implant', 'Consultation'];
const DURATIONS = [15, 30, 45, 60];

export default function NewVisitSheet({ onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const clinic    = useAppStore((s) => s.clinic);
  const patients  = usePatientStore((s) => s.patients);
  const addVisit  = useVisitStore((s) => s.addVisit);
  const visits    = useVisitStore((s) => s.visits);

  const [pid,  setPid]  = useState(patients[0]?.id || '');
  const [type, setType] = useState('Consultation');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [dur,  setDur]  = useState(30);

  const [freeSlots,  setFreeSlots]  = useState([]);
  const [suggestion, setSuggestion] = useState(null); // { date, slots, daysAhead }

  // Recompute slots whenever date or duration changes
  useEffect(() => {
    const slots = findFreeSlots(date, visits, clinic, dur);
    setFreeSlots(slots);
    setTime(''); // reset selected time when date changes

    if (slots.length === 0) {
      const next = findNextAvailable(date, visits, clinic, dur);
      setSuggestion(next);
    } else {
      setSuggestion(null);
    }
  }, [date, dur]);

  const acceptSuggestion = () => {
    if (!suggestion) return;
    setDate(suggestion.date);
    setFreeSlots(suggestion.slots);
    setSuggestion(null);
    setTime(suggestion.slots[0].time);
  };

  const [saving, setSaving] = useState(false);
  const canSchedule = pid && date && time && !saving;

  const handleSchedule = async () => {
    setSaving(true);
    try {
      await addVisit({
        patientId: pid,
        date,
        startTime: time,
        durationMinutes: dur,
        status: 'confirmed',
        type,
        purpose: type,
      });
      onClose();
      showToast('Appointment scheduled');
    } catch {
      showToast('Could not schedule. Try again.');
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0 20px 32px' }}>
      <SheetHeader title="New appointment" onClose={onClose} />

      {/* Patient */}
      <SectionHeader>Patient</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {patients.map(p => (
          <SelectPill key={p.id} label={p.name.split(' ')[0]} active={pid === p.id} onClick={() => setPid(p.id)} />
        ))}
      </div>

      {/* Procedure */}
      <SectionHeader>Procedure</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {PROCEDURES.map(t => (
          <SelectPill key={t} label={t} active={type === t} onClick={() => setType(t)} />
        ))}
      </div>

      {/* Date + duration */}
      <SectionHeader>Date & duration</SectionHeader>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {DURATIONS.map(d => (
            <SelectPill key={d} label={d + 'm'} active={dur === d} onClick={() => setDur(d)} />
          ))}
        </div>
      </div>

      {/* ── Slot suggestions ── */}
      {freeSlots.length > 0 ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Free slots · {friendlyDate(date)}
          </div>
          <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {freeSlots.map(slot => (
              <button
                key={slot.time}
                onClick={() => setTime(slot.time)}
                style={{
                  height: 36, padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: time === slot.time ? 'var(--accent)' : '#fff',
                  color: time === slot.time ? 'var(--accent-ink)' : 'var(--text-primary)',
                  border: time === slot.time ? 'none' : '1px solid var(--border)',
                  flexShrink: 0,
                }}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Icon name="alert" size={16} color="var(--orange)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--orange)' }}>
              No free slots on {friendlyDate(date)}
            </div>
            {suggestion ? (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Next available: <strong>{friendlyDate(suggestion.date)}</strong> ({suggestion.daysAhead} day{suggestion.daysAhead > 1 ? 's' : ''} away) · {suggestion.slots.length} open slots
                </div>
                <button
                  onClick={acceptSuggestion}
                  style={{ marginTop: 8, height: 32, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}
                >
                  Jump to {friendlyDate(suggestion.date)}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>No availability found in the next 14 days.</div>
            )}
          </div>
        </div>
      )}

      {/* Manual time override (if they want a specific time not in the list) */}
      {freeSlots.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Or enter a specific time</div>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
          />
        </div>
      )}

      <PrimaryButton onClick={handleSchedule} style={{ opacity: canSchedule ? 1 : 0.4 }}>
        {saving ? 'Scheduling…' : `Schedule${time ? ` · ${freeSlots.find(s => s.time === time)?.label || time}` : ''}`}
      </PrimaryButton>
    </div>
  );
}
