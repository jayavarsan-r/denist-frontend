'use client';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { useVisitStore } from '@/store/useVisitStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import Icon from '@/components/icons';
import { SheetHeader, SectionHeader, StatusChip, StageDots, EmptyState } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/utils';
import { currentStageIndex } from '@/lib/data/procedures';

export default function ProcedureDetailSheet({ params, onClose }) {
  const router = useRouter();
  const openSheet = useAppStore((s) => s.openSheet);
  const procedures = useClinicalStore((s) => s.procedures);
  const visits = useVisitStore((s) => s.visits);
  const proc = procedures.find(x => x.id === params.id);
  if (!proc) return null;
  const procVisits = visits.filter(v => v.procedureId === proc.id).sort((a, b) => (a.date).localeCompare(b.date));
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={proc.type + (proc.tooth ? ' · Tooth ' + proc.tooth : '')} onClose={onClose} right={<StatusChip status={proc.status} />} />
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <StageDots stages={proc.stages} currentIndex={currentStageIndex(proc)} />
        <div className="t-meta" style={{ marginTop: 10 }}>{proc.completedVisits} of {proc.estimatedVisits} visits · {formatCurrency(proc.estimatedCost)} estimated</div>
      </div>
      <SectionHeader>Stages</SectionHeader>
      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        {proc.stages.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 46, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: s.completed ? 'var(--accent)' : '#fff', border: s.completed ? 'none' : '1.5px solid rgba(60,60,67,0.25)' }}>{s.completed && <Icon name="check" size={12} color="var(--accent-ink)" stroke={3} />}</div>
            <span style={{ fontSize: 15, fontWeight: i === currentStageIndex(proc) ? 600 : 400, color: s.completed ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{s.name}</span>
          </div>
        ))}
      </div>
      <SectionHeader>Visits</SectionHeader>
      {procVisits.length === 0 ? <div className="card"><EmptyState icon="calendar" title="No visits logged" /></div> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {procVisits.map((v, i) => (
            <button key={v.id} onClick={() => { onClose(); router.push('/patients/' + (v.patientId || proc.patientId)); }} className="rowtap" style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid var(--border-light)' : 'none', textAlign: 'left' }}>
              <span className="t-meta" style={{ width: 56 }}>{formatDate(v.date)}</span>
              <span style={{ flex: 1, fontSize: 14 }}>Visit {v.visitNumber} of {v.totalVisits}</span>
              <StatusChip status={v.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
