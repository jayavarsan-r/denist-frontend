'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { SectionHeader, Chip, StatusChip, Avatar, EmptyState, SelectPill, Segmented } from '@/components/ui';
import { TODAY } from '@/lib/data/patients';
import { getProcedureColor } from '@/lib/data/procedures';
import { formatTime, parseDate, MONTHS, DAYS, formatDate } from '@/lib/data/utils';

/* DentWay — Schedule (week / day / month) */

const GRID_START = 7;   // 7 AM
const GRID_END = 20;    // 8 PM
const SLOT_PX = 40;     // per 30 min
const HOUR_PX = SLOT_PX * 2;
const TIME_COL = 42;

function timeToTop(t) {
  const [h, m] = t.split(':').map(Number);
  return (h - GRID_START) * HOUR_PX + (m / 30) * SLOT_PX;
}
function topToTime(top) {
  const slot = Math.max(0, Math.round(top / SLOT_PX));
  const mins = GRID_START * 60 + slot * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
function weekDays(dateStr) {
  const d = parseDate(dateStr);
  const dow = (d.getDay() + 6) % 7; // Monday=0
  const mon = new Date(d); mon.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function ApptBlock({ v, patients, procedures, colW, onDragMove, onOpen, dragging }) {
  const p = patients.find(x => x.id === v.patientId);
  const purpose = v.purpose || 'Consultation';
  const col = getProcedureColor(purpose);
  const top = timeToTop(v.startTime);
  const h = (v.durationMinutes / 30) * SLOT_PX;
  return (
    <div
      onPointerDown={(e) => onDragMove(e, v)}
      onClick={(e) => onOpen(v)}
      style={{
        position: 'absolute', top, left: 3, width: colW - 6, height: h - 3,
        background: col.bg, borderLeft: `3px solid ${col.border}`, borderRadius: 8,
        padding: '4px 6px', overflow: 'hidden', cursor: 'grab', touchAction: 'none',
        boxShadow: dragging ? 'var(--elevation-2)' : 'none', transform: dragging ? 'scale(1.03)' : 'none',
        opacity: dragging ? 0.85 : 1, zIndex: dragging ? 50 : 1, transition: dragging ? 'none' : 'box-shadow .15s',
      }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{p ? p.name.split(' ')[0] : 'Patient'}</div>
      {h > 50 && <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>{purpose}</div>}
      {h > 66 && v.tooth && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Tooth {v.tooth}</div>}
    </div>
  );
}

function WeekView({ visits, patients, procedures, goToPatient }) {
  const days = weekDays(TODAY);
  const pById = id => patients.find(p => p.id === id);
  const procById = id => procedures.find(p => p.id === id);
  const dot = { confirmed: 'var(--blue)', arrived: 'var(--yellow)', done: 'var(--green)', no_show: 'var(--red)', scheduled: 'var(--blue)', completed: 'var(--green)' };

  const todayRef = React.useRef(null);
  React.useEffect(() => { if (todayRef.current) todayRef.current.parentNode.scrollTop = Math.max(0, todayRef.current.offsetTop - 8); }, []);

  return (
    <div className="scroll" style={{ flex: 1, background: 'var(--surface)' }}>
      <div style={{ padding: '4px 22px 28px' }}>
        {days.map((d, di) => {
          const iso = toISO(d);
          const isToday = iso === TODAY;
          const isPast = iso < TODAY;
          const dayVisits = visits.filter(v => v.date === iso).sort((a, b) => a.startTime.localeCompare(b.startTime));
          return (
            <div key={di} ref={isToday ? todayRef : null} style={{ paddingTop: di ? 22 : 14 }}>
              {/* day header */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, opacity: isPast && dayVisits.length === 0 ? 0.5 : 1 }}>
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}>{isToday ? 'Today' : DAYS[d.getDay()]}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text-tertiary)' }}>{d.getDate()} {MONTHS[d.getMonth()]}</span>
                {dayVisits.length > 0 && <span className="tnum" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600 }}>{dayVisits.length}</span>}
              </div>
              {dayVisits.length === 0 ? (
                <div style={{ fontSize: 13.5, color: 'var(--text-tertiary)', paddingBottom: 4 }}>Nothing planned</div>
              ) : (
                <div>
                  {dayVisits.map((v, i) => {
                    const p = pById(v.patientId); const purpose = v.purpose || 'Consultation'; const t = formatTime(v.startTime);
                    return (
                      <button key={v.id} onClick={() => goToPatient(v.patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left', opacity: isPast ? 0.62 : 1 }}>
                        <div style={{ width: 58, flexShrink: 0 }}>
                          <div className="tnum" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.05 }}>{t.h12}:{String(t.m).padStart(2, '0')}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600 }}>{t.ampm}</div>
                        </div>
                        <div style={{ width: 3, alignSelf: 'stretch', minHeight: 30, borderRadius: 2, background: getProcedureColor(purpose).border, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 600 }}>{p ? p.name : 'Patient'}</div>
                          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{purpose}{v.tooth ? ' · Tooth ' + v.tooth : ''}</div>
                        </div>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot[v.status] || 'var(--text-tertiary)', flexShrink: 0 }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ visits, patients, procedures, goToPatient, date, setDate }) {
  const iso = date || TODAY;
  const isToday = iso === TODAY;
  const dayVisits = visits.filter(v => v.date === iso).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const colW = 402 - TIME_COL - 16;
  const slots = (GRID_END - GRID_START) * 2;
  const nowFrac = isToday ? (() => { const n = new Date(); const mins = n.getHours() * 60 + n.getMinutes(); if (mins < GRID_START * 60 || mins > GRID_END * 60) return null; return (mins - GRID_START * 60) / 30 * SLOT_PX; })() : null;
  const shift = (n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); setDate && setDate(toISO(d)); };
  const d = parseDate(iso);
  return (
    <div className="scroll" style={{ flex: 1, position: 'relative' }}>
      {/* day navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 10px', borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => shift(-1)} style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(60,60,67,0.06)' }}><Icon name="chevLeft" size={18} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}>{isToday ? 'Today' : DAYS[d.getDay()]}{dayVisits.length ? ` · ${dayVisits.length}` : ''}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>{d.getDate()} {MONTHS[d.getMonth()]} {d.getFullYear()}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isToday && <button onClick={() => setDate(TODAY)} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--blue)', padding: '0 4px' }}>Today</button>}
          <button onClick={() => shift(1)} style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(60,60,67,0.06)' }}><Icon name="chevRight" size={18} /></button>
        </div>
      </div>
      <div style={{ position: 'relative', height: slots * SLOT_PX, marginLeft: TIME_COL, marginRight: 8, marginTop: 8 }}>
        {Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', top: i * HOUR_PX, left: -TIME_COL, right: 0 }}>
            <div style={{ position: 'absolute', top: -7, left: 0, width: TIME_COL - 6, textAlign: 'right', fontSize: 10, color: 'var(--text-tertiary)' }} className="tnum">{formatTime(`${GRID_START + i}:00`).label.replace(':00', '')}</div>
            <div style={{ position: 'absolute', top: 0, left: TIME_COL, right: 0, borderTop: '1px solid rgba(0,0,0,0.10)' }} />
            <div style={{ position: 'absolute', top: SLOT_PX, left: TIME_COL, right: 0, borderTop: '1px solid rgba(0,0,0,0.05)' }} />
          </div>
        ))}
        <div style={{ position: 'absolute', top: 0, left: 0, width: colW, height: '100%' }}>
          {dayVisits.map(v => <ApptBlock key={v.id} v={v} patients={patients} procedures={procedures} colW={colW} onDragMove={() => {}} onOpen={(vv) => goToPatient(vv.patientId)} dragging={false} />)}
        </div>
        {nowFrac != null && (
          <div style={{ position: 'absolute', top: nowFrac, left: 0, width: colW, zIndex: 30 }}>
            <div style={{ position: 'relative', borderTop: '1.5px solid var(--red)' }}><div style={{ position: 'absolute', left: -4, top: -4.5, width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function MonthView({ visits, patients, goToPatient }) {
  const [base, setBase] = React.useState(() => parseDate(TODAY));   // month being shown
  const [selected, setSelected] = React.useState(TODAY);           // selected day
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const startDow = first.getDay();                                  // Sun = 0 (matches Sun–Sat header)
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(1 - startDow + i); return d; });
  const shiftMonth = (n) => setBase(new Date(base.getFullYear(), base.getMonth() + n, 1));
  const pById = id => patients.find(p => p.id === id);
  const selVisits = visits.filter(v => v.date === selected).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const selD = parseDate(selected);

  return (
    <div className="scroll" style={{ flex: 1 }}>
      {/* month header + navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 6px' }}>
        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{MONTHS_FULL[base.getMonth()]} {base.getFullYear()}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => shiftMonth(-1)} style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(60,60,67,0.06)' }}><Icon name="chevLeft" size={17} /></button>
          <button onClick={() => { setBase(parseDate(TODAY)); setSelected(TODAY); }} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--blue)', padding: '0 4px' }}>Today</button>
          <button onClick={() => shiftMonth(1)} style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(60,60,67,0.06)' }}><Icon name="chevRight" size={17} /></button>
        </div>
      </div>

      {/* weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 8px' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* month grid — date + colour event bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: 56, gap: 2, padding: '0 8px' }}>
        {cells.map((d, i) => {
          const iso = toISO(d); const inMonth = d.getMonth() === base.getMonth(); const isToday = iso === TODAY; const isSel = iso === selected;
          const dayV = visits.filter(v => v.date === iso);
          return (
            <button key={i} onClick={() => setSelected(iso)} style={{ borderRadius: 12, padding: '5px 2px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: isSel ? 'rgba(60,60,67,0.06)' : 'transparent', opacity: inMonth ? 1 : 0.3 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isSel ? '#1C1C1E' : isToday ? 'var(--accent)' : 'transparent' }}>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: isSel ? '#fff' : isToday ? 'var(--accent-ink)' : 'var(--text-primary)' }}>{d.getDate()}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', alignItems: 'center' }}>
                {dayV.slice(0, 3).map(v => <div key={v.id} style={{ width: '64%', height: 3, borderRadius: 2, background: getProcedureColor(v.purpose || 'Other').border }} />)}
              </div>
            </button>
          );
        })}
      </div>

      {/* selected-day detail list */}
      <div style={{ padding: '16px 16px 28px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
          {DAYS[selD.getDay()]} {selD.getDate()} {MONTHS[selD.getMonth()]}{selected === TODAY ? ' · Today' : ''}
        </div>
        {selVisits.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14, padding: '18px 0' }}>Nothing planned</div>
        ) : selVisits.map((v, i) => {
          const p = pById(v.patientId); const col = getProcedureColor(v.purpose || 'Other'); const t = formatTime(v.startTime);
          return (
            <button key={v.id} onClick={() => goToPatient(v.patientId)} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
              <div style={{ width: 3, alignSelf: 'stretch', minHeight: 36, borderRadius: 2, background: col.border, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 600 }}>{p ? p.name : 'Patient'}</div>
                <div className="t-meta">{v.purpose || 'Consultation'}{v.tooth ? ' · Tooth ' + v.tooth : ''}</div>
              </div>
              <span className="tnum" style={{ fontSize: 13.5, color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_COLOR = { confirmed: 'var(--blue)', arrived: 'var(--yellow)', done: 'var(--green)', completed: 'var(--green)', no_show: 'var(--red)', scheduled: 'var(--blue)' };
const STATUS_LABEL = { confirmed: 'Confirmed', arrived: 'Arrived', done: 'Done', completed: 'Completed', no_show: 'No-show', scheduled: 'Scheduled' };

function HistoryView({ visits, clinicalVisits, patients, procedures, goToPatient }) {
  const pById = (id) => patients.find(p => p.id === id);

  // Combine appointments (all) and clinical consultation records
  const allEntries = useMemo(() => {
    const appts = visits.map(v => ({ ...v, _kind: 'appointment', _sortDate: v.date }));
    const consults = clinicalVisits.map(cv => ({ ...cv, _kind: 'consultation', _sortDate: cv.date }));
    return [...appts, ...consults].sort((a, b) => b._sortDate.localeCompare(a._sortDate) || (b.startTime || '').localeCompare(a.startTime || ''));
  }, [visits, clinicalVisits]);

  // Group by date
  const byDate = useMemo(() => {
    const map = {};
    for (const e of allEntries) {
      const d = e._sortDate || 'Unknown';
      if (!map[d]) map[d] = [];
      map[d].push(e);
    }
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [allEntries]);

  if (allEntries.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-tertiary)' }}>
        <Icon name="calendar" size={44} stroke={1.5} />
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-secondary)' }}>No history yet</div>
        <div style={{ fontSize: 14 }}>Appointments and consultations will appear here</div>
      </div>
    );
  }

  return (
    <div className="scroll" style={{ flex: 1, background: 'var(--surface)' }}>
      <div style={{ padding: '8px 20px 40px' }}>
        {byDate.map(([date, entries]) => {
          const isPast = date < TODAY;
          const isToday = date === TODAY;
          return (
            <div key={date} style={{ marginBottom: 24 }}>
              {/* date header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingTop: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-secondary)', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  {isToday ? 'Today' : formatDate(date)}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-light)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{entries.length}</span>
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                {entries.map((e, i) => {
                  const p = pById(e.patientId);
                  const proc = e.procedureId && procedures.find(x => x.id === e.procedureId);
                  const isConsult = e._kind === 'consultation';
                  const title = isConsult ? (e.procedureName || 'Consultation') : (e.purpose || proc?.type || 'Appointment');
                  const sub = isConsult
                    ? [e.toothNumber && `Tooth ${e.toothNumber}`, e.notes && e.notes.slice(0, 60) + (e.notes.length > 60 ? '…' : '')].filter(Boolean).join(' · ')
                    : [proc ? `${proc.type}${proc.tooth ? ' · Tooth ' + proc.tooth : ''}` : null, e.startTime && formatTime(e.startTime).label].filter(Boolean).join(' · ');

                  return (
                    <button
                      key={e.id + e._kind}
                      onClick={() => goToPatient(e.patientId)}
                      className="rowtap"
                      style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left', opacity: isPast && !isToday ? 0.85 : 1 }}
                    >
                      {/* kind badge */}
                      <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: isConsult ? 'rgba(59,130,246,0.1)' : 'rgba(34,197,94,0.1)', marginTop: 2 }}>
                        <Icon name={isConsult ? 'stethoscope' : 'calendar'} size={18} color={isConsult ? 'var(--blue)' : 'var(--green)'} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{p ? p.name : 'Unknown Patient'}</div>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: STATUS_COLOR[e.status] || 'var(--text-tertiary)', flexShrink: 0 }}>
                            {STATUS_LABEL[e.status] || e.status || ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: isConsult ? 'var(--blue)' : 'var(--green)', marginTop: 2 }}>{title}</div>
                        {sub && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
                        {isConsult && e.medications && e.medications.length > 0 && (
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
                            <Icon name="pill" size={11} style={{ marginRight: 4 }} />
                            {(typeof e.medications === 'string' ? (() => { try { return JSON.parse(e.medications); } catch { return []; } })() : e.medications).map(m => m.name || m).join(', ')}
                          </div>
                        )}
                      </div>
                      <Icon name="chevRight" size={16} color="var(--text-tertiary)" style={{ marginTop: 10, flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleScreen() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const scheduleView = useAppStore((s) => s.scheduleView);
  const setScheduleView = useAppStore((s) => s.setScheduleView);
  const patients = usePatientStore((s) => s.patients);
  const visits = useVisitStore((s) => s.visits);
  const clinicalVisits = useVisitStore((s) => s.clinicalVisits);
  const loading = useVisitStore((s) => s.loading);
  const loadAppointments = useVisitStore((s) => s.loadAppointments);
  const loadClinicalVisits = useVisitStore((s) => s.loadClinicalVisits);
  const procedures = useClinicalStore((s) => s.procedures);
  const [dayDate, setDayDate] = useState(TODAY);

  useEffect(() => {
    loadAppointments();
    loadClinicalVisits();
  }, []);

  const view = scheduleView;
  const isHistory = view === 'History';
  // Tapping any patient row opens their full detail page (no peek drawer).
  const goToPatient = (patientId) => { if (patientId) router.push('/patients/' + patientId); };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ padding: '58px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="t-page-title">Schedule</span>
          {!isHistory && (
            <button onClick={() => openSheet('newVisit', {})} style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="plus" size={26} stroke={2.4} /></button>
          )}
        </div>
        <div style={{ padding: '0 20px 12px' }}>
          <Segmented options={['Day', 'Week', 'Month', 'History']} value={view} onChange={setScheduleView} />
        </div>
      </div>

      {isHistory ? (
        <HistoryView visits={visits} clinicalVisits={clinicalVisits} patients={patients} procedures={procedures} goToPatient={goToPatient} />
      ) : loading && visits.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading appointments…</span>
          </div>
        </div>
      ) : view === 'Month' ? (
        // Every view shows its own structure (grid / week list / day timeline) even when empty.
        <MonthView visits={visits} patients={patients} goToPatient={goToPatient} />
      ) : view === 'Week' ? (
        <WeekView visits={visits} patients={patients} procedures={procedures} goToPatient={goToPatient} />
      ) : (
        <DayView visits={visits} patients={patients} procedures={procedures} goToPatient={goToPatient} date={dayDate} setDate={setDayDate} />
      )}
    </div>
  );
}

export default function SchedulePage() {
  return <ScheduleScreen />;
}
