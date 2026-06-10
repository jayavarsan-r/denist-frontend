'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { SheetHeader, SectionHeader, PrimaryButton, SelectPill, Avatar } from '@/components/ui';
import Icon from '@/components/icons';
import { findFreeSlots, findNextAvailable, friendlyDate } from '@/lib/data/slotFinder';
import { useAudioRecorder } from '@/lib/hooks/useAudioRecorder';
import { useTranscription } from '@/lib/hooks/useTranscription';
import { parseScheduleIntent } from '@/lib/services/ai.service';

const PROCEDURES = ['Consultation', 'Scaling', 'RCT', 'Crown', 'Extraction', 'Implant'];
const DURATIONS = [15, 20, 30, 45, 60, 90];
// Procedure-aware durations (deterministic) — the engine recommends, doctor can override.
const PROC_DURATION = { Consultation: 20, Scaling: 30, RCT: 60, Crown: 20, Extraction: 30, Implant: 90, 'Ortho review': 15, 'Follow-up': 15 };

function slotHour(t) { return parseInt((t || '0').split(':')[0], 10); }
function inWindow(t, win) {
  const h = slotHour(t);
  return win === 'morning' ? h < 12 : win === 'afternoon' ? (h >= 12 && h < 16) : win === 'evening' ? h >= 16 : true;
}
function windowOf(t) { const h = slotHour(t); return h < 12 ? 'morning' : h < 16 ? 'afternoon' : 'evening'; }
// Each part of the day gets its own colour so the few suggestions read at a glance.
const WIN_STYLE = {
  morning:   { tint: '#2F6FB3', soft: 'rgba(0,122,255,0.10)',  label: 'Morning' },
  afternoon: { tint: '#B07D2B', soft: 'rgba(255,159,10,0.13)', label: 'Afternoon' },
  evening:   { tint: '#7B4DB8', soft: 'rgba(175,82,222,0.13)', label: 'Evening' },
};

// Curate up to 5 varied suggestions — spread across the day, preferred window first.
function buildSuggestions(freeSlots, preferredWindow) {
  const byWin = { morning: [], afternoon: [], evening: [] };
  freeSlots.forEach(s => byWin[windowOf(s.time)].push(s));
  const out = [];
  if (preferredWindow) byWin[preferredWindow].slice(0, 3).forEach(s => out.push(s));
  const order = preferredWindow
    ? [preferredWindow, ...['morning', 'afternoon', 'evening'].filter(w => w !== preferredWindow)]
    : ['morning', 'afternoon', 'evening'];
  for (const w of order) for (const s of byWin[w]) { if (out.length >= 5) break; if (!out.includes(s)) out.push(s); }
  return out.slice(0, 5);
}

export default function NewVisitSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const clinic    = useAppStore((s) => s.clinic);
  const patients  = usePatientStore((s) => s.patients);
  const loadPatients = usePatientStore((s) => s.loadPatients);
  const addVisit  = useVisitStore((s) => s.addVisit);
  const visits    = useVisitStore((s) => s.visits);

  // Only preselect when a patient is passed in (e.g. from a patient profile). Opening
  // "New appointment" cold should land on the search box, not auto-pick patients[0].
  const [pid,  setPid]  = useState(params?.patientId || '');
  const [patientQuery, setPatientQuery] = useState('');

  // Patients may not be in the store yet (this sheet can open before bootstrap loads
  // them, and the search was unusable when the list was empty) — fetch on mount.
  useEffect(() => { if (patients.length === 0) loadPatients(); }, []);

  const selectedPatient = patients.find((p) => p.id === pid);
  const patientResults = patientQuery.trim()
    ? patients.filter((p) =>
        (p.name || '').toLowerCase().includes(patientQuery.trim().toLowerCase()) ||
        (p.phone || '').includes(patientQuery.trim()))
    : patients;
  const [type, setType] = useState('Consultation');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('');
  const [dur,  setDur]  = useState(20);

  const [freeSlots,  setFreeSlots]  = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [preferredWindow, setPreferredWindow] = useState(null);
  const [showAll, setShowAll] = useState(false);

  // ── Smart input (intent only; deterministic slots + confirm still apply) ──
  const recorder = useAudioRecorder();
  const { transcribe } = useTranscription('general');
  const [smartText, setSmartText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [understood, setUnderstood] = useState('');

  const pickProcedure = (t) => { setType(t); setDur(PROC_DURATION[t] || 30); };

  const applyIntent = (intent) => {
    if (!intent) return;
    const parts = [];
    if (intent.patient) {
      const q = String(intent.patient).toLowerCase();
      const m = patients.find(p => (p.name || '').toLowerCase().includes(q) || q.includes((p.name || '').toLowerCase().split(' ')[0]));
      if (m) { setPid(m.id); parts.push(m.name.split(' ')[0]); }
    }
    if (intent.procedure && PROCEDURES.includes(intent.procedure)) { pickProcedure(intent.procedure); parts.push(intent.procedure); }
    else if (intent.procedure) { setDur(PROC_DURATION[intent.procedure] || 30); parts.push(intent.procedure); }
    if (intent.preferredDate && /^\d{4}-\d{2}-\d{2}$/.test(intent.preferredDate)) { setDate(intent.preferredDate); parts.push(friendlyDate(intent.preferredDate)); }
    if (intent.preferredTime) { setPreferredWindow(intent.preferredTime); parts.push(intent.preferredTime); }
    setUnderstood(parts.join(' · '));
  };

  const runParse = async (text) => {
    const t = (text || '').trim();
    if (!t) return;
    setParsing(true);
    try { applyIntent(await parseScheduleIntent(t)); }
    catch { showToast('Could not read that — set it below'); }
    finally { setParsing(false); }
  };

  const handleSmartMic = async () => {
    if (recording) {
      setRecording(false);
      setParsing(true);
      try {
        const blob = await recorder.stopRecording();
        const { text } = await transcribe(blob);
        if (text) { setSmartText(text); await runParse(text); }
        else { showToast("Couldn't hear — try again"); }
      } catch (e) { showToast(e?.message || 'Mic error'); }
      finally { setParsing(false); }
      return;
    }
    try { await recorder.startRecording(); setRecording(true); }
    catch (e) { showToast(e?.message || 'Microphone unavailable'); }
  };

  // Recompute free slots whenever date or duration changes (deterministic engine).
  useEffect(() => {
    const slots = findFreeSlots(date, visits, clinic, dur);
    setFreeSlots(slots);
    setTime('');
    setSuggestion(slots.length === 0 ? findNextAvailable(date, visits, clinic, dur) : null);
  }, [date, dur]);

  // Auto-pick a slot inside the preferred time window once slots are known.
  useEffect(() => {
    if (!preferredWindow || freeSlots.length === 0) return;
    const hit = freeSlots.find(s => inWindow(s.time, preferredWindow));
    if (hit) setTime(hit.time);
  }, [freeSlots, preferredWindow]);

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
      await addVisit({ patientId: pid, date, startTime: time, durationMinutes: dur, status: 'confirmed', type, purpose: type });
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

      {/* ── Smart input — type or speak a request; it just pre-fills the form ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 50, padding: '0 6px 0 14px', borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border-light)' }}>
          <input
            value={smartText}
            onChange={(e) => setSmartText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runParse(smartText); }}
            placeholder="e.g. RCT for Ramesh, Thursday evening"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
          <button
            onClick={handleSmartMic}
            style={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: recording ? '#C0392B' : 'var(--accent)', color: '#fff' }}
          >
            <Icon name={recording ? 'stop' : 'mic'} size={18} color="#fff" />
          </button>
        </div>
        {parsing ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 6, marginLeft: 4 }}>Reading…</div>
        ) : understood ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, marginLeft: 4 }}>Understood · {understood}</div>
        ) : null}
      </div>

      {/* Patient — searchable picker (the pill list was unsearchable and broke with
          many/zero patients) */}
      <SectionHeader>Patient</SectionHeader>
      {selectedPatient ? (
        <button
          onClick={() => { setPid(''); setPatientQuery(''); }}
          className="card tap"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 18, textAlign: 'left' }}
        >
          <Avatar name={selectedPatient.name} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPatient.name}</div>
            <div className="t-meta">{selectedPatient.phone}</div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)', flexShrink: 0 }}>Change</span>
        </button>
      ) : (
        <div style={{ marginBottom: 18 }}>
          <div className="card" style={{ height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, marginBottom: 8 }}>
            <Icon name="search" size={18} color="var(--text-secondary)" />
            <input
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
              placeholder="Search patient by name or phone"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontFamily: 'inherit' }}
            />
          </div>
          <div className="card" style={{ overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
            {patientResults.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center' }} className="t-meta">
                {patientQuery ? `No patients match "${patientQuery}"` : 'No patients yet'}
              </div>
            ) : patientResults.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { setPid(p.id); setPatientQuery(''); }}
                className="rowtap"
                style={{ width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}
              >
                <Avatar name={p.name} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div className="t-meta">{p.phone}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Procedure */}
      <SectionHeader>Procedure</SectionHeader>
      <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {PROCEDURES.map(t => (
          <SelectPill key={t} label={t} active={type === t} onClick={() => pickProcedure(t)} />
        ))}
      </div>

      {/* Date + duration */}
      <SectionHeader>Date & duration</SectionHeader>
      <div style={{ display: 'flex', gap: 10, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DURATIONS.map(d => (
            <SelectPill key={d} label={d + 'm'} active={dur === d} onClick={() => setDur(d)} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>{type} · suggested {PROC_DURATION[type] || 30} min</div>

      {/* ── Suggested times — a few varied, colour-coded by part of day ── */}
      {freeSlots.length > 0 ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Suggested times · {friendlyDate(date)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {buildSuggestions(freeSlots, preferredWindow).map(slot => {
              const ws = WIN_STYLE[windowOf(slot.time)]; const sel = time === slot.time;
              return (
                <button
                  key={slot.time}
                  onClick={() => setTime(slot.time)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, textAlign: 'left',
                    background: sel ? ws.tint : ws.soft,
                    color: sel ? '#fff' : 'var(--text-primary)',
                    border: sel ? 'none' : '1px solid transparent',
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: sel ? '#fff' : ws.tint, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{slot.label}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: sel ? 'rgba(255,255,255,0.85)' : ws.tint }}>{ws.label}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <button onClick={() => setShowAll(v => !v)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)', marginBottom: showAll ? 10 : 18 }}>
            {showAll ? 'Hide all times' : `Show all ${freeSlots.length} times`}
          </button>

          {showAll && (
            <>
              <div className="noscroll-x" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {freeSlots.map(slot => (
                  <button
                    key={slot.time}
                    onClick={() => setTime(slot.time)}
                    style={{
                      height: 36, padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                      background: time === slot.time ? 'var(--accent)' : '#fff',
                      color: time === slot.time ? 'var(--accent-ink)' : 'var(--text-primary)',
                      border: time === slot.time ? 'none' : '1px solid var(--border)', flexShrink: 0,
                    }}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Or a specific time</div>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ background: 'rgba(255,149,0,0.08)', border: '1px solid rgba(255,149,0,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Icon name="alert" size={16} color="var(--orange)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--orange)' }}>No free slots on {friendlyDate(date)}</div>
            {suggestion ? (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Next available: <strong>{friendlyDate(suggestion.date)}</strong> ({suggestion.daysAhead} day{suggestion.daysAhead > 1 ? 's' : ''} away) · {suggestion.slots.length} open
                </div>
                <button onClick={acceptSuggestion} style={{ marginTop: 8, height: 32, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>
                  Jump to {friendlyDate(suggestion.date)}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>No availability in the next 14 days.</div>
            )}
          </div>
        </div>
      )}

      <PrimaryButton onClick={handleSchedule} style={{ opacity: canSchedule ? 1 : 0.4 }}>
        {saving ? 'Scheduling…' : `Schedule${time ? ` · ${freeSlots.find(s => s.time === time)?.label || time}` : ''}`}
      </PrimaryButton>
    </div>
  );
}
