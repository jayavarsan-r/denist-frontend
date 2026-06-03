'use client';
import React from 'react';

/* progress stepper dots for procedure stages */
function StageDots({ stages, currentIndex }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      {stages.map((s, i) => {
        const done = s.completed;
        const current = i === currentIndex;
        return (
          <React.Fragment key={i}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
              background: done ? 'var(--accent)' : current ? '#fff' : '#fff',
              border: done ? '1.5px solid var(--accent)' : current ? '2px solid var(--blue)' : '1.5px solid rgba(60,60,67,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {current && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--blue)' }} />}
            </div>
            {i < stages.length - 1 && <div style={{ flex: 1, height: 1.5, background: done ? 'var(--accent)' : 'rgba(60,60,67,0.18)' }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default StageDots;
