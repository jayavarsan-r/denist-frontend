'use client';
import { useAppStore } from '@/store/useAppStore';
import { usePatientStore } from '@/store/usePatientStore';
import { useQueueStore } from '@/store/useQueueStore';
import { useRouter } from 'next/navigation';
import Icon from '@/components/icons';
import { SheetHeader } from '@/components/ui';

function TokenBadge({ n, tone }) {
  const c = tone === 'amber' ? { bg: 'rgba(255,159,10,0.16)', fg: '#C77700' } : tone === 'teal' ? { bg: 'rgba(50,173,230,0.16)', fg: '#1B86B8' } : { bg: 'rgba(60,60,67,0.08)', fg: 'var(--text-secondary)' };
  return (
    <div style={{ width: 38, height: 38, borderRadius: 11, background: c.bg, color: c.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 }}>
      <span style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: '0.04em' }}>TOK</span>
      <span className="tnum" style={{ fontSize: 16, fontWeight: 700 }}>{n}</span>
    </div>
  );
}

export default function QueueActionsSheet({ params, onClose }) {
  const openSheet = useAppStore((s) => s.openSheet);
  const queue = useQueueStore((s) => s.queue);
  const callIn = useQueueStore((s) => s.callIn);
  const patients = usePatientStore((s) => s.patients);
  const router = useRouter();
  const e = queue.find(x => x.id === params.id);
  const p = e && patients.find(x => x.id === e.patientId);
  if (!e || !p) return null;
  const free = !queue.some(x => x.status === 'in_consultation');
  const Action = ({ icon, label, hint, color, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px', borderRadius: 16, background: 'var(--surface)', boxShadow: 'var(--elevation-1)', textAlign: 'left', opacity: disabled ? 0.45 : 1, marginBottom: 10 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: color === 'var(--red)' ? 'rgba(255,59,48,0.10)' : color === 'var(--accent)' ? 'var(--accent)' : 'rgba(60,60,67,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={22} color={color === 'var(--accent)' ? 'var(--accent-ink)' : color} stroke={2} />
      </div>
      <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 600, color: color === 'var(--red)' ? 'var(--red)' : 'var(--text-primary)' }}>{label}</div>{hint && <div className="t-meta">{hint}</div>}</div>
    </button>
  );
  return (
    <div style={{ padding: '0 20px 28px' }}>
      <SheetHeader title={p.name} onClose={onClose} right={<TokenBadge n={e.tokenNumber} tone={e.priority === 'urgent' ? 'amber' : 'neutral'} />} />
      <div className="t-meta" style={{ marginTop: -6, marginBottom: 16 }}>{e.chiefComplaint}</div>
      <Action icon="chevRight" label="Call in now" hint={free ? 'Send to the doctor' : 'Doctor is busy — finish current consult first'} color="var(--accent)" disabled={!free} onClick={() => { callIn(e.id); onClose(); }} />
      <Action icon="person" label="View profile" hint="History, teeth, billing" color="var(--text-primary)" onClick={() => { onClose(); router.push('/patients/' + p.id); }} />
      <Action icon="x" label="Remove from queue" hint="Take out of today's list" color="var(--red)" onClick={() => { onClose(); openSheet('removeQueue', { id: e.id, name: p.name }); }} />
    </div>
  );
}
