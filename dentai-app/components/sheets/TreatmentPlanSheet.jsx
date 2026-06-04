'use client';
import { useState } from 'react';
import { usePatientStore } from '@/store/usePatientStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, Avatar } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/utils';

function SittingRow({ num, label, status, cost }) {
  const done = status === 'completed';
  const active = status === 'in_progress';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: num > 1 ? '1px solid var(--border-light)' : 'none' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: done ? 'var(--green)' : active ? 'var(--accent)' : 'rgba(60,60,67,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done
          ? <Icon name="check" size={14} color="#fff" stroke={2.5} />
          : <span style={{ fontSize: 12, fontWeight: 700, color: done ? '#fff' : active ? '#fff' : 'var(--text-secondary)' }}>{num}</span>
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{label || `Sitting ${num}`}</div>
        {status === 'in_progress' && <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>In progress</div>}
        {status === 'completed' && <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Completed</div>}
      </div>
      {cost > 0 && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{formatCurrency(cost)}</span>}
    </div>
  );
}

export default function TreatmentPlanSheet({ params, onClose }) {
  const { plan, patientId } = params || {};
  const patients = usePatientStore(s => s.patients);
  const p = patients.find(x => x.id === patientId);
  const [expanded, setExpanded] = useState(null);

  if (!plan) return null;

  const procedures = plan.procedures || plan.items || [];
  const totalCost = plan.totalCost || plan.estimated_cost || procedures.reduce((s, pr) => s + (pr.cost || pr.estimatedCost || 0), 0);
  const completedCount = procedures.filter(pr => pr.status === 'completed').length;
  const pct = procedures.length ? Math.round(completedCount / procedures.length * 100) : 0;

  return (
    <div style={{ padding: '0 20px 32px' }}>
      <SheetHeader
        title="Treatment Plan"
        onClose={onClose}
        right={<button style={{ color: 'var(--blue)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="share" size={16} color="var(--blue)" />Share</button>}
      />

      {/* patient chip */}
      {p && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={p.name} size={34} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{p.age} · {p.gender}</div>
          </div>
        </div>
      )}

      {/* plan title + progress */}
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>{plan.title || plan.procedure || 'Treatment Plan'}</div>
        {plan.diagnosis && <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>{plan.diagnosis}</div>}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total cost</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(totalCost)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sittings</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{plan.totalSittings || procedures.length || '—'}</div>
          </div>
          {plan.tooth && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tooth</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>#{plan.tooth}</div>
            </div>
          )}
        </div>
        {procedures.length > 0 && (
          <>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(60,60,67,0.1)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 3, transition: 'width .4s ease' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{completedCount} of {procedures.length} completed</div>
          </>
        )}
      </div>

      {/* sittings breakdown */}
      {procedures.length > 0 && (
        <>
          <SectionHeader>Procedure Breakdown</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
            {procedures.map((pr, i) => (
              <SittingRow
                key={pr.id || i}
                num={i + 1}
                label={pr.type || pr.name || pr.procedure}
                status={pr.status}
                cost={pr.cost || pr.estimatedCost || 0}
              />
            ))}
          </div>
        </>
      )}

      {/* sittings timeline if totalSittings provided but no procedures array */}
      {procedures.length === 0 && plan.totalSittings > 0 && (
        <>
          <SectionHeader>Sittings</SectionHeader>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
            {Array.from({ length: plan.totalSittings }, (_, i) => (
              <SittingRow
                key={i}
                num={i + 1}
                label={i === 0 ? 'Initial consultation & preparation' : i === plan.totalSittings - 1 ? 'Final review & finishing' : `Session ${i + 1}`}
                status={i < (plan.completedSittings || 0) ? 'completed' : i === (plan.completedSittings || 0) ? 'in_progress' : 'pending'}
                cost={i === plan.totalSittings - 1 ? totalCost * 0.3 : totalCost * 0.7 / (plan.totalSittings - 1)}
              />
            ))}
          </div>
        </>
      )}

      {/* cost breakdown */}
      <SectionHeader>Cost Summary</SectionHeader>
      <div className="card" style={{ padding: '8px 16px', marginBottom: 18 }}>
        {procedures.length > 0 ? procedures.map((pr, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{pr.type || pr.name}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(pr.cost || pr.estimatedCost || 0)}</span>
          </div>
        )) : (
          <div style={{ padding: '7px 0', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Estimated total</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCurrency(totalCost)}</span>
          </div>
        )}
        <div style={{ borderTop: '1.5px solid var(--border)', padding: '10px 0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Total</span>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{formatCurrency(totalCost)}</span>
        </div>
      </div>

      {/* patient instructions */}
      {(plan.instructions || plan.notes) && (
        <>
          <SectionHeader>Instructions for You</SectionHeader>
          <div className="card" style={{ padding: 14, marginBottom: 18 }}>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{plan.instructions || plan.notes}</div>
          </div>
        </>
      )}

      {/* share CTA */}
      <button style={{ width: '100%', height: 52, borderRadius: 16, background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Icon name="share" size={20} color="var(--accent-ink)" />
        Share plan with patient
      </button>
    </div>
  );
}
