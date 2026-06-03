'use client';

/* bottom sheet — renders inside the device (absolute) */
function BottomSheet({ open, onClose, children, dismissable = true, maxHeight = '92%' }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div className="scrim" onClick={dismissable ? onClose : undefined}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)' }} />
      <div className="sheet-anim" style={{
        position: 'relative', background: 'var(--bg)', borderRadius: '20px 20px 0 0',
        maxHeight, display: 'flex', flexDirection: 'column', boxShadow: 'var(--elevation-2)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 2px', flexShrink: 0 }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'rgba(60,60,67,0.22)' }} />
        </div>
        <div className="scroll" style={{ overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

export default BottomSheet;
