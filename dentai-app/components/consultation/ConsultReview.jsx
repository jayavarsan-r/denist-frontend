'use client';
import React from 'react';
import Icon from '@/components/icons';
import { SectionHeader, PrimaryButton } from '@/components/ui';
import { formatDate } from '@/lib/data/utils';

/**
 * ConsultReview — the editable consult review.
 *
 * Voice-first but never voice-only: every field is a real input the doctor can
 * type into, so a wrong AI guess or a failed transcription is never a dead end.
 * Medicines start empty and are only what was extracted or hand-added — the app
 * never fabricates a prescription. All edits flow up via the callbacks; state
 * lives in useConsultStore (keyed by queue-entry id) so nothing is lost on swap.
 */

const FIELD_INPUT = {
  width: 200, textAlign: 'right', fontSize: 15, fontWeight: 600,
  color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none',
};

function FieldRow({ label, children, first }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '8px 14px', borderTop: first ? 'none' : '1px solid var(--border-light)', gap: 10 }}>
      <span className="t-meta" style={{ flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

function TextField({ label, first, value, onChange, placeholder, type = 'text', prefix }) {
  return (
    <FieldRow label={label} first={first}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
        {prefix && <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>{prefix}</span>}
        <input
          type={type}
          inputMode={type === 'number' ? 'numeric' : undefined}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(type === 'number' ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
          style={FIELD_INPUT}
        />
        <Icon name="pencil" size={13} color="var(--text-tertiary)" />
      </span>
    </FieldRow>
  );
}

function MealSlots({ slots = {}, onToggle }) {
  const cells = [['B', 'breakfast'], ['L', 'lunch'], ['D', 'dinner']];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cells.map(([k, key]) => {
        const on = !!slots[key];
        return (
          <button key={k} onClick={() => onToggle(key, !on)} style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: on ? 'var(--accent)' : 'rgba(60,60,67,0.06)', color: on ? 'var(--accent-ink)' : 'var(--text-tertiary)' }}>{k}</button>
        );
      })}
    </div>
  );
}

export default function ConsultReview({
  ex,
  onEditField,
  onAddMedicine,
  onEditMedicine,
  onRemoveMedicine,
  onFixByVoice,
  fixPhase = 'idle',
  fixSeconds = 0,
  onRerecord,
  onComplete,
  completing = false,
  completeLabel = 'Complete consult',
  error,
}) {
  if (!ex) return null;
  const meds = ex.medicines || [];
  const teethLabel = (ex.teeth && ex.teeth.length) ? ex.teeth.join(', ') : (ex.tooth != null ? String(ex.tooth) : '');

  return (
    <div style={{ padding: '4px 20px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Here's what I understood</span>
        <button onClick={onRerecord} style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 600 }}>Re-record</button>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,59,48,0.08)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--red)' }}>{error}</div>
      )}

      {/* Fix by voice — consistent with the rest of the voice UI */}
      <button
        onClick={onFixByVoice}
        disabled={fixPhase === 'processing'}
        style={{
          width: '100%', marginBottom: 12, borderRadius: 14, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          background: fixPhase === 'recording' ? 'var(--accent)' : 'rgba(60,60,67,0.06)',
          color: fixPhase === 'recording' ? 'var(--accent-ink)' : 'var(--text-primary)',
          border: fixPhase === 'recording' ? 'none' : '1px solid var(--border)',
        }}
      >
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: fixPhase === 'recording' ? 'rgba(255,255,255,0.2)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {fixPhase === 'processing'
            ? <div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin .7s linear infinite' }} />
            : <Icon name="mic" size={16} color={fixPhase === 'recording' ? '#fff' : 'var(--accent-ink)'} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {fixPhase === 'recording' ? 'Tap to apply correction' : fixPhase === 'processing' ? 'Applying…' : 'Fix by voice'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {fixPhase === 'recording' ? `${fixSeconds}s · speak the change` : 'Say just the change — "3 sittings, ₹4500"'}
          </div>
        </div>
      </button>

      {/* Core fields — all editable */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 14 }}>
        <TextField label="Diagnosis" first value={ex.diagnosis} placeholder="—" onChange={(v) => onEditField('diagnosis', v)} />
        <TextField label="Procedure" value={ex.procedure} placeholder="—" onChange={(v) => onEditField('procedure', v)} />
        <TextField label="Tooth / teeth" value={teethLabel} placeholder="—" onChange={(v) => onEditField('teeth', v.split(',').map((t) => t.trim()).filter(Boolean))} />
        {ex.isContinuation && (
          <FieldRow label="Sitting">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" inputMode="numeric" value={ex.sittingNumber ?? ''} onChange={(e) => onEditField('sittingNumber', e.target.value.replace(/[^0-9]/g, ''))} style={{ ...FIELD_INPUT, width: 36 }} />
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>of</span>
              <input type="number" inputMode="numeric" value={ex.totalSittings ?? ''} onChange={(e) => onEditField('totalSittings', e.target.value.replace(/[^0-9]/g, ''))} style={{ ...FIELD_INPUT, width: 36 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'rgba(35,181,57,0.12)', borderRadius: 99, padding: '2px 7px' }}>continuing</span>
            </span>
          </FieldRow>
        )}
        {!ex.isContinuation && (
          <TextField label="Sittings" value={ex.totalSittings} type="number" placeholder="1" onChange={(v) => onEditField('totalSittings', v)} />
        )}
        <TextField label="Est. cost" value={ex.estimatedCost} type="number" prefix="₹" placeholder="0" onChange={(v) => onEditField('estimatedCost', v)} />
        <TextField label="Next visit" value={/^\d{4}-\d{2}-\d{2}/.test(ex.followUp || '') ? formatDate(ex.followUp) : ex.followUp} placeholder="—" onChange={(v) => onEditField('followUp', v)} />
      </div>

      {/* Prescription — empty unless prescribed; editable; never fabricated */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 2px 7px' }}>
        <SectionHeader>Prescription · {meds.length}</SectionHeader>
        <button onClick={onAddMedicine} style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 700 }}>+ Add medicine</button>
      </div>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
        {meds.length === 0 ? (
          <div style={{ padding: '16px 14px', fontSize: 13.5, color: 'var(--text-tertiary)', textAlign: 'center' }}>
            No medicines. The app never adds one you didn't prescribe.
          </div>
        ) : meds.map((m, i) => (
          <div key={i} style={{ padding: '10px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input value={m.name || ''} placeholder="Medicine" onChange={(e) => onEditMedicine(i, { name: e.target.value })} style={{ flex: 1, fontSize: 15, fontWeight: 600, border: 'none', outline: 'none', background: 'transparent' }} />
              <input value={m.dose || ''} placeholder="dose" onChange={(e) => onEditMedicine(i, { dose: e.target.value })} style={{ width: 64, fontSize: 13, color: 'var(--text-secondary)', border: 'none', outline: 'none', background: 'transparent', textAlign: 'right' }} />
              <button onClick={() => onRemoveMedicine(i)} style={{ flexShrink: 0, padding: 4 }}><Icon name="x" size={15} color="var(--text-tertiary)" /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                <input value={m.frequency || ''} placeholder="freq" onChange={(e) => onEditMedicine(i, { frequency: e.target.value })} style={{ width: 70, fontSize: 12.5, color: 'var(--text-secondary)', border: 'none', outline: 'none', background: 'transparent' }} />
                <input value={m.duration || ''} placeholder="duration" onChange={(e) => onEditMedicine(i, { duration: e.target.value })} style={{ width: 80, fontSize: 12.5, color: 'var(--text-secondary)', border: 'none', outline: 'none', background: 'transparent' }} />
              </div>
              <MealSlots slots={m.slots} onToggle={(key, val) => onEditMedicine(i, { slots: { ...(m.slots || {}), [key]: val } })} />
            </div>
            {m.uncertain && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>● Please double-check this one</div>}
          </div>
        ))}
      </div>

      <PrimaryButton onClick={completing ? undefined : onComplete} style={completing ? { opacity: 0.6 } : undefined}>
        {completing ? 'Saving…' : completeLabel}
      </PrimaryButton>
    </div>
  );
}
