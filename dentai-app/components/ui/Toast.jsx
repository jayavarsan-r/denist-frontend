'use client';

/* toast */
function Toast({ message }) {
  if (!message) return null;
  return (
    <div key={message} style={{
      position: 'absolute', bottom: 96, left: '50%', zIndex: 300,
      background: 'rgba(28,28,30,0.94)', color: '#fff', fontSize: 14, fontWeight: 600,
      padding: '12px 18px', borderRadius: 14, boxShadow: 'var(--elevation-2)',
      animation: 'toastUp 2.4s ease forwards', whiteSpace: 'nowrap',
      backdropFilter: 'blur(10px)', maxWidth: '88%',
    }}>{message}</div>
  );
}

export default Toast;
