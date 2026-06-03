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
import { formatTime, parseDate, MONTHS, DAYS } from '@/lib/data/utils';

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
  const proc = procedures.find(x => x.id === v.procedureId);
  const col = getProcedureColor(proc ? proc.type : 'Other');
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
      {h > 50 && <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>{proc ? proc.type : 'Consult'}</div>}
      {h > 66 && proc && proc.tooth && <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Tooth {proc.tooth}</div>}
    </div>
  );
}

function WeekView({ visits, patients, procedures, openSheet }) {
  const days = weekDays(TODAY);
  const pById = id => patients.find(p => p.id === id);
  const procById = id => procedures.find(p => p.id === id);
  const dot = { confirmed: 'var(--blue)', arrived: 'var(--orange)', done: 'var(--green)', no_show: 'var(--red)' };

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
                <div style={{ fontSize: 14, color: 'var(--text-tertiary)', paddingBottom: 4 }}>No appointments</div>
              ) : (
                <div>
                  {dayVisits.map((v, i) => {
                    const p = pById(v.patientId); const proc = procById(v.procedureId); const t = formatTime(v.startTime);
                    return (
                      <button key={v.id} onClick={() => openSheet('apptPeek', { id: v.id })} className="rowtap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left', opacity: isPast ? 0.62 : 1 }}>
                        <div style={{ width: 58, flexShrink: 0 }}>
                          <div className="tnum" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.05 }}>{t.h12}:{String(t.m).padStart(2, '0')}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontWeight: 600 }}>{t.ampm}</div>
                        </div>
                        <div style={{ width: 3, alignSelf: 'stretch', minHeight: 30, borderRadius: 2, background: getProcedureColor(proc ? proc.type : 'Other').border, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 600 }}>{p ? p.name : 'Patient'}</div>
                          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proc ? `${proc.type}${proc.tooth ? ' · Tooth ' + proc.tooth : ''}` : 'Consultation'}</div>
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

function DayView({ visits, patients, procedures, openSheet }) {
  const iso = TODAY;
  const dayVisits = visits.filter(v => v.date === iso).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const colW = 402 - TIME_COL - 16;
  const slots = (GRID_END - GRID_START) * 2;
  const nowFrac = (() => { const n = new Date(); const mins = n.getHours() * 60 + n.getMinutes(); if (mins < GRID_START * 60 || mins > GRID_END * 60) return null; return (mins - GRID_START * 60) / 30 * SLOT_PX; })();
  return (
    <div className="scroll" style={{ flex: 1, position: 'relative' }}>
      <div style={{ position: 'relative', height: slots * SLOT_PX, marginLeft: TIME_COL, marginRight: 8 }}>
        {Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', top: i * HOUR_PX, left: -TIME_COL, right: 0 }}>
            <div style={{ position: 'absolute', top: -7, left: 0, width: TIME_COL - 6, textAlign: 'right', fontSize: 10, color: 'var(--text-tertiary)' }} className="tnum">{formatTime(`${GRID_START + i}:00`).label.replace(':00', '')}</div>
            <div style={{ position: 'absolute', top: 0, left: TIME_COL, right: 0, borderTop: '1px solid rgba(0,0,0,0.10)' }} />
            <div style={{ position: 'absolute', top: SLOT_PX, left: TIME_COL, right: 0, borderTop: '1px solid rgba(0,0,0,0.05)' }} />
          </div>
        ))}
        <div style={{ position: 'absolute', top: 0, left: 0, width: colW, height: '100%' }}>
          {dayVisits.map(v => <ApptBlock key={v.id} v={v} patients={patients} procedures={procedures} colW={colW} onDragMove={() => {}} onOpen={(vv) => openSheet('apptPeek', { id: vv.id })} dragging={false} />)}
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

function MonthView({ visits, procedures, setScheduleView }) {
  const base = parseDate(TODAY);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setDate(1 - startDow + i); return d; });
  return (
    <div className="scroll" style={{ flex: 1, padding: '8px 12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: 64, gap: 2 }}>
        {cells.map((d, i) => {
          const iso = toISO(d); const inMonth = d.getMonth() === base.getMonth(); const isToday = iso === TODAY;
          const dayV = visits.filter(v => v.date === iso);
          return (
            <button key={i} onClick={() => setScheduleView('Day')} style={{ borderRadius: 8, padding: 4, textAlign: 'left', background: 'transparent', opacity: inMonth ? 1 : 0.32, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? 'var(--accent)' : 'transparent' }}>
                <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: isToday ? 'var(--accent-ink)' : 'var(--text-primary)' }}>{d.getDate()}</span>
              </div>
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {dayV.slice(0, 3).map(v => { const proc = procedures.find(x => x.id === v.procedureId); return <div key={v.id} style={{ width: 5, height: 5, borderRadius: '50%', background: getProcedureColor(proc ? proc.type : 'Other').dot }} />; })}
                {dayV.length > 3 && <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>+{dayV.length - 3}</span>}
              </div>
            </button>
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
  const moveVisit = useVisitStore((s) => s.moveVisit);
  const procedures = useClinicalStore((s) => s.procedures);

  const view = scheduleView;
  const hasAny = visits.length > 0;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ padding: '58px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="t-page-title">Schedule</span>
          <button onClick={() => openSheet('newVisit', {})} style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="plus" size={26} stroke={2.4} /></button>
        </div>
        <div style={{ padding: '0 20px 12px' }}>
          <Segmented options={['Day', 'Week', 'Month']} value={view} onChange={setScheduleView} />
        </div>
      </div>
      {!hasAny ? <EmptyState title="No appointments" hint="Tap + to schedule" /> :
        view === 'Week' ? <WeekView visits={visits} patients={patients} procedures={procedures} openSheet={openSheet} /> :
        view === 'Day' ? <DayView visits={visits} patients={patients} procedures={procedures} openSheet={openSheet} /> :
        <MonthView visits={visits} procedures={procedures} setScheduleView={setScheduleView} />}
    </div>
  );
}

export default function SchedulePage() {
  return <ScheduleScreen />;
}
