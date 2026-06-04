'use client';
import { useState, useEffect } from 'react';

export default function IOSFrame({ children }) {
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const check = () => setIsWide(window.innerWidth >= 500);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!isWide) return children;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#111',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Phone shell */}
      <div style={{
        width: 402, height: 874,
        borderRadius: 48, overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 60px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 0 1.5px rgba(255,255,255,0.12)',
        transform: 'translateZ(0)', /* makes this the containing block for position:fixed children */
      }}>
        {/* Dynamic Island */}
        <div style={{
          position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
          width: 126, height: 37, borderRadius: 24, background: '#000', zIndex: 100,
          pointerEvents: 'none',
        }} />

        {/* Home indicator */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
          height: 34, display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
          paddingBottom: 8, pointerEvents: 'none',
        }}>
          <div style={{
            width: 139, height: 5, borderRadius: 100,
            background: 'rgba(0,0,0,0.3)',
          }} />
        </div>

        {/* App renders here — position:fixed children are contained by the transform above */}
        {children}
      </div>
    </div>
  );
}
