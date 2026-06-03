'use client';
import Icon from '@/components/icons';

function SheetHeader({ title, onClose, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 14px' }}>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</span>
      {right || (onClose && <button onClick={onClose} style={{ color: 'var(--text-secondary)', display: 'flex' }}><Icon name="x" size={24} /></button>)}
    </div>
  );
}

export default SheetHeader;
