'use client';
import { useAppStore } from '@/store/useAppStore';
import { useClinicalStore } from '@/store/useClinicalStore';
import { SheetHeader, StatusChip, PrimaryButton } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/data/utils';

export default function LabDetailSheet({ params, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const labOrders = useClinicalStore((s) => s.labOrders);
  const markLabReceived = useClinicalStore((s) => s.markLabReceived);
  const o = labOrders.find(x => x.id === params.id);
  if (!o) return null;
  const margin = o.chargedToPatient - o.costToClinic;
  const Row = ({ k, v }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--border-light)' }}><span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>{k}</span><span className="tnum" style={{ fontSize: 15, fontWeight: 600 }}>{v}</span></div>;
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={o.labName} onClose={onClose} right={<StatusChip status={o.status} />} />
      <div className="t-meta" style={{ marginTop: -6, marginBottom: 14 }}>{o.patientName}{o.toothNumber ? ' · Tooth ' + o.toothNumber : ''}</div>
      <div className="card" style={{ padding: '4px 16px', marginBottom: 16 }}>
        <Row k="Work" v={o.workDescription} /><Row k="Shade" v={o.shade} /><Row k="Impression" v={o.impressionType} />
        <Row k="Sent" v={formatDate(o.sentDate)} /><Row k="Expected" v={formatDate(o.expectedReturnDate)} />
        <Row k="Lab cost" v={formatCurrency(o.costToClinic)} /><Row k="Patient billed" v={formatCurrency(o.chargedToPatient)} />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--border-light)' }}><span style={{ fontSize: 15, fontWeight: 600 }}>Margin</span><span className="tnum" style={{ fontSize: 15, fontWeight: 700, color: '#1E8E3E' }}>{formatCurrency(margin)}</span></div>
      </div>
      {o.status === 'sent' && <PrimaryButton onClick={() => { markLabReceived(o.id); onClose(); showToast('Marked received'); }}>Mark received</PrimaryButton>}
    </div>
  );
}
