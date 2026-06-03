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
import { STAFF, CLINIC, minutesAgo, waitLabel } from '@/lib/data/queue';
import { formatCurrency, formatTime, parseDate, hasComplications, MONTHS, DAYS_FULL } from '@/lib/data/utils';

function QueueStatChip({ icon, value, label, color }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={16} stroke={2} color={color || 'var(--text-secondary)'} />
        <span className="tnum" style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function TokenBadge({ n, tone }) {
  const c = tone === 'amber' ? { bg: 'rgba(255,159,10,0.16)', fg: '#C77700' } : tone === 'teal' ? { bg: 'rgba(50,173,230,0.16)', fg: '#1B86B8' } : { bg: 'rgba(60,60,67,0.08)', fg: 'var(--text-secondary)' };
  return (
    <div style={{ width: 38, height: 38, borderRadius: 11, background: c.bg, color: c.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
      <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em' }}>TOK</span>
      <span className="tnum" style={{ fontSize: 16, fontWeight: 700 }}>{n}</span>
    </div>
  );
}

function ReceptionScreen() {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const patients = usePatientStore((s) => s.patients);
  const queue = useQueueStore((s) => s.queue);
  const checkoutsToday = useQueueStore((s) => s.checkoutsToday);
  const callIn = useQueueStore((s) => s.callIn);

  const q = queue;
  const pById = id => patients.find(p => p.id === id);
  const waiting = q.filter(e => e.status === 'waiting');
  const inConsult = q.filter(e => e.status === 'in_consultation');
  const ready = q.filter(e => e.status === 'ready_for_checkout');

  const d = parseDate(TODAY);
  const dateLabel = `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()}`;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ padding: '56px 20px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>Front desk · {CLINIC.name}</div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1, marginTop: 1 }}>Today's Queue</div>
            <div className="t-meta" style={{ marginTop: 2 }}>{dateLabel}</div>
          </div>
          <button onClick={() => openSheet('account')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(50,173,230,0.16)', color: '#1B86B8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{STAFF.receptionist.initials}</button>
        </div>
        <div style={{ display: 'flex', padding: '4px 20px 14px', gap: 8 }}>
          <QueueStatChip icon="clock" value={waiting.length} label="waiting" />
          <QueueStatChip icon="stethoscope" value={inConsult.length} label="in consult" color={inConsult.length ? '#C77700' : undefined} />
          <QueueStatChip icon="card" value={ready.length} label="to checkout" color={ready.length ? '#1B86B8' : undefined} />
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, padding: '16px 20px 24px' }}>
        {/* primary CTA */}
        <button onClick={() => openSheet('checkin')} className="btn-dark tap" style={{ width: '100%', height: 56, borderRadius: 16, gap: 9, marginBottom: 22 }}>
          <Icon name="personPlus" size={22} color="var(--accent-ink)" /> Check in a patient
        </button>

        {/* ready for checkout */}
        {ready.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SectionHeader>Ready for checkout · {ready.length}</SectionHeader>
            {ready.map(e => {
              const p = pById(e.patientId); if (!p) return null;
              return (
                <button key={e.id} onClick={() => router.push('/checkout/' + e.id)} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(50,173,230,0.07)', border: '1px solid rgba(50,173,230,0.28)', borderRadius: 16, padding: '14px 16px', textAlign: 'left', marginBottom: 10 }}>
                  <TokenBadge n={e.tokenNumber} tone="teal" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 13.5, color: '#1B86B8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.consult ? `${e.consult.procedure}${e.consult.tooth ? ' · Tooth ' + e.consult.tooth : ''} · ${formatCurrency(e.consult.estimatedCost)}` : 'Consultation done'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#1B86B8', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>Checkout <Icon name="chevRight" size={16} color="#1B86B8" /></div>
                </button>
              );
            })}
          </div>
        )}

        {/* in consultation */}
        {inConsult.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SectionHeader>In consultation</SectionHeader>
            {inConsult.map(e => {
              const p = pById(e.patientId); if (!p) return null;
              return (
                <div key={e.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderLeft: '3px solid var(--amber)' }}>
                  <TokenBadge n={e.tokenNumber} tone="amber" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                    <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>With {STAFF.doctor.name} · since {formatTime(e.calledInAt).label}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#C77700' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF9F0A', animation: 'donePulse 1.4s infinite' }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Live</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* waiting */}
        <SectionHeader>Waiting · {waiting.length}</SectionHeader>
        {waiting.length === 0 ? (
          <div className="card"><EmptyState icon="queue" title="Queue is clear" hint="Check in a patient to add them" /></div>
        ) : (
          <>
            {inConsult.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(255,159,10,0.10)', borderRadius: 12, padding: '11px 14px', marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF9F0A', flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#C77700', lineHeight: 1.35 }}>Doctor is in consultation. Call in the next patient when the chair is free.</span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {waiting.map((e, idx) => {
                const p = pById(e.patientId); if (!p) return null;
                const free = inConsult.length === 0;
                const isNext = idx === 0;
                return (
                  <button key={e.id} onClick={() => free ? callIn(e.id) : openSheet('queueActions', { id: e.id })} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', borderRadius: 16, padding: '14px', textAlign: 'left', boxShadow: 'var(--elevation-1)', border: e.priority === 'urgent' ? '1px solid rgba(255,59,48,0.30)' : 'none' }}>
                    <TokenBadge n={e.tokenNumber} tone={e.priority === 'urgent' ? 'amber' : 'neutral'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 16.5, fontWeight: 600 }}>{p.name}</span>
                        {e.priority === 'urgent' && <Chip label="Urgent" tone="red" />}
                        {hasComplications(p) && <span title="Medical flag" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{e.chiefComplaint}</div>
                      <div className="tnum" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, color: minutesAgo(e.checkedInAt) > 25 ? 'var(--orange)' : 'var(--text-tertiary)' }}>Waiting {waitLabel(e.checkedInAt)}{!free && isNext ? ' · next up' : ''}</div>
                    </div>
                    {free ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'var(--accent)', color: 'var(--accent-ink)', height: 38, padding: '0 14px 0 16px', borderRadius: 20, fontSize: 15, fontWeight: 700, flexShrink: 0 }}>Call in<Icon name="chevRight" size={16} color="var(--accent-ink)" /></span>
                    ) : (
                      <span onClick={(ev) => { ev.stopPropagation(); openSheet('queueActions', { id: e.id }); }} style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', flexShrink: 0 }}><Icon name="dots" size={20} /></span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* done today */}
        {checkoutsToday.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <SectionHeader>Checked out today · {checkoutsToday.length}</SectionHeader>
            <div className="card" style={{ overflow: 'hidden' }}>
              {checkoutsToday.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                  <Icon name="checkCircle" size={20} color="var(--green)" />
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{c.patientName}</div><div className="t-meta">{c.procedure}</div></div>
                  <span className="tnum" style={{ fontSize: 14, fontWeight: 600, color: '#1E8E3E' }}>{formatCurrency(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReceptionPage() {
  return <ReceptionScreen />;
}
