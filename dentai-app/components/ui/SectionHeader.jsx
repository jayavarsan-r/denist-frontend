'use client';

function SectionHeader({ children, right, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 4px 8px', ...style }}>
      <span className="t-section">{children}</span>
      {right}
    </div>
  );
}

export default SectionHeader;
